const assert = require('node:assert/strict');
const { test, after, beforeEach } = require('node:test');
const { createRequire } = require('node:module');
assert.equal(process.env.GCLOUD_PROJECT, 'demo-mystic-audit');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8085');
for (const key of ['IFTHENPAY_MBWAY_KEY', 'IFTHENPAY_CALLBACK_KEY']) process.env[key] = 'fake-audit-secret';
process.env.OWNER_EMAIL = 'owner@example.invalid';
process.env.PUBLIC_SITE_URL = 'http://127.0.0.1:3001';
const functionsRequire = createRequire(require.resolve('../functions/index.js'));
const f = require('../functions/index.js');
const db = functionsRequire('firebase-admin/firestore').getFirestore();
beforeEach(async () => { const limits = await db.collection('requestLimits').get(); const batch = db.batch(); limits.docs.forEach(doc => batch.delete(doc.ref)); await batch.commit(); });
after(async () => { await db.terminate(); await functionsRequire('firebase-admin/app').deleteApp(functionsRequire('firebase-admin/app').getApp()); });

const buyer = { uid: 'backend-audit-buyer', token: { email: 'buyer@example.invalid', name: 'Audit buyer' } };
const request = () => ({ auth: buyer, rawRequest: { ip: '127.0.0.1' }, data: {
  attemptId: require('node:crypto').randomUUID(),
  termsAccepted: true,
  termsVersion: '2026-09-10',
  paymentMethod: 'mbway', customer: { name: '<img src=x onerror=alert(1)>', email: 'buyer@example.invalid', phone: '912345678', address: 'Audit address', postal: '1000-001', city: 'Lisboa' },
  billing: { sameAsContact: true }, items: [{ productId: 'backend-audit', volume: '100ml', quantity: 1 }],
} });
const adminRequest = data => ({ auth: { uid: 'audit-admin', token: { admin: true } }, rawRequest: { ip: '127.0.0.2' }, data });
async function seed(stock = 5) {
  await db.doc('products/backend-audit').set({ name: { pt: 'Audit perfume', en: 'Audit perfume' }, brand: 'Audit', price: 100, tag: 'stock', variants: [{ volume: '100ml', price: 100, stock, soldout: stock === 0 }] });
}
function provider(t) {
  return t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.ifthenpay.com/spg/payment/mbway');
    const input = JSON.parse(options.body);
    return { ok: true, text: async () => JSON.stringify({ Status: '000', RequestId: `audit-${input.orderId}` }) };
  });
}
async function callback(query) {
  let status = 200, body;
  const response = { status(code) { status = code; return this; }, send(value) { body = value; return this; } };
  await f.ifthenpayCallback({ query, body: {}, method: 'GET' }, response);
  return { status, body };
}
test('checkout ignores forged totals, persists pending order and reserves stock on server', async (t) => {
  await seed(); const mock = provider(t);
  const input = request(); Object.assign(input.data, { total: 0.01, subtotal: 0.01, discount: 100, shipping: 0 });
  const result = await f.createCheckout.run(input);
  const order = (await db.doc(`orders/${result.orderId}`).get()).data();
  assert.equal(order.total, 100);
  assert.equal(order.paymentStatus, 'pending');
  assert.equal(order.customerUid, buyer.uid);
  assert.equal((await db.doc('products/backend-audit').get()).data().variants[0].stock, 4);
  assert.equal(JSON.parse(mock.mock.calls[0].arguments[1].body).amount, '100.00');
});
test('concurrent checkout cannot oversell the last unit', async (t) => {
  await seed(1); provider(t);
  const result = await Promise.allSettled([f.createCheckout.run(request()), f.createCheckout.run(request())]);
  assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await db.doc('products/backend-audit').get()).data().variants[0].stock, 0);
});
test('invalid quantities and zero-priced inventory cannot start payments', async (t) => {
  await seed(); const mock = provider(t);
  for (const value of [-1, 0, 1.5, 100, '1', NaN]) {
    const input = request(); input.data.items[0].quantity = value;
    await assert.rejects(f.createCheckout.run(input), { code: 'invalid-argument' });
  }
  await db.doc('products/backend-audit').update({ variants: [{ volume: '100ml', price: 0, stock: 5 }] });
  await assert.rejects(f.createCheckout.run(request()), { code: 'failed-precondition' });
  assert.equal(mock.mock.callCount(), 0);
});
test('callback rejects missing/wrong secrets, wrong amount and wrong request; accepts valid confirmation', async (t) => {
  await seed(); provider(t);
  const result = await f.createCheckout.run(request());
  const query = { key: 'fake-audit-secret', orderId: result.orderId, amount: result.amount, requestId: result.requestId };
  assert.equal((await callback({ ...query, key: '' })).status, 403);
  assert.equal((await callback({ ...query, key: 'wrong' })).status, 403);
  assert.equal((await callback({ ...query, amount: 0.01 })).status, 400);
  assert.equal((await callback({ ...query, requestId: 'wrong' })).status, 400);
  assert.equal((await callback({ ...query, requestId: '' })).status, 400);
  assert.equal((await db.doc(`orders/${result.orderId}`).get()).data().paymentStatus, 'pending');
  assert.equal((await callback(query)).status, 200);
  assert.equal((await db.doc(`orders/${result.orderId}`).get()).data().paymentStatus, 'paid');
});
test('replayed callback does not rewrite the original paid timestamp', async () => {
  await db.doc('orders/AUDITREPLAY').set({ total: 20, paymentStatus: 'paid', paidAt: '2026-01-01T00:00:00.000Z' });
  assert.equal((await callback({ key: 'fake-audit-secret', orderId: 'AUDITREPLAY', amount: 20 })).status, 200);
  assert.equal((await db.doc('orders/AUDITREPLAY').get()).data().paidAt, '2026-01-01T00:00:00.000Z');
});
test('paid checkout redeems 750 points, adds the surprise gift and earns points once', async (t) => {
  await seed(); provider(t);
  const loyaltyBuyer = { uid: 'loyalty-paid-buyer', token: { email: 'loyalty@example.invalid', name: 'Loyalty buyer' } };
  await db.doc(`profiles/${loyaltyBuyer.uid}`).set({ name: 'Loyalty buyer', email: loyaltyBuyer.token.email, loyaltyPoints: 750 });
  const input = request(); input.auth = loyaltyBuyer; input.data.loyaltyRewardId = 'points-750'; input.data.customer.email = loyaltyBuyer.token.email;
  const result = await f.createCheckout.run(input);
  const orderRef = db.doc(`orders/${result.orderId}`);
  const before = await orderRef.get();
  const pendingOrder = before.data();
  assert.equal(result.amount, 90);
  assert.equal(pendingOrder.loyaltyDiscountAmount, 10);
  assert.equal(pendingOrder.loyaltyPointsSpent, 750);
  assert.equal(pendingOrder.items.at(-1).loyaltyGift, true);
  assert.equal((await db.doc(`profiles/${loyaltyBuyer.uid}`).get()).data().loyaltyPoints, 0);
  assert.equal((await db.doc(`profiles/${loyaltyBuyer.uid}/loyaltyHistory/redeem-${result.orderId}`).get()).data().status, 'reserved');

  await callback({ key: 'fake-audit-secret', orderId: result.orderId, amount: result.amount, requestId: result.requestId });
  const after = await orderRef.get();
  const event = { data: { before, after }, params: { orderId: result.orderId } };
  await f.notifyCustomerOfPayment.run(event);
  await f.notifyCustomerOfPayment.run(event);
  const profile = (await db.doc(`profiles/${loyaltyBuyer.uid}`).get()).data();
  assert.equal(profile.loyaltyPoints, 90);
  assert.equal(profile.loyaltyLifetimePoints, 90);
  assert.equal((await db.doc(`profiles/${loyaltyBuyer.uid}/loyaltyHistory/earn-${result.orderId}`).get()).data().points, 90);
  assert.equal((await db.doc(`profiles/${loyaltyBuyer.uid}/loyaltyHistory/redeem-${result.orderId}`).get()).data().status, 'completed');
  const customerEmail = (await db.doc(`mail/order-${result.orderId}-paid`).get()).data().message.html;
  const ownerEmail = (await db.doc(`mail/order-${result.orderId}-owner-paid`).get()).data().message.html;
  assert.ok(customerEmail.includes('Pontos utilizados:</strong> 750'));
  assert.ok(customerEmail.includes('inclui 1 perfume surpresa de oferta'));
  assert.ok(ownerEmail.includes('Pontos utilizados:</strong> 750'));
  assert.ok(ownerEmail.includes('INCLUIR 1 PERFUME SURPRESA DE OFERTA NA ENCOMENDA'));
});
test('checkout rejects forged and insufficient rewards while allowing coupon stacking', async (t) => {
  await seed(); const mock = provider(t);
  const loyaltyBuyer = { uid: 'loyalty-invalid-buyer', token: { email: 'invalid-loyalty@example.invalid' } };
  await db.doc(`profiles/${loyaltyBuyer.uid}`).set({ email: loyaltyBuyer.token.email, loyaltyPoints: 99 });
  const insufficient = request(); insufficient.auth = loyaltyBuyer; insufficient.data.loyaltyRewardId = 'points-100';
  await assert.rejects(f.createCheckout.run(insufficient), { code: 'failed-precondition' });
  const forged = request(); forged.auth = loyaltyBuyer; forged.data.loyaltyRewardId = 'points-9999';
  await assert.rejects(f.createCheckout.run(forged), { code: 'invalid-argument' });
  await db.doc(`profiles/${loyaltyBuyer.uid}`).update({ loyaltyPoints: 100 });
  await db.doc('coupons/STACK5').set({ code: 'STACK5', discount: 5 });
  const stacked = request(); stacked.auth = loyaltyBuyer; stacked.data.loyaltyRewardId = 'points-100'; stacked.data.couponCode = 'STACK5';
  const result = await f.createCheckout.run(stacked);
  const order = (await db.doc(`orders/${result.orderId}`).get()).data();
  assert.equal(order.couponCode, 'STACK5');
  assert.equal(order.loyaltyRewardId, 'points-100');
  assert.equal(order.couponDiscountAmount, 5);
  assert.equal(order.loyaltyDiscountAmount, 5);
  assert.equal(order.discountAmount, 10);
  assert.equal(order.total, 90);
  assert.equal(mock.mock.callCount(), 1);
});
test('cancelled payment returns reserved loyalty points exactly once', async (t) => {
  await seed(); provider(t);
  const loyaltyBuyer = { uid: 'loyalty-release-buyer', token: { email: 'release-loyalty@example.invalid' } };
  await db.doc(`profiles/${loyaltyBuyer.uid}`).set({ email: loyaltyBuyer.token.email, loyaltyPoints: 100 });
  const input = request(); input.auth = loyaltyBuyer; input.data.loyaltyRewardId = 'points-100';
  const result = await f.createCheckout.run(input);
  assert.equal((await db.doc(`profiles/${loyaltyBuyer.uid}`).get()).data().loyaltyPoints, 0);
  const data = { orderId: result.orderId, evidence: 'Provider cancellation for loyalty test', providerCancellationConfirmed: true };
  await f.releaseCancelledPayment.run(adminRequest(data));
  await f.releaseCancelledPayment.run(adminRequest(data));
  assert.equal((await db.doc(`profiles/${loyaltyBuyer.uid}`).get()).data().loyaltyPoints, 100);
  assert.equal((await db.doc(`profiles/${loyaltyBuyer.uid}/loyaltyHistory/release-${result.orderId}`).get()).data().points, 100);
  assert.equal((await db.doc(`profiles/${loyaltyBuyer.uid}/loyaltyHistory/redeem-${result.orderId}`).get()).data().status, 'released');
});
test('late confirmations after stock release cannot silently enable fulfillment', async () => {
  await db.doc('orders/AUDITLATE').set({ total: 20, paymentStatus: 'failed', inventoryRestoredAt: '2026-01-01T00:00:00.000Z' });
  assert.equal((await callback({ key: 'fake-audit-secret', orderId: 'AUDITLATE', amount: 20 })).status, 409);
  assert.equal((await db.doc('orders/AUDITLATE').get()).data().paymentStatus, 'failed');
});
test('reviews require the buyer, confirmed payment and delivery; invalid ratings are refused', async () => {
  await seed();
  const input = { auth: buyer, data: { productId: 'backend-audit', rating: 5, comment: 'A verified test review.' } };
  await assert.rejects(f.submitReview.run({ data: input.data }), { code: 'unauthenticated' });
  for (const rating of [undefined, NaN, 0, 6, 3.2]) await assert.rejects(f.submitReview.run({ ...input, data: { ...input.data, rating } }), { code: 'invalid-argument' });
  await db.doc('orders/audit-review').set({ customerUid: buyer.uid, paymentStatus: 'pending', status: 'delivered', items: [{ productId: 'backend-audit' }] });
  await assert.rejects(f.submitReview.run(input), { code: 'permission-denied' });
  await db.doc('orders/audit-review').update({ paymentStatus: 'paid', status: 'received' });
  await assert.rejects(f.submitReview.run(input), { code: 'permission-denied' });
  await db.doc('orders/audit-review').update({ status: 'delivered' });
  const result = await f.submitReview.run(input);
  assert.equal((await db.doc(`reviews/${result.reviewId}`).get()).data().verifiedPurchase, true);
  assert.equal((await db.doc(`reviews/${result.reviewId}`).get()).data().comment, input.data.comment);
  await assert.rejects(f.submitReview.run({ ...input, auth: { uid: 'other-buyer', token: {} } }), { code: 'permission-denied' });
});
test('influencer assignment and paid-only commission persist; duplicate events cannot duplicate email records', async (t) => {
  await seed(); provider(t);
  await db.doc('profiles/backend-influencer').set({ name: 'Influencer', email: 'influencer@example.invalid' });
  await db.doc('coupons/AUDIT5').set({ code: 'AUDIT5', discount: 5 });
  await assert.rejects(f.setInfluencerAccount.run({ auth: buyer, data: { uid: 'backend-influencer', isInfluencer: true, couponCode: 'AUDIT5' } }), { code: 'permission-denied' });
  await f.setInfluencerAccount.run({ auth: { uid: 'audit-admin', token: { admin: true } }, data: { uid: 'backend-influencer', isInfluencer: true, couponCode: 'AUDIT5' } });
  assert.equal((await db.doc('profiles/backend-influencer').get()).data().influencerCouponCode, 'AUDIT5');
  assert.equal((await db.doc('coupons/AUDIT5').get()).data().influencerUid, 'backend-influencer');
  const input = request(); input.data.couponCode = 'AUDIT5';
  const result = await f.createCheckout.run(input);
  const orderRef = db.doc(`orders/${result.orderId}`);
  const before = await orderRef.get();
  await f.notifyOwnerOfOrder.run({ data: before, params: { orderId: result.orderId } });
  assert.equal((await db.doc(`influencerCouponUses/${result.orderId}`).get()).exists, false);
  await callback({ key: 'fake-audit-secret', orderId: result.orderId, amount: result.amount, requestId: result.requestId });
  const after = await orderRef.get();
  const event = { data: { before, after }, params: { orderId: result.orderId } };
  await f.notifyCustomerOfPayment.run(event);
  await f.notifyCustomerOfPayment.run(event);
  const commission = (await db.doc(`influencerCouponUses/${result.orderId}`).get()).data();
  assert.equal(commission.discountAmount, 5);
  assert.equal(commission.influencerUid, 'backend-influencer');
  const email = (await db.doc(`mail/order-${result.orderId}-paid`).get()).data();
  assert.deepEqual(email.to, ['buyer@example.invalid']);
  assert.ok(email.message.html.includes('&lt;img'));
  assert.ok(!email.message.html.includes('<img src=x'));
  assert.equal((await db.collection('mail').get()).docs.filter(d => d.id.startsWith(`order-${result.orderId}`)).length, 2);
});
test('restock subscription and notification queue persist without sending a real email', async () => {
  await seed(0);
  const result = await f.subscribeToRestock.run({ rawRequest: { ip: '127.0.0.1' }, auth: { uid: buyer.uid, token: { email: 'restock@example.invalid', email_verified: true } }, data: { productId: 'backend-audit', volume: '100ml', email: 'restock@example.invalid' } });
  assert.equal((await db.doc(`restockSubscriptions/${result.subscriptionId}`).get()).data().active, true);
  const before = await db.doc('products/backend-audit').get();
  await seed(2);
  const after = await db.doc('products/backend-audit').get();
  await f.notifyRestockSubscribers.run({ data: { before, after }, params: { productId: 'backend-audit' } });
  assert.equal((await db.doc(`restockSubscriptions/${result.subscriptionId}`).get()).data().active, false);
  assert.equal((await db.collection('mail').get()).docs.filter(d => d.id.startsWith(`restock-${result.subscriptionId}`)).length, 1);
});

test('retrying a checkout returns its original result without reserving twice', async t => {
  await seed(5); const mock = provider(t); const input = request();
  const first = await f.createCheckout.run(input);
  assert.deepEqual(await f.createCheckout.run(input), first);
  assert.equal(mock.mock.callCount(), 1);
  assert.equal((await db.doc('products/backend-audit').get()).data().variants[0].stock, 4);
  input.data.items[0].quantity = 2;
  await assert.rejects(f.createCheckout.run(input), { code: 'already-exists' });
});
test('simultaneous retries share one reservation and one provider request', async t => {
  await seed(5); const mock = provider(t); const input = request();
  const results = await Promise.allSettled([f.createCheckout.run(input), f.createCheckout.run(input)]);
  assert.ok(results.some(result => result.status === 'fulfilled'));
  assert.equal(mock.mock.callCount(), 1);
  assert.equal((await db.doc('products/backend-audit').get()).data().variants[0].stock, 4);
});
test('uncertain provider response retains stock and a retry cannot create another charge', async t => {
  await seed(5);
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('timeout'); });
  const input = request();
  await assert.rejects(f.createCheckout.run(input), { code: 'unavailable' });
  await assert.rejects(f.createCheckout.run(input), { code: 'failed-precondition' });
  assert.equal(mock.mock.callCount(), 1);
  assert.equal((await db.doc('products/backend-audit').get()).data().variants[0].stock, 4);
});
test('MB WAY provider-confirmed expiration restores stock once and preserves manual soldout', async t => {
  await seed(5); const mock = provider(t);
  const result = await f.createCheckout.run(request()); mock.mock.restore();
  await db.doc('products/backend-audit').update({ variants: [{ volume: '100ml', price: 100, stock: 4, soldout: true }] });
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(new URL(url).pathname, '/spg/payment/mbway/status');
    return { ok: true, json: async () => ({ RequestId: result.requestId, Status: '101' }) };
  });
  assert.equal((await f.reconcilePayment.run(adminRequest({ orderId: result.orderId }))).status, 'failed');
  await f.reconcilePayment.run(adminRequest({ orderId: result.orderId }));
  const product = (await db.doc('products/backend-audit').get()).data();
  assert.equal(product.variants[0].stock, 5); assert.equal(product.variants[0].soldout, true);
});
test('provider-verified MB WAY approval marks paid, never releases stock', async t => {
  await seed(5); const mock = provider(t); const result = await f.createCheckout.run(request()); mock.mock.restore();
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ RequestId: result.requestId, Status: '000' }) }));
  assert.equal((await f.reconcilePayment.run(adminRequest({ orderId: result.orderId }))).status, 'paid');
  await f.releaseCancelledPayment.run(adminRequest({ orderId: result.orderId, evidence: 'Fake cancellation evidence', providerCancellationConfirmed: true }));
  assert.equal((await db.doc('products/backend-audit').get()).data().variants[0].stock, 4);
});
test('unknown or mismatched provider state does not release inventory', async t => {
  await seed(5); const mock = provider(t); const result = await f.createCheckout.run(request()); mock.mock.restore();
  const response = { RequestId: result.requestId, Status: '999' };
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => response }));
  assert.equal((await f.reconcilePayment.run(adminRequest({ orderId: result.orderId }))).status, 'pending');
  response.RequestId = 'wrong'; response.Status = '101';
  await assert.rejects(f.reconcilePayment.run(adminRequest({ orderId: result.orderId })), { code: 'unavailable' });
  assert.equal((await db.doc('products/backend-audit').get()).data().variants[0].stock, 4);
});
test('manual release requires admin and evidence; duplicate release cannot add stock', async t => {
  await seed(5); provider(t); const result = await f.createCheckout.run(request());
  const data = { orderId: result.orderId, evidence: 'IFTHENPAY test cancellation receipt', providerCancellationConfirmed: true };
  await assert.rejects(f.releaseCancelledPayment.run({ auth: buyer, data }), { code: 'permission-denied' });
  await assert.rejects(f.releaseCancelledPayment.run(adminRequest({ orderId: result.orderId })), { code: 'invalid-argument' });
  await f.releaseCancelledPayment.run(adminRequest(data)); await f.releaseCancelledPayment.run(adminRequest(data));
  assert.equal((await db.doc('products/backend-audit').get()).data().variants[0].stock, 5);
});
test('checkout rate limits reject the ninth email/phone attempt before provider calls', async t => {
  await seed(50); const mock = provider(t);
  for (let i = 0; i < 8; i++) await f.createCheckout.run(request());
  await assert.rejects(f.createCheckout.run(request()), { code: 'resource-exhausted' });
  assert.equal(mock.mock.callCount(), 8);
});
test('shipping-zone spoofing is rejected before reserving inventory', async t => {
  await seed(); const mock = provider(t); const input = request(); input.data.customer.postal = '9000-001';
  await assert.rejects(f.createCheckout.run(input), { code: 'invalid-argument' });
  input.data.customer.postal = '28001';
  await assert.rejects(f.createCheckout.run(input), { code: 'invalid-argument' });
  assert.equal(mock.mock.callCount(), 0);
});
test('restock alerts reject anonymous, unverified and mismatched emails', async () => {
  await seed(0); const data = { productId: 'backend-audit', volume: '100ml', email: 'target@example.invalid' };
  await assert.rejects(f.subscribeToRestock.run({ data }), { code: 'unauthenticated' });
  await assert.rejects(f.subscribeToRestock.run({ auth: buyer, data }), { code: 'permission-denied' });
  await assert.rejects(f.subscribeToRestock.run({ auth: { ...buyer, token: { email: 'other@example.invalid', email_verified: true } }, data }), { code: 'permission-denied' });
});
test('bulk decant pricing updates settings and both product records preserving current stock', async () => {
  const variants = [{ volume: '100ml', price: 100, stock: 3 }, { volume: '2ml', price: 2, isDecant: true, stock: 7 }];
  await db.doc('products/bulk-audit').set({ price: 100, variants });
  await db.doc('products/decant-bulk-audit').set({ isDecant: true, variants: [variants[1]], price: 2 });
  const rules = [{ id: 'all', minPrice: 0, maxPrice: 9999, size: 2, price: 3.7 }];
  await assert.rejects(f.applyDecantPricing.run({ auth: buyer, data: { rules } }), { code: 'permission-denied' });
  await f.applyDecantPricing.run(adminRequest({ rules }));
  assert.deepEqual((await db.doc('settings/decants').get()).data().rules, rules);
  const product = (await db.doc('products/bulk-audit').get()).data();
  assert.equal(product.variants[1].price, 3.7); assert.equal(product.variants[1].stock, 7);
  assert.equal(product.variants[0].stock, 3);
  assert.equal((await db.doc('products/decant-bulk-audit').get()).data().price, 3.7);
  await assert.rejects(f.applyDecantPricing.run(adminRequest({ rules: [{ ...rules[0], price: -1 }] })), { code: 'invalid-argument' });
  assert.equal((await db.doc('products/decant-bulk-audit').get()).data().price, 3.7);
});

test('revoking all sessions requires a recent login and blocks further authenticated calls', async () => {
  await assert.rejects(f.revokeMySessions.run({ data: {} }), { code: 'unauthenticated' });
  await assert.rejects(f.revokeMySessions.run({ auth: buyer, data: {} }), { code: 'failed-precondition' });
  const user = await functionsRequire('firebase-admin/auth').getAuth().getUserByEmail('bob@example.invalid');
  const session = { uid: user.uid, token: { auth_time: Math.floor(Date.now() / 1000), email: user.email } };
  await f.revokeMySessions.run({ auth: session, data: {} });
  assert.equal(typeof (await db.doc(`sessionRevocations/${user.uid}`).get()).data().revokedAt, 'number');
  await assert.rejects(f.submitReview.run({ auth: session, data: {} }), { code: 'unauthenticated' });
  await db.doc(`sessionRevocations/${user.uid}`).delete();
});

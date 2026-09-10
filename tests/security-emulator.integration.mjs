import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, updateDoc, deleteDoc, getDocFromServer, getDocsFromServer, collection, query, where, terminate } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, ref, uploadBytes, getBytes } from 'firebase/storage';

// Never run this destructive test fixture against a real project.
assert.equal(process.env.GCLOUD_PROJECT, 'demo-mystic-audit');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8085');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9098');
const require = createRequire(new URL('../functions/index.js', import.meta.url));
const { initializeApp: initializeAdmin, deleteApp: deleteAdmin } = require('firebase-admin/app');
const { getFirestore: getAdminFirestore } = require('firebase-admin/firestore');
const { getAuth: getAdminAuth } = require('firebase-admin/auth');
const projectId = process.env.GCLOUD_PROJECT;
const adminApp = initializeAdmin({ projectId });
const server = getAdminFirestore(adminApp);
const serverAuth = getAdminAuth(adminApp);
const clients = [];
const password = 'Audit-only-Password!753';
let admin, alice, bob, reader, guest;

function client(name) {
  const app = initializeApp({ projectId, apiKey: 'fake-audit-key', storageBucket: `${projectId}.appspot.com` }, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8085);
  const storage = getStorage(app);
  connectStorageEmulator(storage, '127.0.0.1', 9198);
  const result = { app, auth, db, storage };
  clients.push(result);
  return result;
}
async function signup(name) {
  const c = client(name);
  c.email = `${name}@example.invalid`;
  c.uid = (await createUserWithEmailAndPassword(c.auth, c.email, password)).user.uid;
  return c;
}
async function denied(operation) {
  await assert.rejects(operation, (error) => /permission-denied|unauthorized/.test(error.code));
}
async function roundtrip(writer, observer, path, value) {
  await setDoc(doc(writer.db, path), value);
  assert.deepEqual((await getDocFromServer(doc(observer.db, path))).data(), value);
}
before(async () => {
  await fetch(`http://127.0.0.1:8085/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${projectId}/accounts`, { method: 'DELETE' });
  admin = await signup('admin');
  await serverAuth.setCustomUserClaims(admin.uid, { admin: true });
  await admin.auth.currentUser.getIdToken(true);
  alice = await signup('alice');
  bob = await signup('bob');
  reader = client('fresh-reader');
  await signInWithEmailAndPassword(reader.auth, alice.email, password);
  guest = client('guest');
  await server.doc(`profiles/${alice.uid}`).set({ name: 'Alice', email: alice.email });
  await server.doc(`profiles/${bob.uid}`).set({ name: 'Bob', email: bob.email });
  await server.doc(`profiles/${alice.uid}/loyaltyHistory/earn-audit`).set({ customerUid: alice.uid, orderId: 'alice-order', kind: 'earn', status: 'completed', points: 100, createdAt: '2026-01-01T00:00:00.000Z' });
  await server.doc('orders/alice-order').set({ customerUid: alice.uid, paymentStatus: 'paid', status: 'received', total: 100 });
  await server.doc('orders/bob-order').set({ customerUid: bob.uid, paymentStatus: 'pending', total: 90 });
  await server.doc('influencerCouponUses/alice-use').set({ influencerUid: alice.uid, discountAmount: 5 });
});
after(async () => {
  for (const c of clients) { await terminate(c.db); await deleteApp(c.app); }
  await server.terminate();
  await deleteAdmin(adminApp);
});

test('revoked sessions cannot access private data or upload even with an existing token', async () => {
  const claims = await alice.auth.currentUser.getIdTokenResult();
  await server.doc(`sessionRevocations/${alice.uid}`).set({ revokedAt: Number(claims.claims.auth_time) });
  await denied(getDocFromServer(doc(alice.db, `profiles/${alice.uid}`)));
  await denied(setDoc(doc(alice.db, `profiles/${alice.uid}/favoriteFolders/revoked`), { name: 'Denied' }));
  await denied(setDoc(doc(alice.db, `sessionRevocations/${alice.uid}`), { revokedAt: 0 }));
  await server.doc(`sessionRevocations/${alice.uid}`).delete();
  const adminClaims = await admin.auth.currentUser.getIdTokenResult();
  await server.doc(`sessionRevocations/${admin.uid}`).set({ revokedAt: Number(adminClaims.claims.auth_time) });
  await denied(uploadBytes(ref(admin.storage, 'products/audit/revoked.png'), new Uint8Array([137, 80, 78, 71]), { contentType: 'image/png' }));
  await server.doc(`sessionRevocations/${admin.uid}`).delete();
});

test('wrong password cannot sign in', async () => {
  await assert.rejects(signInWithEmailAndPassword(guest.auth, alice.email, 'wrong-password'));
  assert.equal(guest.auth.currentUser, null);
});
test('three sign-in/sign-out/account-switch cycles isolate private data', async () => {
  for (let i = 0; i < 3; i++) {
    await signInWithEmailAndPassword(reader.auth, alice.email, password);
    assert.equal((await getDocFromServer(doc(reader.db, `profiles/${alice.uid}`))).data().name, 'Alice');
    await signOut(reader.auth);
    assert.equal(reader.auth.currentUser, null);
    await denied(getDocFromServer(doc(reader.db, `profiles/${alice.uid}`)));
    await signInWithEmailAndPassword(reader.auth, bob.email, password);
    await denied(getDocFromServer(doc(reader.db, `profiles/${alice.uid}`)));
    assert.equal((await getDocFromServer(doc(reader.db, `profiles/${bob.uid}`))).data().name, 'Bob');
  }
  await signInWithEmailAndPassword(reader.auth, alice.email, password);
});
test('profile creation cannot self-assign roles or loyalty balances', async () => {
  const attacker = await signup('attacker');
  for (const extra of [{ isInfluencer: true }, { influencerCouponCode: 'CATARINA5' }, { admin: true }, { role: 'admin' }, { loyaltyPoints: 750 }]) {
    await denied(setDoc(doc(attacker.db, `profiles/${attacker.uid}`), { name: 'Attack', email: attacker.email, ...extra }));
  }
  await setDoc(doc(attacker.db, `profiles/${attacker.uid}`), { name: 'Safe', email: attacker.email });
});
test('own profile edits persist; role edits and other profiles are denied', async () => {
  await updateDoc(doc(alice.db, `profiles/${alice.uid}`), { phone: '912345678' });
  assert.equal((await getDocFromServer(doc(reader.db, `profiles/${alice.uid}`))).data().phone, '912345678');
  await denied(updateDoc(doc(alice.db, `profiles/${alice.uid}`), { isInfluencer: true }));
  await denied(updateDoc(doc(alice.db, `profiles/${alice.uid}`), { loyaltyPoints: 750 }));
  await denied(updateDoc(doc(alice.db, `profiles/${alice.uid}`), { email: bob.email }));
  await denied(getDocFromServer(doc(alice.db, `profiles/${bob.uid}`)));
  await denied(setDoc(doc(alice.db, `profiles/${bob.uid}`), { email: alice.email }));
  await denied(getDocsFromServer(collection(alice.db, 'profiles')));
});
test('loyalty history is private and server controlled', async () => {
  const path = `profiles/${alice.uid}/loyaltyHistory/earn-audit`;
  assert.equal((await getDocFromServer(doc(reader.db, path))).data().points, 100);
  await denied(getDocFromServer(doc(bob.db, path)));
  await denied(setDoc(doc(alice.db, `profiles/${alice.uid}/loyaltyHistory/forged`), { points: 1000 }));
});
test('favorites create/update/delete persist across independent clients', async () => {
  const path = `profiles/${alice.uid}/favoriteFolders/travel`;
  await roundtrip(alice, reader, path, { id: 'travel', name: 'Travel', productIds: ['sample'] });
  await roundtrip(alice, reader, path, { id: 'travel', name: 'Summer', productIds: [] });
  await denied(getDocFromServer(doc(bob.db, path)));
  await denied(deleteDoc(doc(bob.db, path)));
  await deleteDoc(doc(alice.db, path));
  assert.equal((await getDocFromServer(doc(reader.db, path))).exists(), false);
});
test('customers can read only their orders and cannot fake payments', async () => {
  assert.equal((await getDocFromServer(doc(alice.db, 'orders/alice-order'))).data().total, 100);
  await denied(getDocFromServer(doc(alice.db, 'orders/bob-order')));
  await denied(getDocsFromServer(collection(alice.db, 'orders')));
  assert.equal((await getDocsFromServer(query(collection(alice.db, 'orders'), where('customerUid', '==', alice.uid)))).size, 1);
  await denied(setDoc(doc(alice.db, 'orders/free-order'), { customerUid: alice.uid, paymentStatus: 'paid' }));
  await denied(updateDoc(doc(alice.db, 'orders/alice-order'), { paymentStatus: 'paid', total: 0 }));
});
test('admin fulfillment persists but cannot rewrite payment or customer ownership', async () => {
  await denied(updateDoc(doc(admin.db, 'orders/alice-order'), { status: 'shipped', trackingNumber: 'AUDIT123' }));
  await denied(updateDoc(doc(admin.db, 'orders/alice-order'), { status: 'shipped', trackingNumber: 'AUDIT123', trackingCarrier: 'unknown' }));
  await updateDoc(doc(admin.db, 'orders/alice-order'), { status: 'shipped', trackingNumber: 'AUDIT123', trackingCarrier: 'ctt' });
  const shippedOrder = (await getDocFromServer(doc(alice.db, 'orders/alice-order'))).data();
  assert.equal(shippedOrder.trackingNumber, 'AUDIT123');
  assert.equal(shippedOrder.trackingCarrier, 'ctt');
  await denied(updateDoc(doc(admin.db, 'orders/bob-order'), { paymentStatus: 'paid' }));
  await denied(updateDoc(doc(admin.db, 'orders/alice-order'), { total: 0 }));
  await denied(updateDoc(doc(admin.db, 'orders/alice-order'), { customerUid: bob.uid }));
});
test('catalogue create, edit and deletion persist on fresh public reads', async () => {
  await roundtrip(admin, guest, 'products/audit', { name: { pt: 'Audit perfume' }, price: 25, variants: [] });
  await roundtrip(admin, guest, 'products/audit', { name: { pt: 'Updated' }, price: 30, variants: [] });
  await deleteDoc(doc(admin.db, 'products/audit'));
  assert.equal((await getDocFromServer(doc(guest.db, 'products/audit'))).exists(), false);
});
for (const [path, data] of [
  ['brands/audit', { name: 'Audit' }],
  ['settings/decants', { rules: [{ id: 'rule', minPrice: 0, maxPrice: 50, size: 2, price: 1.9 }] }],
  ['settings/decantAvailability', { blockedSizes: [2, 10] }],
]) {
  test(`${path}: admin writes persist; public and customer writes fail`, async () => {
    await roundtrip(admin, guest, path, data);
    await denied(setDoc(doc(guest.db, path), data));
    await denied(setDoc(doc(alice.db, path), data));
  });
}
test('all three shipping zones persist and invalid settings are refused', async () => {
  const { DEFAULT_SHIPPING_SETTINGS } = await import('../functions/shipping.mjs');
  await roundtrip(admin, guest, 'settings/shipping', { zones: DEFAULT_SHIPPING_SETTINGS });
  await denied(setDoc(doc(admin.db, 'settings/shipping'), { zones: {} }));
  await denied(setDoc(doc(alice.db, 'settings/shipping'), { zones: DEFAULT_SHIPPING_SETTINGS }));
  await denied(setDoc(doc(admin.db, 'settings/decantAvailability'), { blockedSizes: [2, 2] }));
});
test('coupons persist only for admin, with no public list or customer writes', async () => {
  await setDoc(doc(admin.db, 'coupons/AUDIT5'), { code: 'AUDIT5', discount: 5 });
  assert.equal((await server.doc('coupons/AUDIT5').get()).data().discount, 5);
  await denied(getDocFromServer(doc(alice.db, 'coupons/AUDIT5')));
  await denied(getDocsFromServer(collection(guest.db, 'coupons')));
  await denied(setDoc(doc(alice.db, 'coupons/FREE'), { discount: 100 }));
  await deleteDoc(doc(admin.db, 'coupons/AUDIT5'));
  assert.equal((await server.doc('coupons/AUDIT5').get()).exists, false);
});
test('influencer records are private and cannot be forged', async () => {
  assert.equal((await getDocFromServer(doc(alice.db, 'influencerCouponUses/alice-use'))).data().discountAmount, 5);
  await denied(getDocFromServer(doc(bob.db, 'influencerCouponUses/alice-use')));
  await denied(setDoc(doc(alice.db, 'influencerCouponUses/forged'), { influencerUid: alice.uid, discountAmount: 1000 }));
});
for (const path of ['mail/audit', 'restockSubscriptions/audit', 'private/audit']) {
  test(`${path}: anonymous and customers cannot read or write`, async () => {
    for (const c of [guest, alice]) {
      await denied(getDocFromServer(doc(c.db, path)));
      await denied(setDoc(doc(c.db, path), { value: 'attack' }));
    }
  });
}
test('reviews are public but no client can forge a verified purchase', async () => {
  await server.doc('reviews/audit').set({ comment: '<img src=x onerror=alert(1)>', verifiedPurchase: true });
  assert.equal((await getDocFromServer(doc(guest.db, 'reviews/audit'))).data().verifiedPurchase, true);
  for (const c of [guest, alice, admin]) await denied(setDoc(doc(c.db, 'reviews/forged'), { verifiedPurchase: true }));
});
test('images upload only for admin and persist as exact bytes', async () => {
  const data = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  await uploadBytes(ref(admin.storage, 'products/audit/image.png'), data, { contentType: 'image/png' });
  assert.deepEqual(new Uint8Array(await getBytes(ref(guest.storage, 'products/audit/image.png'))), data);
  for (const c of [guest, alice]) await denied(uploadBytes(ref(c.storage, 'products/audit/attack.png'), data, { contentType: 'image/png' }));
  await denied(uploadBytes(ref(admin.storage, 'products/audit/attack.svg'), new TextEncoder().encode('<svg onload="alert(1)"/>'), { contentType: 'image/svg+xml' }));
});

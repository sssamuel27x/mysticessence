const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createRequire } = require("node:module");
const functionsRequire = createRequire(require.resolve("../functions/index.js"));
const { createCheckout } = require("../functions/index.js");
const { getFirestore } = functionsRequire("firebase-admin/firestore");
const { HttpsError } = functionsRequire("firebase-functions/v2/https");
const db = getFirestore();

function checkoutRequest(phone, paymentMethod = "mbway") {
  return { data: {
    paymentMethod,
    customer: {
      name: "Checkout Test", email: "checkout@example.invalid", phone,
      address: "Test address", postal: "1000-001", city: "Lisboa",
    },
    billing: { sameAsContact: true },
    items: [{ productId: "test-perfume", volume: "100ml", quantity: 2 }],
  } };
}

// All persistence and provider calls are replaced; no credentials or network are used.
function setup(t, providerResponse = { Status: "000", RequestId: "test-request" }) {
  const documents = new Map([["products/test-perfume", {
    name: "Test perfume", brand: "Test", tag: "stock",
    variants: [{ volume: "100ml", price: 10, stock: 5, soldout: false }],
  }]]);
  const collection = t.mock.method(db, "collection", (name) => ({
    doc: (id) => ({
      path: `${name}/${id}`,
      update: async (data) => documents.set(`${name}/${id}`, { ...documents.get(`${name}/${id}`), ...data }),
    }),
  }));
  const transaction = t.mock.method(db, "runTransaction", async (callback) => callback({
    get: async (ref) => ({ exists: documents.has(ref.path), data: () => structuredClone(documents.get(ref.path)) }),
    set: (ref, data) => documents.set(ref.path, data),
    update: (ref, data) => documents.set(ref.path, { ...documents.get(ref.path), ...data }),
  }));
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    if (providerResponse instanceof Error) throw providerResponse;
    return { ok: true, text: async () => JSON.stringify(providerResponse) };
  });
  t.mock.method(console, "error", () => {});
  const keys = ["IFTHENPAY_MBWAY_KEY", "IFTHENPAY_CARD_KEY"];
  for (const key of keys) {
    const previous = process.env[key];
    process.env[key] = "test-only-not-a-real-key";
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  return { documents, collection, transaction, fetch };
}

for (const phone of [undefined, "", "123", "91234567", "9123456789", "212345678", "+34 612345678", "invalid"]) {
  test(`invalid MB WAY phone ${String(phone)} fails before any side effect`, async (t) => {
    const state = setup(t);
    await assert.rejects(createCheckout.run(checkoutRequest(phone)), (error) => {
      assert.equal(error.code, "invalid-argument");
      assert.equal(error.httpErrorCode.status, 400);
      assert.match(error.message, /MB WAY/);
      return true;
    });
    assert.equal(state.collection.mock.callCount(), 0);
    assert.equal(state.transaction.mock.callCount(), 0);
    assert.equal(state.fetch.mock.callCount(), 0);
    assert.equal(state.documents.get("products/test-perfume").variants[0].stock, 5);
  });
}

for (const phone of ["912345678", "912 345 678", "+351 912 345 678", "00351 912345678", "351#912345678"]) {
  test(`valid MB WAY format ${phone} is sent in provider format`, async (t) => {
    const state = setup(t);
    const result = await createCheckout.run(checkoutRequest(phone));
    assert.equal(state.fetch.mock.callCount(), 1);
    const [url, options] = state.fetch.mock.calls[0].arguments;
    assert.equal(url, "https://api.ifthenpay.com/spg/payment/mbway");
    const payload = JSON.parse(options.body);
    assert.equal(payload.mobileNumber, "351#912345678");
    assert.equal(payload.amount, "24.90");
    assert.ok(payload.orderId.length <= 15);
    assert.equal(result.paymentStatus, "pending");
    assert.equal(result.requestId, "test-request");
    assert.equal(state.documents.get(`orders/${result.orderId}`).paymentInitiated, true);
    assert.equal(state.documents.get("products/test-perfume").variants[0].stock, 3);
  });
}

test("card checkout does not require a Portuguese mobile number", async (t) => {
  const state = setup(t, { Status: "0", RequestId: "test-card", PaymentUrl: "https://example.invalid/payment" });
  const result = await createCheckout.run(checkoutRequest("+34 612345678", "card"));
  assert.equal(result.method, "card");
  assert.equal(state.fetch.mock.callCount(), 1);
});

test("provider failure restores stock and remains a service error", async (t) => {
  const state = setup(t, new Error("Provider temporarily unavailable"));
  await assert.rejects(createCheckout.run(checkoutRequest("912345678")), { code: "unavailable" });
  assert.equal(state.documents.get("products/test-perfume").variants[0].stock, 5);
  const order = [...state.documents.entries()].find(([key]) => key.startsWith("orders/"))[1];
  assert.equal(order.paymentStatus, "failed");
  assert.equal(order.paymentInitiated, false);
  assert.ok(order.inventoryRestoredAt);
});

test("structured validation errors are not disguised as service outages", async (t) => {
  const state = setup(t, new HttpsError("invalid-argument", "Invalid payment details"));
  await assert.rejects(createCheckout.run(checkoutRequest("912345678")), { code: "invalid-argument" });
  assert.equal(state.documents.get("products/test-perfume").variants[0].stock, 5);
});

test("checkout charges the server carrier rate and records carrier details", async (t) => {
  const state = setup(t);
  const { DEFAULT_SHIPPING_SETTINGS } = await import('../functions/shipping.mjs');
  const zones = structuredClone(DEFAULT_SHIPPING_SETTINGS);
  zones.continental.carriers.push({ id: 'dhl', name: 'DHL', price: 5.9, description: '6-8 dias' });
  state.documents.set('settings/shipping', { zones });
  const request = checkoutRequest('912345678');
  Object.assign(request.data, { shippingCarrierId: 'dhl', expectedShipping: 5.9, shipping: 0 });
  const result = await createCheckout.run(request);
  const order = state.documents.get(`orders/${result.orderId}`);
  assert.equal(order.shipping, 5.9);
  assert.equal(order.total, 25.9);
  assert.equal(order.shippingCarrierName, 'DHL');
  assert.equal(order.shippingDescription, '6-8 dias');
  assert.equal(JSON.parse(state.fetch.mock.calls[0].arguments[1].body).amount, '25.90');
});

for (const scenario of ['deleted carrier', 'empty zone', 'stale quote']) {
  test(`${scenario} fails before stock, order or payment changes`, async (t) => {
    const state = setup(t);
    const { DEFAULT_SHIPPING_SETTINGS } = await import('../functions/shipping.mjs');
    const zones = structuredClone(DEFAULT_SHIPPING_SETTINGS);
    const request = checkoutRequest('912345678');
    if (scenario === 'deleted carrier') request.data.shippingCarrierId = 'missing';
    if (scenario === 'empty zone') zones.continental.carriers = [];
    if (scenario === 'stale quote') request.data.expectedShipping = 1;
    state.documents.set('settings/shipping', { zones });
    await assert.rejects(createCheckout.run(request), { code: 'failed-precondition' });
    assert.equal(state.fetch.mock.callCount(), 0);
    assert.equal(state.documents.get('products/test-perfume').variants[0].stock, 5);
    assert.equal([...state.documents.keys()].filter(key => key.startsWith('orders/')).length, 0);
  });
}

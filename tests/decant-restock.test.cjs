const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRequire } = require('node:module');
const functionsRequire = createRequire(require.resolve('../functions/index.js'));
const { subscribeToRestock, notifyGlobalDecantRestock, notifyRestockSubscribers } = require('../functions/index.js');
const db = functionsRequire('firebase-admin/firestore').getFirestore();

// In-memory Firestore only: no real subscriptions, emails or products are changed.
function setup(t, blockedSizes = [2]) {
  const product = { name: { pt: 'Teste' }, tag: 'stock', variants: [
    { volume: '2ml', isDecant: true, stock: 5 },
    { volume: '5ml', isDecant: true, stock: 0 },
  ] };
  const documents = new Map([
    ['products/test', product],
    ['settings/decantAvailability', { blockedSizes }],
    ['restockSubscriptions/sub', { productId: 'test', volume: '2ml', email: 'test@example.invalid', active: true }],
    ['restockSubscriptions/empty', { productId: 'test', volume: '5ml', email: 'test@example.invalid', active: true }],
  ]);
  const snapshot = (path) => ({ id: path.split('/').pop(), exists: documents.has(path), data: () => structuredClone(documents.get(path)), ref: ref(path) });
  const ref = (path) => ({
    get: async () => snapshot(path),
    set: async (data) => documents.set(path, data),
    update: async (data) => documents.set(path, { ...documents.get(path), ...data }),
    create: async (data) => documents.set(path, data),
  });
  t.mock.method(db, 'collection', (name) => ({
    doc: (id) => ref(`${name}/${id}`),
    where: (field, _operator, value) => ({ get: async () => ({ docs: [...documents.keys()].filter((path) => path.startsWith(`${name}/`) && documents.get(path)[field] === value).map(snapshot) }) }),
  }));
  return { documents, product, mail: () => [...documents.keys()].filter((key) => key.startsWith('mail/')) };
}

test('a globally unavailable decant accepts a restock subscription', async (t) => {
  const state = setup(t);
  await subscribeToRestock.run({ data: { productId: 'test', volume: '2ml', email: 'new@example.invalid' } });
  assert.ok([...state.documents.values()].some((value) => value.email === 'new@example.invalid' && value.active));
});

test('releasing a size notifies only physically available decants', async (t) => {
  const state = setup(t, []);
  await notifyGlobalDecantRestock.run({ data: { before: { data: () => ({ blockedSizes: [2, 5] }) }, after: { data: () => ({ blockedSizes: [] }) } } });
  assert.equal(state.mail().length, 1);
  assert.equal(state.documents.get('restockSubscriptions/sub').active, false);
  assert.equal(state.documents.get('restockSubscriptions/empty').active, true);
});

test('delayed release events cannot notify a size blocked again', async (t) => {
  const state = setup(t, [2]);
  await notifyGlobalDecantRestock.run({ data: { before: { data: () => ({ blockedSizes: [2] }) }, after: { data: () => ({ blockedSizes: [] }) } } });
  assert.equal(state.mail().length, 0);
});

test('individual stock restoration cannot send email during a global block', async (t) => {
  const state = setup(t);
  const before = { ...state.product, variants: state.product.variants.map((variant) => ({ ...variant, stock: 0, soldout: true })) };
  await notifyRestockSubscribers.run({ params: { productId: 'test' }, data: { before: { data: () => before }, after: { data: () => state.product } } });
  assert.equal(state.mail().length, 0);
});

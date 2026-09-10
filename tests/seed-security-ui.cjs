const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
assert.equal(process.env.GCLOUD_PROJECT, 'demo-mystic-audit');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8085');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9098');
const localRequire = createRequire(path.resolve('functions/index.js'));
const app = localRequire('firebase-admin/app').initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = localRequire('firebase-admin/firestore').getFirestore(app);
const auth = localRequire('firebase-admin/auth').getAuth(app);

async function main() {
  if (process.argv[2] === 'revoke-alice') {
    const user = await auth.getUserByEmail('alice@example.invalid');
    await db.doc(`sessionRevocations/${user.uid}`).set({ revokedAt: Math.floor(Date.now() / 1000) });
    console.log('Revoked disposable Alice browser session');
    return;
  }
  const users = {};
  for (const name of ['admin', 'alice', 'bob']) {
    const email = `${name}@example.invalid`;
    const user = await auth.createUser({ email, password: 'Audit-only-Password!753', displayName: name, emailVerified: name !== 'bob' });
    if (name === 'admin') await auth.setCustomUserClaims(user.uid, { admin: true });
    await db.doc(`profiles/${user.uid}`).set({ name, email });
    users[name] = user.uid;
  }
  const product = {
    id: '9pm', name: { pt: '9PM', en: '9PM' }, brand: 'Afnan', category: 'Masculinos', audiences: ['men'],
    scentProfile: 'sweet', tag: 'stock', isNew: true, bestSeller: true, price: 40, volume: '100ml',
    variants: [{ volume: '100ml', price: 40, stock: 3 }, { volume: '2ml', price: 2, isDecant: true, stock: 10 }],
    family: { pt: 'Doce', en: 'Sweet' }, desc: { pt: 'Produto de teste local.', en: 'Local test product.' },
    notes: { top: { pt: [], en: [] }, heart: { pt: [], en: [] }, base: { pt: [], en: [] } },
    color: '#4d3611', accent: '#d9ae4b', mood: 'custom', imageUrl: '/products/9pm.webp',
  };
  await db.doc('products/9pm').set(product);
  const baseOrder = {
    createdAt: new Date().toISOString(), customerUid: users.alice,
    customer: { name: 'alice', email: 'alice@example.invalid', phone: '912345678', address: 'Test street', postal: '1000-001', city: 'Lisboa', notes: '' },
    items: [{ id: '9pm', productId: '9pm', name: product.name, volume: '100ml', price: 40, qty: 1 }],
    subtotal: 40, shipping: 4.9, total: 44.9, status: 'received', archived: false, payment: 'ifthenpay', paymentMethod: 'mbway',
  };
  await db.doc('orders/LOCALPAID').set({ ...baseOrder, paymentStatus: 'paid' });
  await db.doc('orders/LOCALPENDING').set({ ...baseOrder, paymentStatus: 'pending', reconciliationRequired: true });
  console.log('Seeded disposable browser accounts, one product, one paid and one pending order');
}
main().finally(async () => { await db.terminate(); await localRequire('firebase-admin/app').deleteApp(app); });

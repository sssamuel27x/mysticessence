import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { connectAuthEmulator } from 'firebase/auth';
import { connectFirestoreEmulator, terminate } from 'firebase/firestore';
import { deleteApp } from 'firebase/app';

assert.equal(process.env.GCLOUD_PROJECT, 'demo-mystic-audit');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8085');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9098');
const require = createRequire(new URL('../functions/index.js', import.meta.url));
const adminApp = require('firebase-admin/app').initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = require('firebase-admin/firestore').getFirestore(adminApp);
const auth = require('firebase-admin/auth').getAuth(adminApp);
const outfile = resolve('tmp/security-client-runtime.mjs');
const values = { FIREBASE_API_KEY: 'fake-audit-key', FIREBASE_AUTH_DOMAIN: 'demo-mystic-audit.firebaseapp.com', FIREBASE_PROJECT_ID: 'demo-mystic-audit', FIREBASE_STORAGE_BUCKET: 'demo-mystic-audit.appspot.com', FIREBASE_MESSAGING_SENDER_ID: '123', FIREBASE_APP_ID: 'audit-local', RECAPTCHA_ENTERPRISE_SITE_KEY: '', FIREBASE_ADMIN_UID: '', FIREBASE_FUNCTIONS_REGION: 'europe-west1', PAYMENTS_ENABLED: 'false', STORAGE_ENABLED: 'false' };
let client;
before(async () => {
  await build({ entryPoints: ['app/firebase.ts'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', define: Object.fromEntries(Object.entries(values).map(([key, value]) => [`import.meta.env.VITE_${key}`, JSON.stringify(value)])) });
  client = await import(pathToFileURL(outfile));
  assert.equal(client.database.app.options.projectId, 'demo-mystic-audit');
  connectAuthEmulator(client.auth, 'http://127.0.0.1:9098', { disableWarnings: true });
  connectFirestoreEmulator(client.database, '127.0.0.1', 8085);
});
after(async () => {
  if (client) { await client.logoutFirebase(); await terminate(client.database); await deleteApp(client.database.app); }
  await db.terminate(); await require('firebase-admin/app').deleteApp(adminApp); await rm(outfile, { force: true });
});
const password = 'Audit-only-Password!753';
test('actual login helper preserves edited profile names across repeated logins', async () => {
  const user = await auth.getUserByEmail('alice@example.invalid');
  await db.doc(`profiles/${user.uid}`).update({ name: 'Alice edited name' });
  for (let i = 0; i < 3; i++) {
    await client.loginWithEmail('alice@example.invalid', password);
    assert.equal((await db.doc(`profiles/${user.uid}`).get()).data().name, 'Alice edited name');
    await client.logoutFirebase(); assert.equal(client.auth.currentUser, null);
  }
});
test('actual product group saves both documents and rejects stale inventory edits', async () => {
  await client.loginWithEmail('admin@example.invalid', password);
  const product = { id: 'client-product', name: { pt: 'Client test' }, price: 10, variants: [{ volume: '100ml', price: 10, stock: 2 }] };
  const decant = { ...product, id: 'decant-client-product', isDecant: true };
  await client.saveProductGroup(product, decant, null);
  assert.equal((await db.doc('products/client-product').get()).exists, true);
  assert.equal((await db.doc('products/decant-client-product').get()).exists, true);
  const expected = (await db.doc('products/client-product').get()).data();
  await db.doc('products/client-product').update({ variants: [{ volume: '100ml', price: 10, stock: 1 }] });
  await assert.rejects(client.saveProductGroup({ ...product, price: 12 }, { ...decant, price: 12 }, expected), /stock mudou/);
  assert.equal((await db.doc('products/decant-client-product').get()).data().price, 10);
  const fresh = (await db.doc('products/client-product').get()).data();
  await client.saveProductGroup(fresh, null, fresh);
  assert.equal((await db.doc('products/decant-client-product').get()).exists, false);
  await client.removeProduct(product.id);
  assert.equal((await db.doc('products/client-product').get()).exists, false);
});
test('catalogue seeding never overwrites existing stock', async () => {
  const existing = { id: 'seed-preserve', price: 50, stock: 1 };
  await db.doc('products/seed-preserve').set(existing);
  await client.seedProducts([{ ...existing, stock: 999 }, { id: 'seed-new', price: 30 }]);
  assert.equal((await db.doc('products/seed-preserve').get()).data().stock, 1);
  assert.equal((await db.doc('products/seed-new').get()).data().price, 30);
});
test('multiple product audiences persist for the bottle and decants across logins and protect concurrent category edits', async () => {
  await client.logoutFirebase();
  await client.loginWithEmail('admin@example.invalid', password);
  let product = { id: 'client-categories', name: { pt: 'Multi-category test' }, category: 'Unissexo', audiences: ['women', 'unisex'], price: 40, variants: [{ volume: '100ml', price: 40, stock: 2 }] };
  const mirror = value => ({ ...value, id: 'decant-client-categories', isDecant: true, variants: [{ volume: '5ml', price: 5, isDecant: true }] });
  await client.saveProductGroup(product, mirror(product), null);
  await client.logoutFirebase();
  await client.loginWithEmail('admin@example.invalid', password);
  for (const id of ['client-categories', 'decant-client-categories']) {
    assert.deepEqual((await db.doc(`products/${id}`).get()).data().audiences, ['women', 'unisex']);
  }
  const before = (await db.doc('products/client-categories').get()).data();
  product = { ...before, category: 'Femininos', audiences: ['women'] };
  await client.saveProductGroup(product, mirror(product), before);
  const stale = (await db.doc('products/client-categories').get()).data();
  await db.doc('products/client-categories').update({ audiences: ['men', 'women'] });
  await assert.rejects(client.saveProductGroup(product, mirror(product), stale), /mudou/);
  assert.deepEqual((await db.doc('products/decant-client-categories').get()).data().audiences, ['women']);
  assert.deepEqual((await db.doc('products/client-categories').get()).data().audiences, ['men', 'women']);
  await client.removeProduct(product.id);
});
test('coupon creation cannot overwrite an influencer assignment; linked deletion is refused', async () => {
  await client.saveCoupon('CLIENT5', { code: 'CLIENT5', discount: 5 });
  await db.doc('coupons/CLIENT5').update({ influencerUid: 'influencer' });
  await assert.rejects(client.saveCoupon('CLIENT5', { code: 'CLIENT5', discount: 50 }), /já existe/);
  await assert.rejects(client.removeCoupon('CLIENT5'), /associação/);
  assert.equal((await db.doc('coupons/CLIENT5').get()).data().discount, 5);
});
test('actual favorite helper persists to Firebase and rejects writes to another account', async () => {
  await client.logoutFirebase(); await client.loginWithEmail('alice@example.invalid', password);
  const uid = client.auth.currentUser.uid;
  const folder = { id: 'client-folder', name: 'Private', productIds: ['client-product'] };
  await client.saveFavoriteFolders(uid, [folder]);
  assert.deepEqual((await db.doc(`profiles/${uid}/favoriteFolders/client-folder`).get()).data(), folder);
  await db.doc(`profiles/${uid}/favoriteFolders/client-folder`).update({ name: 'Edited on another device' });
  await assert.rejects(client.saveFavoriteFolders(uid, [{ ...folder, name: 'Stale edit' }], [folder]), /noutro dispositivo/);
  assert.equal((await db.doc(`profiles/${uid}/favoriteFolders/client-folder`).get()).data().name, 'Edited on another device');
  const bob = await auth.getUserByEmail('bob@example.invalid');
  await assert.rejects(client.saveFavoriteFolders(bob.uid, [folder]), { code: 'permission-denied' });
  await client.deleteFavoriteFolder(uid, folder.id);
  assert.equal((await db.doc(`profiles/${uid}/favoriteFolders/client-folder`).get()).exists, false);
});
test('password reset and email verification generate local emulator messages only', async () => {
  await client.requestPasswordReset('alice@example.invalid');
  await client.requestEmailVerification();
  const response = await fetch('http://127.0.0.1:9098/emulator/v1/projects/demo-mystic-audit/oobCodes');
  const { oobCodes } = await response.json();
  assert.ok(oobCodes.some(code => code.email === 'alice@example.invalid' && code.requestType === 'PASSWORD_RESET'));
  assert.ok(oobCodes.some(code => code.email === 'alice@example.invalid' && code.requestType === 'VERIFY_EMAIL'));
});

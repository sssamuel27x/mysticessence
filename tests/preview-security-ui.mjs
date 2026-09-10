// Real application/SDK against local demo emulators. Never loads .env files.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('../', import.meta.url));
const values = {
  FIREBASE_API_KEY: 'fake-audit-key', FIREBASE_AUTH_DOMAIN: 'demo-mystic-audit.firebaseapp.com',
  FIREBASE_PROJECT_ID: 'demo-mystic-audit', FIREBASE_STORAGE_BUCKET: 'demo-mystic-audit.appspot.com',
  FIREBASE_MESSAGING_SENDER_ID: '123', FIREBASE_APP_ID: 'audit-local', FIREBASE_ADMIN_UID: '',
  FIREBASE_FUNCTIONS_REGION: 'europe-west1', PAYMENTS_ENABLED: 'false', STORAGE_ENABLED: 'true',
  RECAPTCHA_ENTERPRISE_SITE_KEY: '',
};
const server = await createServer({
  configFile: false, envFile: false, root: resolve(root, 'netlify'), publicDir: resolve(root, 'public'),
  cacheDir: resolve(root, 'node_modules/.vite-security-preview'),
  define: Object.fromEntries(Object.entries(values).map(([key, value]) => [`import.meta.env.VITE_${key}`, JSON.stringify(value)])),
  resolve: { alias: { 'next/image': resolve(root, 'netlify/image-shim.tsx') } },
  server: { host: '127.0.0.1', port: 3001, strictPort: true, fs: { allow: [root] } },
  plugins: [{
    name: 'isolated-security-emulators', enforce: 'pre',
    transform(code, id) {
      if (id.split('?')[0] !== resolve(root, 'app/firebase.ts')) return;
      const setup = `
        if (!app || app.options.projectId !== 'demo-mystic-audit') throw new Error('Unsafe audit configuration');
        connectAuthEmulator(auth, 'http://127.0.0.1:9098', {disableWarnings:true});
        connectFirestoreEmulator(database, '127.0.0.1', 8085);
        connectStorageEmulator(storage, '127.0.0.1', 9198);
        connectFunctionsEmulator(functions, '127.0.0.1', 5007);
      `;
      return `import {connectAuthEmulator} from 'firebase/auth';
        import {connectFirestoreEmulator} from 'firebase/firestore';
        import {connectStorageEmulator} from 'firebase/storage';
        import {connectFunctionsEmulator} from 'firebase/functions';
        ${code.replace('export type FirebaseSession', `${setup}\nexport type FirebaseSession`)}`;
    },
  }, react()],
});
await server.listen();
server.printUrls();

import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

assert.equal(process.env.GCLOUD_PROJECT, 'demo-mystic-audit');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8085');
for (const suite of ['tests/security-emulator.integration.mjs', 'tests/backend-emulator.integration.cjs', 'tests/client-persistence.integration.mjs']) {
  const result = spawnSync(process.execPath, ['--test', suite], { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

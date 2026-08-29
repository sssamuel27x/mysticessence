import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const firebaseSource = fs.readFileSync(new URL("../app/firebase.ts", import.meta.url), "utf8");
const pageSource = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("session profile updates from an old account cannot replace the current account", () => {
  assert.match(firebaseSource, /currentGeneration !== generation \|\| auth\.currentUser\?\.uid !== user\.uid/);
  assert.match(firebaseSource, /currentGeneration === generation && auth\.currentUser\?\.uid === user\.uid/);
});

test("login waits for the authoritative Firebase session instead of installing a partial one", () => {
  assert.doesNotMatch(pageSource, /onSession\(mode === "login"/);
  assert.match(pageSource, /if \(mode === "login"\) await loginWithEmail\(email, password\)/);
  assert.match(pageSource, /A verificar a sessão/);
});

test("account changes clear private state before the next profile becomes visible", () => {
  const sessionWatcher = pageSource.slice(pageSource.indexOf("useEffect(() => watchSession"), pageSource.indexOf("useEffect(() => watchProducts"));
  assert.match(sessionWatcher, /setSession\(null\)/);
  assert.match(sessionWatcher, /setOrders\(\[\]\)/);
  assert.match(sessionWatcher, /setInfluencerUses\(\[\]\)/);
  assert.match(sessionWatcher, /setFavoriteFolders\(\[\]\)/);
});

test("logout is awaited before the account screen becomes interactive again", () => {
  assert.match(pageSource, /async function handleLogout\(\)/);
  assert.match(pageSource, /setAuthReady\(false\)[\s\S]*await logoutFirebase\(\)/);
  assert.doesNotMatch(pageSource, /void logoutFirebase\(\)/);
});

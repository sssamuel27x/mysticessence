import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const [clientSource, functionsSource, rulesSource] = await Promise.all([
  readFile(new URL("../app/firebase.ts", import.meta.url), "utf8"),
  readFile(new URL("../functions/index.js", import.meta.url), "utf8"),
  readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
]);

test("pending payments are excluded from customer and admin order views", () => {
  assert.match(clientSource, /filter\(\(item\) => item\.data\(\)\.paymentStatus === "paid"\)/);
  assert.match(functionsSource, /Os pagamentos não estão disponíveis\. Nenhuma encomenda foi criada\./);
});

test("influencer commission is recorded only on the transition to paid", () => {
  assert.match(functionsSource, /before\.paymentStatus !== "paid" && order\.paymentStatus === "paid"/);
  assert.match(functionsSource, /recordInfluencerCouponUse\(order, event\.params\.orderId\)/);
  assert.match(functionsSource, /influencerCouponUses/);
});

test("influencers can only read their own server-created commission entries", () => {
  assert.match(rulesSource, /resource\.data\.influencerUid == request\.auth\.uid/);
  assert.match(rulesSource, /match \/influencerCouponUses\/\{useId\}[\s\S]*allow create, update, delete: if false/);
});

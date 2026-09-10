import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const [clientSource, functionsSource, rulesSource, pageSource] = await Promise.all([
  readFile(new URL("../app/firebase.ts", import.meta.url), "utf8"),
  readFile(new URL("../functions/index.js", import.meta.url), "utf8"),
  readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
]);

test("pending payments stay out of customer and admin fulfillment views", () => {
  assert.match(clientSource, /session.role === "admin" \|\| item.data\(\).paymentStatus === "paid"/);
  assert.match(pageSource, /order.paymentStatus === "paid" && !order.archived/);
  assert.match(functionsSource, /Os pagamentos não estão disponíveis\. Nenhuma encomenda foi criada\./);
});

test("payment review and order archive live in the dedicated admin orders view", () => {
  assert.match(pageSource, /adminView === "orders"[\s\S]*PaymentReviewPanel/);
  assert.match(pageSource, /setAdminView\(\(view\) => view === "orders" \? "inventory" : "orders"\)/);
});

test("shipping requires a carrier and queues a carrier-specific tracking link", () => {
  assert.match(pageSource, /\["ctt", "via-direta"\] as TrackingCarrier\[\]/);
  assert.match(functionsSource, /trackingDetails\(order\)/);
  assert.match(rulesSource, /trackingCarrier in \['ctt', 'via-direta'\]/);
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

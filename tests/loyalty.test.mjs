import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  LOYALTY_REWARDS,
  loyaltyDiscountForSubtotal,
  loyaltyPointsForAmount,
  loyaltyRewardById,
  normalizeLoyaltyPoints,
} from "../functions/loyalty.mjs";

const functionsSource = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
const rulesSource = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("loyalty rewards match the Mystic Rewards tiers", () => {
  assert.deepEqual(LOYALTY_REWARDS.map(({ points, kind, value, gift = false }) => ({ points, kind, value, gift })), [
    { points: 100, kind: "fixed", value: 5, gift: false },
    { points: 200, kind: "fixed", value: 12, gift: false },
    { points: 350, kind: "fixed", value: 20, gift: false },
    { points: 500, kind: "fixed", value: 30, gift: false },
    { points: 750, kind: "percentage", value: 10, gift: true },
  ]);
});

test("points use complete euros and discounts never exceed the product subtotal", () => {
  assert.equal(loyaltyPointsForAmount(49.99), 49);
  assert.equal(loyaltyPointsForAmount(0.99), 0);
  assert.equal(loyaltyDiscountForSubtotal(loyaltyRewardById("points-200"), 30), 12);
  assert.equal(loyaltyDiscountForSubtotal(loyaltyRewardById("points-750"), 99.99), 10);
  assert.equal(loyaltyDiscountForSubtotal(loyaltyRewardById("points-100"), 3), 3);
  assert.equal(normalizeLoyaltyPoints(-10), 0);
  assert.equal(loyaltyRewardById("unknown"), null);
});

test("loyalty balances stay server controlled and paid-order processing is idempotent", () => {
  assert.match(functionsSource, /if \(loyaltyReward && !request\.auth\)/);
  assert.doesNotMatch(functionsSource, /if \(loyaltyReward && couponCode\)/);
  assert.match(functionsSource, /Math\.min\(subtotal, couponDiscountAmount \+ loyaltyDiscountAmount\)/);
  assert.match(functionsSource, /transaction\.create\(loyaltyRedemptionRef/);
  assert.match(functionsSource, /if \(order\.paymentStatus !== "paid" \|\| !order\.customerUid\) return/);
  assert.match(functionsSource, /history\.doc\(`earn-\$\{orderId\}`\)/);
  assert.match(functionsSource, /loyaltyProfileRef\.collection\("loyaltyHistory"\)\.doc\(`release-\$\{orderId\}`\)/);
  assert.match(rulesSource, /match \/loyaltyHistory\/\{entryId\}[\s\S]*allow create, update, delete: if false/);
});

test("only an admin can grant arbitrary positive points and every grant is audited", () => {
  assert.match(functionsSource, /exports\.grantLoyaltyPoints = onCall/);
  assert.match(functionsSource, /exports\.grantLoyaltyPoints[\s\S]*requireAdmin\(request\)/);
  assert.match(functionsSource, /kind: "admin_grant"/);
  assert.match(functionsSource, /transaction\.create\(historyRef/);
  assert.match(functionsSource, /loyaltyPoints: currentPoints \+ points/);
  assert.match(pageSource, /Adicionar pontos/);
  assert.match(pageSource, /grantLoyaltyPoints/);
});

test("profile and checkout expose simple reward controls", () => {
  assert.match(pageSource, /Mystic Rewards/);
  assert.match(pageSource, /Usar recompensa/);
  assert.match(pageSource, /Usar pontos/);
  assert.match(pageSource, /Perfume surpresa/);
  assert.match(pageSource, /Pode ser utilizada juntamente com um código promocional/);
  assert.doesNotMatch(pageSource, /Não é acumulável com códigos promocionais/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GIFT_CARD_VALUES, giftCardAmountForTotal, giftCardValueForVolume, normalizeGiftCardBalance } from "../functions/gift-cards.mjs";

const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const functionsSource = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
const rulesSource = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");

test("gift cards only accept the four campaign values", () => {
  assert.deepEqual(GIFT_CARD_VALUES, [30, 50, 80, 100]);
  assert.equal(giftCardValueForVolume("30 €"), 30);
  assert.equal(giftCardValueForVolume("€ 100"), 100);
  assert.equal(giftCardValueForVolume("40 €"), null);
});

test("gift card redemption never exceeds the balance or order total", () => {
  assert.equal(giftCardAmountForTotal(50, 73.2), 50);
  assert.equal(giftCardAmountForTotal(80, 12.345), 12.35);
  assert.equal(giftCardAmountForTotal(-1, 20), 0);
  assert.equal(normalizeGiftCardBalance(30.129), 30.13);
});

test("gift cards are server controlled, issued only after payment and exposed in profile and checkout", () => {
  assert.match(functionsSource, /if \(order\.paymentStatus !== "paid" \|\| !order\.customerUid\) return/);
  assert.match(functionsSource, /profileRef\.collection\("giftCards"\)/);
  assert.match(functionsSource, /giftCardAmountUsed/);
  assert.match(functionsSource, /giftCardRedemptionRef/);
  assert.match(functionsSource, /giftCardReleaseRef/);
  assert.match(rulesSource, /match \/giftCards\/\{giftCardId\}[\s\S]*allow create, update, delete: if false/);
  assert.match(pageSource, /Os teus gift cards/);
  assert.match(pageSource, /Usar gift card/);
  assert.match(pageSource, /GIFT_CARD_PRODUCT/);
});

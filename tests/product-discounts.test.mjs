import assert from "node:assert/strict";
import test from "node:test";
import { liveProductDiscount } from "../functions/product-discounts.mjs";
import { ALL_STORE_PROMOTION, applyBrandPromotion, applyIndividualPromotion } from "../app/brand-promotions.mjs";

test("checkout accepts an individual 25% discount while a 20% brand campaign is active", () => {
  const [brandProduct] = applyBrandPromotion([{ id: "p", brand: "Rayhaan", price: 60 }], "Rayhaan", 20, "2027-04-01T00:00:00.000Z");
  const product = applyIndividualPromotion(brandProduct, 25, "2027-03-01T00:00:00.000Z");
  assert.equal(liveProductDiscount(product, new Date("2027-02-01T00:00:00.000Z").getTime()), 25);
  assert.equal(liveProductDiscount(product, new Date("2027-03-02T00:00:00.000Z").getTime()), 20);
});

test("checkout falls back to the remaining promotion when the larger campaign expires", () => {
  const [storeProduct] = applyBrandPromotion([{ id: "p", brand: "Rayhaan", price: 60 }], ALL_STORE_PROMOTION, 20, "2027-04-01T00:00:00.000Z");
  const product = applyIndividualPromotion(storeProduct, 25, "2027-03-01T00:00:00.000Z");
  assert.equal(liveProductDiscount(product, new Date("2027-03-02T00:00:00.000Z").getTime()), 20);
  assert.equal(liveProductDiscount(product, new Date("2027-04-02T00:00:00.000Z").getTime()), 0);
});

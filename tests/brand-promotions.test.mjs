import assert from "node:assert/strict";
import test from "node:test";
import {
  applyBrandPromotion,
  brandPromotionChanges,
  brandPromotionSummaries,
  removeBrandPromotion,
} from "../app/brand-promotions.mjs";

const catalogue = [
  { id: "rayhaan-one", brand: "Rayhaan", discount: 10, promotionEndsAt: "2027-01-01T00:00:00.000Z" },
  { id: "rayhaan-two", brand: " RAYHAAN " },
  { id: "decant-rayhaan-one", brand: "Rayhaan", isDecant: true, discount: 10 },
  { id: "other", brand: "Afnan" },
];

test("a brand promotion updates every full bottle of the selected brand and leaves decants alone", () => {
  const result = applyBrandPromotion(catalogue, "rayhaan", 20, "2027-02-01T00:00:00.000Z", "2026-10-11T12:00:00.000Z");
  assert.equal(result[0].discount, 20);
  assert.equal(result[1].discount, 20);
  assert.equal(result[2].discount, 10);
  assert.equal(result[3].discount, undefined);
  assert.equal(brandPromotionChanges(catalogue, result).length, 2);
});

test("ending a brand promotion restores each product's previous individual promotion", () => {
  const promoted = applyBrandPromotion(catalogue, "Rayhaan", 25, "2027-03-01T00:00:00.000Z");
  const restored = removeBrandPromotion(promoted, "Rayhaan");
  assert.equal(restored[0].discount, 10);
  assert.equal(restored[0].promotionEndsAt, "2027-01-01T00:00:00.000Z");
  assert.equal(restored[1].discount, null);
  assert.equal(restored[1].promotionEndsAt, null);
  assert.equal(restored[0].brandPromotion, null);
});

test("reapplying a campaign preserves the original prices and produces one brand summary", () => {
  const first = applyBrandPromotion(catalogue, "Rayhaan", 15, "2027-02-01T00:00:00.000Z");
  const second = applyBrandPromotion(first, "Rayhaan", 30, "2027-04-01T00:00:00.000Z");
  const summaries = brandPromotionSummaries(second);
  assert.deepEqual(summaries.map(({ brand, discount, productCount }) => ({ brand, discount, productCount })), [
    { brand: "Rayhaan", discount: 30, productCount: 2 },
  ]);
  assert.equal(removeBrandPromotion(second, "Rayhaan")[0].discount, 10);
});

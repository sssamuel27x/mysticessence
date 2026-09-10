import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_DECANT_PRICING,
  applyDecantPricing,
  decantPriceFor,
  isValidDecantPricing,
  normalizeDecantPricing,
} from '../functions/decant-pricing.mjs';

test('default decant pricing respects the bottle-price boundary', () => {
  assert.equal(decantPriceFor(DEFAULT_DECANT_PRICING, 45, 2), 1.9);
  assert.equal(decantPriceFor(DEFAULT_DECANT_PRICING, 45.01, 2), 2.5);
  assert.equal(decantPriceFor(DEFAULT_DECANT_PRICING, 65, 5), 4.5);
  assert.equal(decantPriceFor(DEFAULT_DECANT_PRICING, 65, 10), 7.99);
});

test('global rules update decants without changing full-bottle variants', () => {
  const product = {
    id: 'aira',
    price: 52.9,
    variants: [
      { volume: '100ml', price: 52.9 },
      { volume: '2ml', price: 1.9, isDecant: true, stock: 4 },
      { volume: '5ml', price: 4, isDecant: true, soldout: true },
    ],
  };
  const updated = applyDecantPricing(product, [
    { id: 'two', minPrice: 0, maxPrice: 100, size: 2, price: 2.75 },
    { id: 'five', minPrice: 0, maxPrice: 100, size: 5, price: 5.5 },
  ]);

  assert.deepEqual(updated.variants[0], product.variants[0]);
  assert.deepEqual(updated.variants[1], { ...product.variants[1], price: 2.75 });
  assert.deepEqual(updated.variants[2], { ...product.variants[2], price: 5.5 });
});

test('invalid stored settings fall back to safe defaults', () => {
  assert.equal(isValidDecantPricing([{ id: 'bad', minPrice: 50, maxPrice: 20, size: 2, price: 2 }]), false);
  assert.deepEqual(normalizeDecantPricing([{ nope: true }]), DEFAULT_DECANT_PRICING.map((rule) => ({ ...rule })));
});

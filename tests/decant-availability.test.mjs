import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDecantAvailability, isDecantBlocked, normalizeBlockedDecantSizes, variantUnavailable } from '../functions/decant-availability.mjs';

const product = {
  tag: 'stock',
  variants: [
    { volume: '100ml', price: 40, stock: 4 },
    { volume: '2ml', price: 2, isDecant: true },
    { volume: '5 ml', price: 5, isDecant: true, stock: 0 },
    { volume: '10ml', price: 9, isDecant: true, stock: 8, soldout: true },
  ],
};

test('only the three supported sizes can be globally blocked', () => {
  assert.deepEqual(normalizeBlockedDecantSizes(undefined), []);
  assert.deepEqual(normalizeBlockedDecantSizes([10, 2]), [2, 10]);
  for (const invalid of [null, {}, [2, 2], [3], ['2'], [2, 5, 10, 20]]) {
    assert.throws(() => normalizeBlockedDecantSizes(invalid));
  }
});

test('size matching respects units, whitespace and decant type', () => {
  for (const volume of ['2ml', '2 ml', ' 2 ML ', '2.0ml']) {
    assert.equal(isDecantBlocked({ volume, isDecant: true }, [2]), true);
    assert.equal(isDecantBlocked({ volume, isDecant: false }, [2]), false);
  }
  for (const volume of ['20ml', '2l', '2.5ml', '2ml extra', '2']) {
    assert.equal(isDecantBlocked({ volume, isDecant: true }, [2]), false);
  }
});

test('blocking all decants leaves full bottles, prices and physical stock unchanged', () => {
  const before = structuredClone(product);
  const result = applyDecantAvailability(product, [2, 5, 10]);
  assert.deepEqual(product, before);
  assert.equal(result.variants[0], product.variants[0]);
  assert.ok(result.variants.slice(1).every((variant) => variant.soldout));
  assert.deepEqual(result.variants.map((variant) => variant.stock), product.variants.map((variant) => variant.stock));
  assert.deepEqual(result.variants.map((variant) => variant.price), product.variants.map((variant) => variant.price));
});

test('releasing a global block preserves individual sold-out and zero stock states', () => {
  applyDecantAvailability(product, [2, 5, 10]);
  const released = applyDecantAvailability(product, []);
  assert.equal(variantUnavailable(released, released.variants[1]), false);
  assert.equal(variantUnavailable(released, released.variants[2]), true);
  assert.equal(variantUnavailable(released, released.variants[3]), true);
});

test('new products and decant-only listings inherit the block', () => {
  const variants = [{ volume: '2ml', price: 2, isDecant: true }];
  const result = applyDecantAvailability({ tag: 'stock', isDecant: true, variants }, [2]);
  assert.equal(result.tag, 'soldout');
  assert.equal(variantUnavailable(result, result.variants[0]), true);
});

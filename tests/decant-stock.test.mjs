import assert from "node:assert/strict";
import test from "node:test";
import {
  decantSizeFromVolume,
  decantStockUsage,
  isValidDecantStock,
  normalizeDecantStock,
  reserveDecantStock,
  restoreDecantStock,
} from "../functions/decant-stock.mjs";

test("shared decant stock accepts only complete non-negative whole quantities", () => {
  assert.deepEqual(normalizeDecantStock({ 2: 50, 5: 59, 10: 40 }), { 2: 50, 5: 59, 10: 40 });
  assert.equal(normalizeDecantStock(null), null);
  assert.equal(isValidDecantStock({ 2: 50, 5: 59, 10: 40 }), true);
  assert.equal(isValidDecantStock({ 2: null, 5: null, 10: null }), true);
  assert.equal(isValidDecantStock({ 2: 50, 5: null, 10: 40 }), true);
  assert.equal(isValidDecantStock({ 2: 50, 5: 59 }), false);
  assert.equal(isValidDecantStock({ 2: 50, 5: -1, 10: 40 }), false);
  assert.equal(isValidDecantStock({ 2: 50, 5: 1.5, 10: 40 }), false);
  assert.equal(isValidDecantStock({ 2: 50, 5: 59, 10: 40, 20: 1 }), false);
});

test("decant usage combines the same size across different perfumes", () => {
  const usage = decantStockUsage([
    { productId: "perfume-a", volume: "2ml", qty: 2, isDecant: true },
    { productId: "perfume-b", volume: "2 ml", qty: 1, isDecant: true },
    { productId: "perfume-c", volume: "5ML", quantity: 4, isDecant: true },
    { productId: "perfume-d", volume: "100ml", qty: 9, isDecant: false },
  ]);
  assert.deepEqual(usage, { 2: 3, 5: 4, 10: 0 });
  assert.equal(decantSizeFromVolume("10 ml"), 10);
  assert.equal(decantSizeFromVolume("100ml"), null);
});

test("reservation subtracts atomically and refuses insufficient shared stock", () => {
  assert.deepEqual(
    reserveDecantStock({ 2: 50, 5: 59, 10: 40 }, { 2: 1, 5: 3, 10: 0 }),
    { 2: 49, 5: 56, 10: 40 },
  );
  assert.throws(
    () => reserveDecantStock({ 2: 0, 5: 59, 10: 40 }, { 2: 1, 5: 0, 10: 0 }),
    /Insufficient 2ml decant stock/,
  );
  assert.deepEqual(
    reserveDecantStock({ 2: null, 5: 59, 10: null }, { 2: 20, 5: 3, 10: 10 }),
    { 2: null, 5: 56, 10: null },
  );
});

test("restoring a cancelled reservation returns each size once", () => {
  assert.deepEqual(
    restoreDecantStock({ 2: 49, 5: 56, 10: 40 }, { 2: 1, 5: 3, 10: 0 }),
    { 2: 50, 5: 59, 10: 40 },
  );
  assert.deepEqual(
    restoreDecantStock({ 2: null, 5: 56, 10: null }, { 2: 20, 5: 3, 10: 10 }),
    { 2: null, 5: 59, 10: null },
  );
});

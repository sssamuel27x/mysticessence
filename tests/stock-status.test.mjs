import assert from "node:assert/strict";
import test from "node:test";
import { isLowStock, stockStatusLabel } from "../app/stock-status.mjs";

test("customers see a simple low or regular stock status instead of exact quantities", () => {
  assert.equal(stockStatusLabel(1, "pt"), "Stock reduzido");
  assert.equal(stockStatusLabel(3, "pt"), "Stock reduzido");
  assert.equal(stockStatusLabel(4, "pt"), "Stock regular");
  assert.equal(stockStatusLabel(null, "pt"), "Stock regular");
  assert.equal(stockStatusLabel(2, "en"), "Low stock");
  assert.equal(stockStatusLabel(10, "en"), "Regular stock");
  assert.equal(isLowStock(0), false);
  assert.equal(isLowStock(3), true);
  assert.equal(isLowStock(4), false);
});

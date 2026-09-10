import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { primaryBottleStock, updatePrimaryBottleStock } from "../app/quick-stock.mjs";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

const product = {
  id: "stock-test",
  volume: "100ml",
  tag: "stock",
  variants: [
    { volume: "100 ml", price: 50, stock: 4 },
    { volume: "2ml", price: 2, stock: 20, isDecant: true },
  ],
};

test("quick stock edits only the primary full bottle", () => {
  const updated = updatePrimaryBottleStock(product, 7);
  assert.equal(primaryBottleStock(updated), 7);
  assert.equal(updated.variants[0].soldout, false);
  assert.deepEqual(updated.variants[1], product.variants[1]);
});

test("zero stock marks the product sold out and a positive value restores it", () => {
  const soldOut = updatePrimaryBottleStock(product, 0);
  assert.equal(soldOut.tag, "soldout");
  assert.equal(soldOut.variants[0].soldout, true);
  const restored = updatePrimaryBottleStock(soldOut, 3);
  assert.equal(restored.tag, "stock");
  assert.equal(restored.variants[0].soldout, false);
});

test("an empty stock value restores unlimited availability", () => {
  const unlimited = updatePrimaryBottleStock(updatePrimaryBottleStock(product, 0), undefined);
  assert.equal(primaryBottleStock(unlimited), undefined);
  assert.equal("stock" in unlimited.variants[0], false);
  assert.equal(unlimited.variants[0].soldout, false);
});

test("invalid stock values and products without bottles are refused", () => {
  assert.throws(() => updatePrimaryBottleStock(product, -1));
  assert.throws(() => updatePrimaryBottleStock(product, 1.5));
  assert.throws(() => updatePrimaryBottleStock({ ...product, variants: product.variants.slice(1) }, 1));
});

test("the admin quick editor persists through the protected product transaction", () => {
  assert.match(pageSource, /async function saveQuickStock[\s\S]*saveProductGroup\(nextProduct, nextDecantProduct, product\)/);
  assert.match(pageSource, /className="admin-quick-stock"[\s\S]*className="admin-quick-stock-save"/);
});

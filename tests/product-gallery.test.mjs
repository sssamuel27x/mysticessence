import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../app/product-gallery.ts", import.meta.url), "utf8");
const exports = {};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { exports });
const { getProductImages, productImageFields, validateProductImageFiles, MAX_PRODUCT_IMAGES, MAX_PRODUCT_IMAGE_BYTES } = exports;
const json = (value) => JSON.parse(JSON.stringify(value));
const first = { imageUrl: "/first.webp", imagePath: "products/one/first.webp" };
const second = { imageUrl: "/second.webp" };

test("legacy products keep their single existing image", () => {
  assert.deepEqual(json(getProductImages(first)), [first]);
  assert.deepEqual(json(getProductImages({})), []);
});

test("gallery order determines the primary image used in listings", () => {
  assert.deepEqual(json(productImageFields([second, first])), {
    images: [second, first], imageUrl: second.imageUrl, imagePath: "",
  });
  assert.deepEqual(json(getProductImages({ ...first, images: [second, first] })), [second, first]);
});

test("removing every image clears legacy fields, even with a Firestore merge", () => {
  const merged = { ...first, ...productImageFields([]) };
  assert.equal(merged.imageUrl, "");
  assert.equal(merged.imagePath, "");
  assert.deepEqual(json(getProductImages(merged)), []);
  assert.deepEqual(json(getProductImages({ ...first, images: [] })), []);
});

test("normalization removes duplicate URLs, invalid entries and transient upload fields", () => {
  assert.deepEqual(json(productImageFields([
    { ...first, id: "draft", file: { name: "photo.webp" } },
    first, null, { imageUrl: "" }, second,
  ])), { images: [first, second], ...first });
});

test("multiple images survive a save and reload", () => {
  const fields = productImageFields([first, second]);
  assert.deepEqual(json(getProductImages(JSON.parse(JSON.stringify(fields)))), [first, second]);
});

test("image selection respects file types, per-file size and gallery capacity", () => {
  const file = { type: "image/webp", size: 1500 };
  assert.equal(validateProductImageFiles([file, { ...file, type: "image/png" }], 1), null);
  assert.equal(validateProductImageFiles([{ ...file, type: "image/jpeg" }], 0), null);
  assert.equal(validateProductImageFiles([{ ...file, type: "image/svg+xml" }], 0), "type");
  assert.equal(validateProductImageFiles([{ ...file, size: MAX_PRODUCT_IMAGE_BYTES }], 0), "size");
  assert.equal(validateProductImageFiles([{ ...file, size: 0 }], 0), "size");
  assert.equal(validateProductImageFiles([file], MAX_PRODUCT_IMAGES), "count");
  assert.equal(validateProductImageFiles([file], MAX_PRODUCT_IMAGES - 1), null);
});

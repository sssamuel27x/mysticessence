import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../app/home-hero.ts", import.meta.url), "utf8");
const exports = {};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { exports });

const { normalizeHomeHeroImages, validateHomeHeroImageFiles, MAX_HOME_HERO_IMAGES, MAX_HOME_HERO_IMAGE_BYTES } = exports;
const json = (value) => JSON.parse(JSON.stringify(value));

test("the homepage keeps exactly the number of configured images", () => {
  const images = Array.from({ length: 4 }, (_, index) => ({ id: `image-${index}`, imageUrl: `/hero-${index}.webp` }));
  assert.equal(normalizeHomeHeroImages(images.slice(0, 1)).length, 1);
  assert.equal(normalizeHomeHeroImages(images.slice(0, 2)).length, 2);
  assert.equal(normalizeHomeHeroImages(images).length, 4);
});

test("invalid and duplicate homepage images never enter the carousel", () => {
  assert.deepEqual(json(normalizeHomeHeroImages([
    { id: "one", imageUrl: "/one.webp" },
    { id: "one", imageUrl: "/duplicate-id.webp" },
    { id: "two", imageUrl: "/one.webp" },
    { id: "three", imageUrl: "" },
    null,
  ])), [{ id: "one", imageUrl: "/one.webp" }]);
});

test("homepage uploads accept only six safe images under five megabytes", () => {
  const file = { type: "image/webp", size: 1200 };
  assert.equal(validateHomeHeroImageFiles([file], 0), null);
  assert.equal(validateHomeHeroImageFiles([file], MAX_HOME_HERO_IMAGES), "count");
  assert.equal(validateHomeHeroImageFiles([{ ...file, type: "image/svg+xml" }], 0), "type");
  assert.equal(validateHomeHeroImageFiles([{ ...file, size: MAX_HOME_HERO_IMAGE_BYTES }], 0), "size");
});

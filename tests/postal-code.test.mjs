import assert from "node:assert/strict";
import test from "node:test";
import { formatPostalCodeInput } from "../app/postal-code.mjs";

test("Portuguese postcodes receive the hyphen automatically on mobile input", () => {
  assert.equal(formatPostalCodeInput("4520248", "continental"), "4520-248");
  assert.equal(formatPostalCodeInput("4520-248", "madeira"), "4520-248");
  assert.equal(formatPostalCodeInput("9500123", "azores"), "9500-123");
  assert.equal(formatPostalCodeInput("4520-2489", "continental"), "4520-248");
});

test("Spanish postcodes remain five digits without a hyphen", () => {
  assert.equal(formatPostalCodeInput("28001", "spain"), "28001");
  assert.equal(formatPostalCodeInput("2800-1", "spain"), "28001");
  assert.equal(formatPostalCodeInput("280019", "spain"), "28001");
});

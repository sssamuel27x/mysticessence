"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { trackingDetails } = require("../functions/tracking.cjs");

test("CTT tracking details include the official tracking link", () => {
  assert.deepEqual(trackingDetails({ trackingNumber: "RR 123/PT", trackingCarrier: "ctt" }), {
    trackingNumber: "RR 123/PT",
    carrier: "ctt",
    carrierLabel: "CTT",
    url: "https://www.ctt.pt/feapl_2/app/open/objectSearch/objectSearch.jspx?objects=RR%20123%2FPT&request_locale=pt",
  });
});

test("Via Direta tracking details include its tracking link", () => {
  assert.deepEqual(trackingDetails({ trackingNumber: "VD-456", trackingCarrier: "via-direta" }), {
    trackingNumber: "VD-456",
    carrier: "via-direta",
    carrierLabel: "Via Direta",
    url: "https://www.viadireta.pt/pt/tracking",
  });
});

test("tracking details reject missing or unknown carriers", () => {
  assert.equal(trackingDetails({ trackingNumber: "123" }), null);
  assert.equal(trackingDetails({ trackingNumber: "123", trackingCarrier: "unknown" }), null);
  assert.equal(trackingDetails({ trackingNumber: "", trackingCarrier: "ctt" }), null);
});

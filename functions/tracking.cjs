"use strict";

const TRACKING_CARRIERS = Object.freeze({
  ctt: {
    label: "CTT",
    url: (trackingNumber) => `https://www.ctt.pt/feapl_2/app/open/objectSearch/objectSearch.jspx?objects=${encodeURIComponent(trackingNumber)}&request_locale=pt`,
  },
  "via-direta": {
    label: "Via Direta",
    url: () => "https://www.viadireta.pt/pt/tracking",
  },
});

function trackingDetails(order = {}) {
  const trackingNumber = String(order.trackingNumber ?? "").trim().slice(0, 100);
  const carrier = TRACKING_CARRIERS[order.trackingCarrier];
  if (!trackingNumber || !carrier) return null;
  return {
    trackingNumber,
    carrier: order.trackingCarrier,
    carrierLabel: carrier.label,
    url: carrier.url(trackingNumber),
  };
}

module.exports = { TRACKING_CARRIERS, trackingDetails };

function activeDiscount(value, now) {
  if (!value || !Number.isFinite(Number(value.discount)) || Number(value.discount) <= 0) return 0;
  if (value.endsAt && Date.parse(value.endsAt) <= now) return 0;
  return Math.min(95, Math.max(0, Number(value.discount)));
}

export function liveProductDiscount(product, now = Date.now()) {
  const hasCampaign = Boolean(product.storePromotion || product.brandPromotion);
  const baselineCampaign = product.brandPromotion || product.storePromotion;
  const candidates = [
    activeDiscount(product.individualPromotion, now),
    activeDiscount(product.brandPromotion, now),
    activeDiscount(product.storePromotion, now),
  ];
  if (baselineCampaign) {
    candidates.push(activeDiscount({
      discount: baselineCampaign.previousDiscount,
      endsAt: baselineCampaign.previousEndsAt,
    }, now));
  } else if (!hasCampaign) {
    candidates.push(activeDiscount({ discount: product.discount, endsAt: product.promotionEndsAt }, now));
  }
  return Math.max(0, ...candidates);
}

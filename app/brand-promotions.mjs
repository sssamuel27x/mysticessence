function brandKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function validPromotion(value) {
  return value && typeof value === "object"
    && typeof value.brand === "string"
    && Number.isFinite(Number(value.discount))
    && typeof value.endsAt === "string";
}

export function applyBrandPromotion(catalogue, brand, discount, endsAt, appliedAt = new Date().toISOString()) {
  const targetBrand = brandKey(brand);
  const normalizedDiscount = Math.min(95, Math.max(1, Math.trunc(Number(discount))));

  return catalogue.map((product) => {
    if (product.isDecant || brandKey(product.brand) !== targetBrand) return product;
    const currentCampaign = validPromotion(product.brandPromotion) && brandKey(product.brandPromotion.brand) === targetBrand
      ? product.brandPromotion
      : null;
    return {
      ...product,
      discount: normalizedDiscount,
      promotionEndsAt: endsAt,
      brandPromotion: {
        brand: product.brand,
        discount: normalizedDiscount,
        endsAt,
        appliedAt,
        previousDiscount: currentCampaign ? currentCampaign.previousDiscount ?? null : product.discount ?? null,
        previousEndsAt: currentCampaign ? currentCampaign.previousEndsAt ?? null : product.promotionEndsAt ?? null,
      },
    };
  });
}

export function removeBrandPromotion(catalogue, brand) {
  const targetBrand = brandKey(brand);
  return catalogue.map((product) => {
    const campaign = validPromotion(product.brandPromotion) ? product.brandPromotion : null;
    if (!campaign || brandKey(campaign.brand) !== targetBrand) return product;
    return {
      ...product,
      discount: campaign.previousDiscount ?? null,
      promotionEndsAt: campaign.previousEndsAt ?? null,
      brandPromotion: null,
    };
  });
}

export function brandPromotionSummaries(catalogue) {
  const summaries = new Map();
  catalogue.forEach((product) => {
    if (product.isDecant || !validPromotion(product.brandPromotion)) return;
    const campaign = product.brandPromotion;
    const key = brandKey(campaign.brand);
    const existing = summaries.get(key);
    if (existing) {
      existing.productCount += 1;
      return;
    }
    summaries.set(key, {
      brand: campaign.brand,
      discount: Number(campaign.discount),
      endsAt: campaign.endsAt,
      productCount: 1,
    });
  });
  return [...summaries.values()].sort((a, b) => a.brand.localeCompare(b.brand, "pt"));
}

export function brandPromotionChanges(before, after) {
  const previous = new Map(before.map((product) => [product.id, product]));
  return after.filter((product) => {
    const oldProduct = previous.get(product.id);
    return oldProduct && JSON.stringify([
      oldProduct.discount ?? null,
      oldProduct.promotionEndsAt ?? null,
      oldProduct.brandPromotion ?? null,
    ]) !== JSON.stringify([
      product.discount ?? null,
      product.promotionEndsAt ?? null,
      product.brandPromotion ?? null,
    ]);
  });
}

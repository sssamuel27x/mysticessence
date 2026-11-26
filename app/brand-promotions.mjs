function brandKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export const ALL_STORE_PROMOTION = "__all_store__";

export function isAllStorePromotion(value) {
  return brandKey(value) === brandKey(ALL_STORE_PROMOTION);
}

function validPromotion(value) {
  return value && typeof value === "object"
    && typeof value.brand === "string"
    && Number.isFinite(Number(value.discount))
    && typeof value.endsAt === "string";
}

function storePromotionFor(product) {
  if (validPromotion(product.storePromotion)) return product.storePromotion;
  if (validPromotion(product.brandPromotion) && isAllStorePromotion(product.brandPromotion.brand)) return product.brandPromotion;
  return null;
}

function specificBrandPromotionFor(product) {
  if (!validPromotion(product.brandPromotion) || isAllStorePromotion(product.brandPromotion.brand)) return null;
  return product.brandPromotion;
}

function individualPromotionFor(product) {
  const promotion = product.individualPromotion;
  if (!promotion || !Number.isFinite(Number(promotion.discount)) || typeof promotion.endsAt !== "string") return null;
  return promotion;
}

export function individualPromotionDetails(product) {
  const explicit = individualPromotionFor(product);
  if (explicit) return explicit;
  const storePromotion = storePromotionFor(product);
  const brandPromotion = specificBrandPromotionFor(product);
  if (storePromotion || brandPromotion) {
    const legacyBaseline = (brandPromotion || storePromotion).previousDiscount;
    const legacyEnd = (brandPromotion || storePromotion).previousEndsAt;
    return Number(legacyBaseline) > 0 && typeof legacyEnd === "string"
      ? { discount: Number(legacyBaseline), endsAt: legacyEnd }
      : null;
  }
  return Number(product.discount) > 0
    ? { discount: Number(product.discount), endsAt: product.promotionEndsAt ?? "" }
    : null;
}

function baselineFor(product, storePromotion, brandPromotion) {
  const campaign = brandPromotion || storePromotion;
  const individualPromotion = individualPromotionFor(product);
  return {
    discount: individualPromotion?.discount ?? (campaign ? campaign.previousDiscount ?? null : product.discount ?? null),
    endsAt: individualPromotion?.endsAt ?? (campaign ? campaign.previousEndsAt ?? null : product.promotionEndsAt ?? null),
  };
}

function campaignFor(brand, discount, endsAt, appliedAt, baseline) {
  return {
    brand,
    discount,
    endsAt,
    appliedAt,
    previousDiscount: baseline.discount,
    previousEndsAt: baseline.endsAt,
  };
}

function effectivePromotion(baseline, storePromotion, brandPromotion) {
  const candidates = [
    Number.isFinite(Number(baseline.discount)) && Number(baseline.discount) > 0
      ? { discount: Number(baseline.discount), endsAt: baseline.endsAt }
      : null,
    brandPromotion && { discount: Number(brandPromotion.discount), endsAt: brandPromotion.endsAt },
    storePromotion && { discount: Number(storePromotion.discount), endsAt: storePromotion.endsAt },
  ].filter(Boolean);
  return candidates.reduce((best, candidate) => !best || candidate.discount > best.discount ? candidate : best, null);
}

function withCampaigns(product, baseline, storePromotion, brandPromotion) {
  const effective = effectivePromotion(baseline, storePromotion, brandPromotion);
  return {
    ...product,
    discount: effective?.discount ?? null,
    promotionEndsAt: effective?.endsAt ?? null,
    storePromotion: storePromotion ?? null,
    brandPromotion: brandPromotion ?? null,
  };
}

export function effectiveCampaignDiscount(product, now = Date.now()) {
  const storePromotion = storePromotionFor(product);
  const brandPromotion = specificBrandPromotionFor(product);
  const individualPromotion = individualPromotionFor(product);
  if (!storePromotion && !brandPromotion && !individualPromotion) return null;
  const baseline = individualPromotion ?? baselineFor(product, storePromotion, brandPromotion);
  const activeDiscount = (discount, endsAt) => {
    const numericDiscount = Number(discount);
    if (!Number.isFinite(numericDiscount) || numericDiscount <= 0) return 0;
    if (endsAt && new Date(endsAt).getTime() <= now) return 0;
    return numericDiscount;
  };
  return Math.max(
    activeDiscount(baseline.discount, baseline.endsAt),
    storePromotion ? activeDiscount(storePromotion.discount, storePromotion.endsAt) : 0,
    brandPromotion ? activeDiscount(brandPromotion.discount, brandPromotion.endsAt) : 0,
  );
}

export function applyIndividualPromotion(product, discount, endsAt) {
  const storePromotion = storePromotionFor(product);
  const brandPromotion = specificBrandPromotionFor(product);
  const hasCampaign = Boolean(storePromotion || brandPromotion);
  const individualPromotion = Number(discount) > 0 && endsAt
    ? { discount: Math.min(95, Math.max(1, Math.trunc(Number(discount)))), endsAt }
    : null;
  if (!hasCampaign) {
    return {
      ...product,
      discount: individualPromotion?.discount ?? null,
      promotionEndsAt: individualPromotion?.endsAt ?? null,
      individualPromotion,
    };
  }
  const nextProduct = { ...product, individualPromotion };
  const baseline = individualPromotion
    ? { discount: individualPromotion.discount, endsAt: individualPromotion.endsAt }
    : { discount: null, endsAt: null };
  const updateBaseline = (campaign) => campaign
    ? { ...campaign, previousDiscount: baseline.discount, previousEndsAt: baseline.endsAt }
    : null;
  return withCampaigns(nextProduct, baseline, updateBaseline(storePromotion), updateBaseline(brandPromotion));
}

export function clearCampaignPricing(product) {
  return {
    ...product,
    discount: undefined,
    promotionEndsAt: undefined,
    storePromotion: undefined,
    brandPromotion: undefined,
    individualPromotion: undefined,
  };
}

export function applyBrandPromotion(catalogue, brand, discount, endsAt, appliedAt = new Date().toISOString()) {
  const targetBrand = brandKey(brand);
  const appliesToAllStore = isAllStorePromotion(brand);
  const normalizedDiscount = Math.min(95, Math.max(1, Math.trunc(Number(discount))));

  return catalogue.map((product) => {
    if (product.isDecant || product.isGiftCard || (!appliesToAllStore && brandKey(product.brand) !== targetBrand)) return product;
    const currentStorePromotion = storePromotionFor(product);
    const currentBrandPromotion = specificBrandPromotionFor(product);
    const baseline = baselineFor(product, currentStorePromotion, currentBrandPromotion);
    const nextStorePromotion = appliesToAllStore
      ? campaignFor(ALL_STORE_PROMOTION, normalizedDiscount, endsAt, appliedAt, baseline)
      : currentStorePromotion;
    const nextBrandPromotion = appliesToAllStore
      ? currentBrandPromotion
      : campaignFor(product.brand, normalizedDiscount, endsAt, appliedAt, baseline);
    return withCampaigns(product, baseline, nextStorePromotion, nextBrandPromotion);
  });
}

export function removeBrandPromotion(catalogue, brand) {
  const targetBrand = brandKey(brand);
  return catalogue.map((product) => {
    const currentStorePromotion = storePromotionFor(product);
    const currentBrandPromotion = specificBrandPromotionFor(product);
    const removeStorePromotion = isAllStorePromotion(brand) && currentStorePromotion;
    const removeSpecificPromotion = currentBrandPromotion && brandKey(currentBrandPromotion.brand) === targetBrand;
    if (!removeStorePromotion && !removeSpecificPromotion) return product;
    const baseline = baselineFor(product, currentStorePromotion, currentBrandPromotion);
    return withCampaigns(
      product,
      baseline,
      removeStorePromotion ? null : currentStorePromotion,
      removeSpecificPromotion ? null : currentBrandPromotion,
    );
  });
}

export function brandPromotionSummaries(catalogue) {
  const summaries = new Map();
  catalogue.forEach((product) => {
    if (product.isDecant || product.isGiftCard) return;
    [storePromotionFor(product), specificBrandPromotionFor(product)].filter(Boolean).forEach((campaign) => {
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
  });
  return [...summaries.values()].sort((a, b) => {
    if (isAllStorePromotion(a.brand)) return -1;
    if (isAllStorePromotion(b.brand)) return 1;
    return a.brand.localeCompare(b.brand, "pt");
  });
}

export function brandPromotionChanges(before, after) {
  const previous = new Map(before.map((product) => [product.id, product]));
  return after.filter((product) => {
    const oldProduct = previous.get(product.id);
    return oldProduct && JSON.stringify([
      oldProduct.discount ?? null,
      oldProduct.promotionEndsAt ?? null,
      oldProduct.storePromotion ?? null,
      oldProduct.brandPromotion ?? null,
      oldProduct.individualPromotion ?? null,
    ]) !== JSON.stringify([
      product.discount ?? null,
      product.promotionEndsAt ?? null,
      product.storePromotion ?? null,
      product.brandPromotion ?? null,
      product.individualPromotion ?? null,
    ]);
  });
}

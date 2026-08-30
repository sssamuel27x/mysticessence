import { DECANT_SIZES } from './decant-pricing.mjs';

export function isValidBlockedDecantSizes(value) {
  return Array.isArray(value) && value.length <= DECANT_SIZES.length
    && new Set(value).size === value.length && value.every((size) => DECANT_SIZES.includes(size));
}

export function normalizeBlockedDecantSizes(value) {
  if (value === undefined) return [];
  if (!isValidBlockedDecantSizes(value)) throw new Error('Invalid decant availability');
  return [...value].sort((a, b) => a - b);
}

export function isDecantBlocked(variant, blockedSizes) {
  if (!variant?.isDecant) return false;
  const volume = /^\s*(\d+(?:\.0+)?)\s*ml\s*$/i.exec(String(variant.volume));
  return Boolean(volume && blockedSizes.includes(Number(volume[1])));
}

export function variantUnavailable(product, variant, blockedSizes = []) {
  return !variant || variant.stock === 0 || Boolean(variant.soldout)
    || (!variant.isDecant && product.tag === 'soldout') || isDecantBlocked(variant, blockedSizes);
}

// Keep the original inventory intact so releasing a global block cannot restore sold-out stock.
export function applyDecantAvailability(product, blockedSizes) {
  if (!blockedSizes.length) return product;
  const variants = product.variants.map((variant) => isDecantBlocked(variant, blockedSizes) ? { ...variant, soldout: true } : variant);
  return {
    ...product,
    variants,
    tag: product.isDecant && variants.length && variants.every((variant) => variantUnavailable(product, variant)) ? 'soldout' : product.tag,
  };
}

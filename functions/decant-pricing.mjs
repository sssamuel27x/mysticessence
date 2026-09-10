export const DECANT_SIZES = Object.freeze([2, 5, 10]);

export const DEFAULT_DECANT_PRICING = Object.freeze([
  { id: '2ml-budget', minPrice: 0, maxPrice: 45, size: 2, price: 1.9 },
  { id: '2ml-premium', minPrice: 45.01, maxPrice: 9999, size: 2, price: 2.5 },
  { id: '5ml-standard', minPrice: 0, maxPrice: 9999, size: 5, price: 4.5 },
  { id: '10ml-standard', minPrice: 0, maxPrice: 9999, size: 10, price: 7.99 },
]);

function validMoney(value, maximum = 9999) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum
    && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;
}

export function isValidDecantPricing(rules) {
  return Array.isArray(rules) && rules.length > 0 && rules.length <= 60 && rules.every((rule) => (
    rule && typeof rule === 'object'
    && typeof rule.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(rule.id)
    && validMoney(rule.minPrice)
    && validMoney(rule.maxPrice)
    && rule.minPrice <= rule.maxPrice
    && DECANT_SIZES.includes(rule.size)
    && validMoney(rule.price, 999.99)
  ));
}

export function normalizeDecantPricing(value) {
  if (!isValidDecantPricing(value)) return DEFAULT_DECANT_PRICING.map((rule) => ({ ...rule }));
  return value.map((rule) => ({ ...rule })).sort((a, b) => a.size - b.size || a.minPrice - b.minPrice || a.maxPrice - b.maxPrice);
}

export function decantPriceFor(rules, bottlePrice, size) {
  if (!Number.isFinite(bottlePrice) || !DECANT_SIZES.includes(size)) return null;
  const matching = normalizeDecantPricing(rules).find((rule) => rule.size === size && bottlePrice >= rule.minPrice && bottlePrice <= rule.maxPrice);
  return matching?.price ?? null;
}

export function applyDecantPricing(product, rules) {
  if (!product || product.isDecant || !Array.isArray(product.variants)) return product;
  const bottlePrice = Number(product.price);
  return {
    ...product,
    variants: product.variants.map((variant) => {
      if (!variant?.isDecant) return variant;
      const size = Number.parseInt(String(variant.volume), 10);
      const nextPrice = decantPriceFor(rules, bottlePrice, size);
      return nextPrice === null ? variant : { ...variant, price: nextPrice };
    }),
  };
}

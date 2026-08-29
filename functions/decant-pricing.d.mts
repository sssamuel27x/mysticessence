export type DecantSize = 2 | 5 | 10;
export type DecantPricingRule = { id: string; minPrice: number; maxPrice: number; size: DecantSize; price: number };
export const DECANT_SIZES: readonly DecantSize[];
export const DEFAULT_DECANT_PRICING: readonly DecantPricingRule[];
export function isValidDecantPricing(value: unknown): value is DecantPricingRule[];
export function normalizeDecantPricing(value: unknown): DecantPricingRule[];
export function decantPriceFor(rules: DecantPricingRule[], bottlePrice: number, size: DecantSize): number | null;
export function applyDecantPricing<T extends { isDecant?: boolean; price: number; variants: Array<{ volume: string; price: number; isDecant?: boolean }> }>(product: T, rules: DecantPricingRule[]): T;

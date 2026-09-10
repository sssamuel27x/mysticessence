import type { DecantSize } from './decant-pricing.mjs';
type Variant = { volume: string; isDecant?: boolean; stock?: number; soldout?: boolean };
export function isValidBlockedDecantSizes(value: unknown): value is DecantSize[];
export function normalizeBlockedDecantSizes(value: unknown): DecantSize[];
export function isDecantBlocked(variant: Variant | undefined, blockedSizes: readonly DecantSize[]): boolean;
export function variantUnavailable(product: { tag: string }, variant: Variant | undefined, blockedSizes?: readonly DecantSize[]): boolean;
export function applyDecantAvailability<T extends { tag: string; isDecant?: boolean; variants: Variant[] }>(product: T, blockedSizes: readonly DecantSize[]): T;

import { DECANT_SIZES } from "./decant-pricing.mjs";

function validQuantity(value) {
  return Number.isInteger(value) && value >= 0 && value <= 1000000;
}

export function normalizeDecantStock(value) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object") throw new Error("Invalid decant stock");
  const stock = {};
  for (const size of DECANT_SIZES) {
    const quantity = value[String(size)];
    if (!validQuantity(quantity)) throw new Error("Invalid decant stock");
    stock[size] = quantity;
  }
  if (Object.keys(value).some((key) => !DECANT_SIZES.includes(Number(key)))) throw new Error("Invalid decant stock");
  return stock;
}

export function isValidDecantStock(value) {
  try { return normalizeDecantStock(value) !== null; }
  catch { return false; }
}

export function decantSizeFromVolume(volume) {
  const match = /^\s*(2|5|10)\s*ml\s*$/i.exec(String(volume ?? ""));
  return match ? Number(match[1]) : null;
}

export function decantStockUsage(items) {
  const usage = { 2: 0, 5: 0, 10: 0 };
  for (const item of Array.isArray(items) ? items : []) {
    if (!item?.isDecant) continue;
    const size = decantSizeFromVolume(item.volume);
    if (!size) continue;
    const quantity = Math.max(0, Math.trunc(Number(item.qty ?? item.quantity) || 0));
    usage[size] += quantity;
  }
  return usage;
}

export function reserveDecantStock(stock, usage) {
  const current = normalizeDecantStock(stock);
  const requested = normalizeDecantStock(usage);
  if (!current || !requested) throw new Error("Invalid decant stock");
  const next = {};
  for (const size of DECANT_SIZES) {
    if (requested[size] > current[size]) throw new Error(`Insufficient ${size}ml decant stock`);
    next[size] = current[size] - requested[size];
  }
  return next;
}

export function restoreDecantStock(stock, usage) {
  const current = normalizeDecantStock(stock);
  const restored = normalizeDecantStock(usage);
  if (!current || !restored) throw new Error("Invalid decant stock");
  return Object.fromEntries(DECANT_SIZES.map((size) => [size, current[size] + restored[size]]));
}

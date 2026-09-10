export const LOW_STOCK_THRESHOLD = 3;

export function isLowStock(stock) {
  return typeof stock === "number" && stock > 0 && stock <= LOW_STOCK_THRESHOLD;
}

export function stockStatusLabel(stock, lang = "pt") {
  if (isLowStock(stock)) {
    return lang === "pt" ? "Stock reduzido" : "Low stock";
  }
  return lang === "pt" ? "Stock regular" : "Regular stock";
}

export function brandKey(name: string) {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
}

export const HIDDEN_BRANDS = new Set([brandKey("Aromatix x French Avenue"), brandKey("Rave")]);

export function catalogueBrands(...groups: string[][]): string[] {
  const names = new Map<string, string>();
  for (const group of groups) {
    for (const raw of group) {
      const name = raw.trim().replace(/\s+/g, " ");
      const key = brandKey(name);
      if (key && !HIDDEN_BRANDS.has(key) && !names.has(key)) names.set(key, name);
    }
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b, "pt", { sensitivity: "base" }));
}

export function productsForBrand<T extends { brand: string }>(products: T[], name: string): T[] {
  return products.filter((product) => brandKey(product.brand) === brandKey(name));
}

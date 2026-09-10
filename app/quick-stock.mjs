function normalizedVolume(value) {
  return String(value ?? "").replace(/\s/g, "").toLowerCase();
}

function primaryBottleIndex(product) {
  const target = normalizedVolume(product.volume);
  const exact = product.variants.findIndex((variant) => !variant.isDecant && normalizedVolume(variant.volume) === target);
  return exact >= 0 ? exact : product.variants.findIndex((variant) => !variant.isDecant);
}

export function primaryBottleStock(product) {
  const index = primaryBottleIndex(product);
  const primary = index >= 0 ? product.variants[index] : undefined;
  if (typeof primary?.stock === "number") return primary.stock;
  return primary?.soldout || product.tag === "soldout" ? 0 : undefined;
}

export function updatePrimaryBottleStock(product, stock) {
  if (stock !== undefined && (!Number.isInteger(stock) || stock < 0)) {
    throw new Error("Stock must be a non-negative whole number or undefined.");
  }
  const index = primaryBottleIndex(product);
  if (index < 0) throw new Error("Product has no full-bottle variant.");

  const variants = product.variants.map((variant, variantIndex) => {
    if (variantIndex !== index) return variant;
    const next = { ...variant, soldout: stock === 0 };
    if (stock === undefined) delete next.stock;
    else next.stock = stock;
    return next;
  });
  const bottles = variants.filter((variant) => !variant.isDecant);
  const allBottlesUnavailable = bottles.length > 0 && bottles.every((variant) => variant.soldout || variant.stock === 0);
  return {
    ...product,
    variants,
    tag: allBottlesUnavailable ? "soldout" : product.tag === "soldout" ? "stock" : product.tag,
  };
}

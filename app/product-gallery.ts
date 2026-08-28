export type ProductImage = { imageUrl: string; imagePath?: string };

type ImageSource = { images?: ProductImage[]; imageUrl?: string; imagePath?: string };

export const MAX_PRODUCT_IMAGES = 10;
export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

export function getProductImages(product: ImageSource): ProductImage[] {
  // An explicit empty gallery must not restore a removed legacy image.
  const images = Array.isArray(product.images)
    ? product.images
    : product.imageUrl ? [{ imageUrl: product.imageUrl, imagePath: product.imagePath }] : [];
  const seen = new Set<string>();
  return images.flatMap((image) => {
    if (!image || typeof image.imageUrl !== "string" || !image.imageUrl.trim() || seen.has(image.imageUrl)) return [];
    seen.add(image.imageUrl);
    return [{ imageUrl: image.imageUrl, ...(image.imagePath ? { imagePath: image.imagePath } : {}) }];
  });
}

export function productImageFields(images: ProductImage[]) {
  const gallery = getProductImages({ images });
  return {
    images: gallery,
    // Keep catalogue/cart compatibility and clear old fields in merged Firestore writes.
    imageUrl: gallery[0]?.imageUrl ?? "",
    imagePath: gallery[0]?.imagePath ?? "",
  };
}

export function validateProductImageFiles(files: Pick<File, "type" | "size">[], existingCount: number) {
  if (existingCount + files.length > MAX_PRODUCT_IMAGES) return "count";
  if (files.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type))) return "type";
  if (files.some((file) => file.size === 0 || file.size >= MAX_PRODUCT_IMAGE_BYTES)) return "size";
  return null;
}

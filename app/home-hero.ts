export type HomeHeroImage = {
  id: string;
  imageUrl: string;
  imagePath?: string;
};

export const MAX_HOME_HERO_IMAGES = 6;
export const MAX_HOME_HERO_IMAGE_BYTES = 5 * 1024 * 1024;

export const DEFAULT_HOME_HERO_IMAGES: HomeHeroImage[] = [{
  id: "store",
  imageUrl: "/mystic-essence-store-saturated.png",
}];

export function normalizeHomeHeroImages(value: unknown): HomeHeroImage[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  const urls = new Set<string>();
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const image = entry as Partial<HomeHeroImage>;
    const id = typeof image.id === "string" ? image.id.trim() : "";
    const imageUrl = typeof image.imageUrl === "string" ? image.imageUrl.trim() : "";
    if (!id || !imageUrl || ids.has(id) || urls.has(imageUrl)) return [];
    ids.add(id);
    urls.add(imageUrl);
    const imagePath = typeof image.imagePath === "string" ? image.imagePath.trim() : "";
    return [{ id, imageUrl, ...(imagePath ? { imagePath } : {}) }];
  }).slice(0, MAX_HOME_HERO_IMAGES);
}

export function validateHomeHeroImageFiles(files: Pick<File, "type" | "size">[], existingCount: number) {
  if (existingCount + files.length > MAX_HOME_HERO_IMAGES) return "count";
  if (files.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type))) return "type";
  if (files.some((file) => file.size === 0 || file.size >= MAX_HOME_HERO_IMAGE_BYTES)) return "size";
  return null;
}

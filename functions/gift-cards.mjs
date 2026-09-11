export const GIFT_CARD_PRODUCT_ID = "gift-card";
export const GIFT_CARD_VALUES = Object.freeze([30, 50, 80, 100]);

export function giftCardValueForVolume(volume) {
  const value = Number(String(volume ?? "").replace(/[^0-9.,]/g, "").replace(",", "."));
  return GIFT_CARD_VALUES.includes(value) ? value : null;
}

export function normalizeGiftCardBalance(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100) / 100;
}

export function giftCardAmountForTotal(balance, total) {
  return Math.round(Math.min(normalizeGiftCardBalance(balance), normalizeGiftCardBalance(total)) * 100) / 100;
}

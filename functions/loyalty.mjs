export const LOYALTY_REWARDS = Object.freeze([
  Object.freeze({ id: "points-100", points: 100, kind: "fixed", value: 5 }),
  Object.freeze({ id: "points-200", points: 200, kind: "fixed", value: 12 }),
  Object.freeze({ id: "points-350", points: 350, kind: "fixed", value: 20 }),
  Object.freeze({ id: "points-500", points: 500, kind: "fixed", value: 30 }),
  Object.freeze({ id: "points-750", points: 750, kind: "percentage", value: 10, gift: true }),
]);

export function loyaltyRewardById(id) {
  return LOYALTY_REWARDS.find((reward) => reward.id === id) ?? null;
}

export function normalizeLoyaltyPoints(value) {
  const points = Number(value);
  return Number.isInteger(points) && points > 0 ? points : 0;
}

export function loyaltyDiscountForSubtotal(reward, subtotal) {
  const eligibleSubtotal = Math.max(0, Number(subtotal) || 0);
  if (!reward || eligibleSubtotal <= 0) return 0;
  const discount = reward.kind === "percentage"
    ? eligibleSubtotal * reward.value / 100
    : reward.value;
  return Math.round(Math.min(eligibleSubtotal, discount) * 100) / 100;
}

export function loyaltyPointsForAmount(value) {
  return Math.max(0, Math.floor((Number(value) || 0) + 0.000001));
}

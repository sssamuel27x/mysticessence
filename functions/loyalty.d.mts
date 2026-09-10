export type LoyaltyReward = {
  readonly id: string;
  readonly points: number;
  readonly kind: "fixed" | "percentage";
  readonly value: number;
  readonly gift?: boolean;
};

export const LOYALTY_REWARDS: readonly LoyaltyReward[];
export function loyaltyRewardById(id: string): LoyaltyReward | null;
export function normalizeLoyaltyPoints(value: unknown): number;
export function loyaltyDiscountForSubtotal(reward: LoyaltyReward | null, subtotal: number): number;
export function loyaltyPointsForAmount(value: number): number;

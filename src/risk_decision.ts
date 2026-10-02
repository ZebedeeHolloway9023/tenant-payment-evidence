export type RiskDecision = "release_receipt" | "manual_review";

export function decidePaymentAction(
  amountMinor: number,
  riskScore: number,
): RiskDecision {
  return riskScore >= 70 || amountMinor >= 500_000
    ? "manual_review"
    : "release_receipt";
}

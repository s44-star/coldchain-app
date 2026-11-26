/**
 * Companies in India buy rupee plans through domestic Razorpay; every other
 * country buys US-dollar plans. Plans carry the same code with an "_in" suffix.
 */
export type Market = "global" | "in";

export function marketForCountry(countryCode: string | null | undefined): Market {
  return countryCode === "IN" ? "in" : "global";
}

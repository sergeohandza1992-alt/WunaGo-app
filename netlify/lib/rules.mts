// Règles métier WunaGo — partagées par le serveur (source de vérité des prix).

export const SERVICES = {
  parcel: { pricing: "weight", rate: 1000 },
  laundry: { pricing: "weight", rate: 1300 },
  errand: { pricing: "flat", price: 1000 },
  ride: { pricing: "flat", price: 700 },
} as const;

export type ServiceKey = keyof typeof SERVICES;
export const VEHICLES = ["bike", "tricycle", "van"] as const;
export const PAY_METHODS = ["orange_money", "mtn_momo", "wallet", "cash", "card"] as const;
export const STATUSES = ["received", "picked_up", "en_route", "delivered"] as const;

/** Colis / pressing : 1 kg offert dès 5 kg, livraison offerte dès 10 kg. Courses et déplacements : forfait. */
export function computePrice(service: ServiceKey, weightKg: number) {
  const s = SERVICES[service];
  if (s.pricing === "flat") return { gross: s.price, discount: 0, net: s.price };
  const gross = Math.round(weightKg * s.rate);
  if (weightKg >= 10) return { gross, discount: gross, net: 0 };
  if (weightKg >= 5) return { gross, discount: s.rate, net: gross - s.rate };
  return { gross, discount: 0, net: gross };
}

/** Numéro camerounais : 9 chiffres commençant par 6 (on accepte +237 / 237 devant). */
export function normalizePhone(input: unknown): string | null {
  const d = String(input ?? "").replace(/\D/g, "").replace(/^237(?=6\d{8}$)/, "");
  return /^6\d{8}$/.test(d) ? d : null;
}

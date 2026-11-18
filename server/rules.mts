// Règles métier WunaGo côté serveur. La grille tarifaire est partagée avec l'app (web/pricing.mjs).

export { quote, TARIFS, distanceKm, courierShare, returnFee, QUARTIERS } from "../web/pricing.mjs";

export const SERVICES = ["parcel", "laundry", "errand", "ride"] as const;
export const VEHICLES = ["bike", "tricycle", "van", "car"] as const;
export const PAY_METHODS = ["orange_money", "mtn_momo", "wallet", "cash", "card"] as const;
export const STATUSES = ["received", "picked_up", "en_route", "delivered"] as const;

/** Numéro camerounais : 9 chiffres commençant par 6 (on accepte +237 / 237 devant). */
export function normalizePhone(input: unknown): string | null {
  const d = String(input ?? "").replace(/\D/g, "").replace(/^237(?=6\d{8}$)/, "");
  return /^6\d{8}$/.test(d) ? d : null;
}

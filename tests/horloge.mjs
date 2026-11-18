// Horloge des tests : le service est ouvert de 6 h à 22 h (Douala). Si les tests tournent tard le soir ou la nuit,
// l'heure est décalée à midi (même date) dans Node, le serveur local et le navigateur, pour qu'ils passent à toute heure.
const now = Date.now(), local = new Date(now + 3600000), h = local.getUTCHours();
export const OFFSET = h >= 7 && h < 21 ? 0 : Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 12) - 3600000 - now;
const shift = (off) => `(() => { const off = ${off}; if (!off) return; const R = Date;
  class D extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + off); } static now() { return R.now() + off; } }
  globalThis.Date = D; })();`;
export function fixNode() { if (OFFSET) (0, eval)(shift(OFFSET)); }
export async function fixClock(ctx) {
  if (OFFSET) await ctx.addInitScript(shift(OFFSET));
  /* les anciens tests couvrent aussi le pressing et les courses, masqués sur l'accueil : on les réaffiche */
  await ctx.addInitScript(() => { if (window.WG_ALL_SERVICES === undefined) window.WG_ALL_SERVICES = true; });
}

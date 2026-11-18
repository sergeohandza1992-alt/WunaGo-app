// Alertes automatiques (appelées toutes les 2 minutes par la fonction planifiée « alertes ») :
// 1. une course non prise après 3 min est proposée à tous les livreurs en ligne ;
// 2. une commande sans livreur depuis 10 min est signalée à l'équipe WunaGo (backoffice).
import { sendPush } from "./push.mts";

const SVC_FR: Record<string, string> = { parcel: "Livraison colis", laundry: "Pressing", errand: "Courses", ride: "Déplacement" };
const WAIT = `status = 'received' AND courier_id IS NULL AND (scheduled_at IS NULL OR scheduled_at <= NOW() + INTERVAL '1 hour')`;

export async function runAlerts(db: any) {
  const broadcast = await db.sql`
    UPDATE orders SET broadcast_at = NOW() WHERE id IN (
      SELECT id FROM orders WHERE status = 'received' AND courier_id IS NULL AND broadcast_at IS NULL
        AND (scheduled_at IS NULL OR scheduled_at <= NOW() + INTERVAL '1 hour') AND created_at < NOW() - INTERVAL '3 minutes')
    RETURNING id, code, service, pickup, price_net`;
  if (broadcast.length) {
    const couriers = await db.sql`SELECT id FROM users WHERE role = 'courier' AND online`;
    const o = broadcast[0];
    await sendPush(db, couriers.map((c: any) => c.id), {
      title: broadcast.length > 1 ? broadcast.length + " courses disponibles" : "Course disponible · " + SVC_FR[o.service],
      body: broadcast.length > 1 ? "Ouvrez WunaGo pour en accepter une." : o.pickup, url: "/#courses", tag: "offres" }, "offers");
  }
  const late = await db.sql`
    UPDATE orders SET alerted_at = NOW() WHERE id IN (
      SELECT id FROM orders WHERE status = 'received' AND courier_id IS NULL AND alerted_at IS NULL
        AND GREATEST(created_at, COALESCE(scheduled_at, created_at) - INTERVAL '1 hour') < NOW() - INTERVAL '10 minutes')
    RETURNING code, pickup`;
  if (late.length) {
    const admins = await db.sql`SELECT id FROM users WHERE role = 'admin'`;
    await sendPush(db, admins.map((a: any) => a.id), {
      title: late.length > 1 ? late.length + " commandes attendent un livreur" : "Commande sans livreur · " + late[0].code,
      body: late.length > 1 ? "Depuis plus de 10 minutes. Assignez-les depuis le backoffice." : "Depuis plus de 10 minutes · départ " + late[0].pickup,
      url: "/admin.html", tag: "retards" }, "orders");
  }
  return { broadcast: broadcast.length, late: late.length };
}
export { WAIT };

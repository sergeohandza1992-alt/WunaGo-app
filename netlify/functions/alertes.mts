// Fonction planifiée (gratuite sur Netlify) : relance des courses non prises et alertes au backoffice.
import { getDatabase } from "@netlify/database";
import { runAlerts } from "../lib/alerts.mts";

export default async () => {
  const r = await runAlerts(getDatabase());
  console.log("alertes", JSON.stringify(r));
};

export const config = { schedule: "*/2 * * * *" };

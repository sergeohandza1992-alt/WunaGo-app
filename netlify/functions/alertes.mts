// Fonction planifiée Netlify (si l'hébergement Netlify reprend) : relance des courses et alertes au backoffice.
import { getDatabase } from "@netlify/database";
import { runAlerts } from "../../server/alerts.mts";

export default async () => {
  const r = await runAlerts(getDatabase());
  console.log("alertes", JSON.stringify(r));
};

export const config = { schedule: "*/2 * * * *" };

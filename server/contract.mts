/* Contrat de prestation du livreur WunaGo — ÉBAUCHE à faire valider par un juriste avant usage réel.
   Toute modification du texte doit changer CONTRACT_VERSION : chaque livreur accepte une version précise (date + heure enregistrées). */
import { TARIFS } from "./rules.mts";

export const CONTRACT_VERSION = "2026-11-v1";

export function contractText(d: { name?: string; cni?: string; vehicle?: string } = {}): { version: string; title: string; articles: { t: string; p: string }[] } {
  const part = Math.round((TARIFS.partLivreur || 0.8) * 100);
  const who = d.name ? d.name + (d.cni ? " (CNI n° " + d.cni + ")" : "") : "le Livreur";
  return {
    version: CONTRACT_VERSION,
    title: "Contrat de prestation de services de livraison — Livreur partenaire WunaGo",
    articles: [
      { t: "1. Parties", p: "Entre WunaGo, service de livraison à Douala, ci-après « WunaGo », et " + who + ", ci-après « le Livreur », qui exerce en prestataire indépendant." },
      { t: "2. Objet", p: "Le Livreur réalise, à sa demande et selon ses disponibilités, des livraisons de colis et des trajets proposés par la plateforme WunaGo, à Douala et ses environs." },
      { t: "3. Indépendance", p: "Le Livreur est libre d'accepter ou de refuser une course et choisit ses heures de connexion. Il n'existe aucun lien de subordination. Il reste responsable de ses obligations fiscales et sociales." },
      { t: "4. Rémunération", p: "Pour chaque course livrée, le Livreur perçoit " + part + " % des frais de transport payés par le client, affichés avant d'accepter la course (« gain estimé »). Les frais de retour à l'expéditeur suivent la même règle." },
      { t: "5. Encaissements en espèces", p: "Lorsque le client paie en espèces, le Livreur encaisse le montant affiché et reverse à WunaGo la part qui lui revient, au plus tard sous 24 heures, par Orange Money, MTN MoMo ou en agence. Le solde est visible à tout moment dans son espace." },
      { t: "6. Remise du colis", p: "Le Livreur ne remet un colis qu'après confirmation du destinataire sur la plateforme (code affiché par le Livreur), ou, à défaut, avec le code de secours ou le nom et la photo de la personne qui reçoit. En cas d'absence ou de refus, il rapporte le colis à l'expéditeur." },
      { t: "7. Soin des colis", p: "Le Livreur transporte les colis avec soin, sans les ouvrir. Il signale immédiatement à WunaGo tout incident (perte, casse, accident, retard). Les dommages dus à une faute prouvée du Livreur peuvent lui être imputés après échange contradictoire." },
      { t: "8. Véhicule et documents", p: "Le Livreur utilise un véhicule en bon état, conduit avec un permis valide correspondant à sa catégorie, porte un casque (moto) et respecte le code de la route. Il informe WunaGo de toute suspension de permis." },
      { t: "9. Comportement", p: "Le Livreur est courtois, ponctuel et honnête avec les clients. Toute fraude (faux code, détournement d'espèces, fausse déclaration) entraîne la désactivation immédiate du compte, sans préjudice de poursuites." },
      { t: "10. Garant", p: "Le garant indiqué dans le dossier accepte d'être contacté par WunaGo en cas de manquement grave du Livreur, notamment de non-reversement des espèces encaissées." },
      { t: "11. Données personnelles", p: "WunaGo traite les informations et pièces du dossier (identité, CNI, permis, photo, domicile, garant) pour vérifier l'identité du Livreur, gérer les courses, les paiements et la sécurité des clients, conformément à la loi n° 2024/017 du 23 décembre 2024. Seule l'équipe habilitée y accède. Elles sont conservées pendant la collaboration puis la durée légale. Le Livreur peut demander l'accès, la rectification ou la suppression de ses données au service client." },
      { t: "12. Durée et fin", p: "Le contrat prend effet à la validation du dossier par WunaGo, pour une durée indéterminée. Chaque partie peut y mettre fin à tout moment, par écrit (message dans l'application). Les sommes dues restent exigibles." },
      { t: "13. Litiges", p: "Les parties cherchent d'abord une solution amiable. À défaut, les juridictions compétentes de Douala sont saisies." }
    ]
  };
}

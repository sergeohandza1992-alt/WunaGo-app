-- « Je suis arrivé » : le livreur prévient le client (et le destinataire via le lien de suivi).
ALTER TABLE orders ADD COLUMN arrived_at TIMESTAMPTZ;
-- commande créée par l'équipe WunaGo pour un client (appel, WhatsApp)
ALTER TABLE orders ADD COLUMN created_by UUID REFERENCES users(id);

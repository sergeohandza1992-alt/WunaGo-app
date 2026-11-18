-- Remise contrôlée : code affiché sur le téléphone du livreur, que le destinataire saisit sur sa page de suivi pour confirmer la réception.
ALTER TABLE orders ADD COLUMN handover_code TEXT;
ALTER TABLE orders ADD COLUMN handover_tries INTEGER NOT NULL DEFAULT 0;

-- Expérience utilisateur : code de remise, lien de suivi partageable, alertes, versements des livreurs.

ALTER TABLE orders ADD COLUMN delivery_code TEXT;          -- code à 4 chiffres donné par le destinataire au livreur
ALTER TABLE orders ADD COLUMN track_token   TEXT;          -- lien de suivi public (sans compte)
ALTER TABLE orders ADD COLUMN broadcast_at  TIMESTAMPTZ;   -- course proposée à tous les livreurs en ligne
ALTER TABLE orders ADD COLUMN alerted_at    TIMESTAMPTZ;   -- alerte « en attente d'un livreur » envoyée au backoffice
ALTER TABLE orders ADD COLUMN delivered_with TEXT;         -- 'code' | 'name' (preuve utilisée à la remise)
CREATE UNIQUE INDEX orders_track_token_idx ON orders(track_token) WHERE track_token IS NOT NULL;

-- versements entre livreurs et WunaGo (positif : le livreur remet l'argent à WunaGo ; négatif : WunaGo paie le livreur)
CREATE TABLE courier_payments (
  id          BIGSERIAL PRIMARY KEY,
  courier_id  UUID NOT NULL REFERENCES users(id),
  amount      INTEGER NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX courier_payments_idx ON courier_payments(courier_id, created_at DESC);

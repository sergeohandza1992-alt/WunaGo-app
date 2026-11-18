-- Espace commerçants : profil du commerce (boutique, restaurant, e-commerce…), rattaché à un compte client.
-- WunaGo ne gère que la livraison : aucune donnée de vente ni d'argent des marchandises.
CREATE TABLE merchants (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'shop' CHECK (kind IN ('shop', 'restaurant', 'ecommerce', 'pharmacy', 'other')),
  area        TEXT,
  place_code  TEXT,                        -- Code WunaGo de la boutique (point de départ par défaut, autocollant)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX merchants_place_idx ON merchants(place_code);
-- Envois groupés : plusieurs liens créés d'un coup
ALTER TABLE delivery_links ADD COLUMN batch_id UUID;

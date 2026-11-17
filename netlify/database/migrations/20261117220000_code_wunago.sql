-- Code WunaGo : une adresse en 6 caractères (WG-XXXX) qui retient le point GPS exact, le repère, le nom et le numéro.
CREATE TABLE places (
  code        TEXT PRIMARY KEY,                 -- ex. WG-7K3Q
  user_id     UUID NOT NULL REFERENCES users(id),
  label       TEXT NOT NULL DEFAULT 'Maison',   -- Maison, Bureau, Boutique…
  place_name  TEXT NOT NULL DEFAULT '',         -- nom du lieu (facultatif) : résidence, boutique…
  area        TEXT NOT NULL DEFAULT '',         -- quartier le plus proche
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  hint        TEXT NOT NULL DEFAULT '',         -- point de repère
  uses        INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX places_user_idx ON places(user_id);

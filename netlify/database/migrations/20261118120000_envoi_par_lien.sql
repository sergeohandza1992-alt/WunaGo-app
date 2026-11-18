-- Envoi par lien : « Envoyer à… » / « Recevoir de… » un simple numéro de téléphone.
-- L'autre personne reçoit un lien (WhatsApp) et choisit elle-même le lieu ; la course part après confirmation du prix par celui qui paie.
CREATE TABLE delivery_links (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token          TEXT NOT NULL UNIQUE,
  user_id        UUID NOT NULL REFERENCES users(id),          -- celui qui crée le lien
  direction      TEXT NOT NULL CHECK (direction IN ('send', 'receive')),
  contact_phone  TEXT NOT NULL,
  contact_name   TEXT NOT NULL DEFAULT '',
  mine           JSONB NOT NULL,                              -- mon côté : { text, lat, lng, code, hint }
  other          JSONB,                                       -- lieu choisi par l'autre : { text, lat, lng, code, hint, person: { name, phone } }
  payer          TEXT NOT NULL CHECK (payer IN ('me', 'them')),
  payment_method TEXT NOT NULL DEFAULT 'cash',
  size           TEXT NOT NULL DEFAULT 'small',
  note           TEXT NOT NULL DEFAULT '',
  price_net      INTEGER,
  status         TEXT NOT NULL DEFAULT 'waiting_place' CHECK (status IN ('waiting_place', 'waiting_confirm', 'ordered', 'cancelled')),
  order_id       UUID REFERENCES orders(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL
);
CREATE INDEX delivery_links_user_idx ON delivery_links(user_id, status);

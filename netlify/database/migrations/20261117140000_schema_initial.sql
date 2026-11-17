-- WunaGo — schéma initial : clients, connexion par code, commandes, portefeuille, réclamations.

CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone          TEXT NOT NULL UNIQUE,              -- 9 chiffres, sans +237
  name           TEXT,
  wallet_balance INTEGER NOT NULL DEFAULT 0 CHECK (wallet_balance >= 0),
  prefs          JSONB NOT NULL DEFAULT '{}'::jsonb, -- adresses, numéros Mobile Money, notifications, langue
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE otp_codes (
  phone      TEXT PRIMARY KEY,
  code_hash  TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE SEQUENCE order_code_seq;
CREATE TABLE orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT NOT NULL UNIQUE,
  user_id        UUID NOT NULL REFERENCES users(id),
  service        TEXT NOT NULL CHECK (service IN ('parcel','laundry','errand','ride')),
  pickup         TEXT NOT NULL,
  dropoff        TEXT NOT NULL,
  pickup_lat     DOUBLE PRECISION, pickup_lng  DOUBLE PRECISION,
  dropoff_lat    DOUBLE PRECISION, dropoff_lng DOUBLE PRECISION,
  weight_kg      NUMERIC(6,1) NOT NULL DEFAULT 0,
  vehicle        TEXT NOT NULL CHECK (vehicle IN ('bike','tricycle','van')),
  note           TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL CHECK (payment_method IN ('orange_money','mtn_momo','wallet','cash','card')),
  payment_status TEXT NOT NULL,                       -- paid | cod | refunded | refund_pending
  price_gross    INTEGER NOT NULL,
  discount       INTEGER NOT NULL DEFAULT 0,
  price_net      INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'received',    -- received | picked_up | en_route | delivered | cancelled
  stage          INTEGER NOT NULL DEFAULT 0,
  en_route_at    TIMESTAMPTZ,
  delivered_at   TIMESTAMPTZ,
  rating         INTEGER CHECK (rating BETWEEN 1 AND 5),
  cancel_reason  TEXT,
  refund_note    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX orders_user_idx ON orders(user_id, created_at DESC);

CREATE TABLE wallet_tx (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id),
  amount     INTEGER NOT NULL,                       -- positif = crédit, négatif = débit
  kind       TEXT NOT NULL,                          -- topup | order | refund | send | receive
  order_id   UUID REFERENCES orders(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX wallet_tx_user_idx ON wallet_tx(user_id, created_at DESC);

CREATE SEQUENCE dispute_code_seq;
CREATE TABLE disputes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  user_id     UUID NOT NULL REFERENCES users(id),
  order_id    UUID NOT NULL REFERENCES orders(id),
  reason      TEXT NOT NULL,
  description TEXT NOT NULL,
  photo       TEXT,                                  -- image JPEG réduite (data URL)
  status      TEXT NOT NULL DEFAULT 'open',          -- open | review | closed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX disputes_user_idx ON disputes(user_id, created_at DESC);

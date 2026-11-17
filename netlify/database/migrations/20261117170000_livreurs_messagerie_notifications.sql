-- Rôles (client, livreur, administrateur), livreurs et position, messagerie, notifications, traitement des réclamations.

ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client','courier','admin'));
ALTER TABLE users ADD COLUMN courier JSONB NOT NULL DEFAULT '{}'::jsonb;   -- véhicule, plaque
ALTER TABLE users ADD COLUMN online BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN pos_lat DOUBLE PRECISION;
ALTER TABLE users ADD COLUMN pos_lng DOUBLE PRECISION;
ALTER TABLE users ADD COLUMN pos_at TIMESTAMPTZ;

ALTER TABLE orders ADD COLUMN courier_id UUID REFERENCES users(id);
ALTER TABLE orders ADD COLUMN assigned_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN proof_photo TEXT;
ALTER TABLE orders ADD COLUMN proof_name TEXT;
CREATE INDEX orders_open_idx ON orders(created_at DESC) WHERE courier_id IS NULL AND status = 'received';
CREATE INDEX orders_courier_idx ON orders(courier_id, created_at DESC);

CREATE TABLE conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            TEXT NOT NULL CHECK (kind IN ('support','order','direct')),
  owner_id        UUID REFERENCES users(id),      -- client (support), client (order)
  order_id        UUID REFERENCES orders(id),
  direct_key      TEXT UNIQUE,                    -- "idA:idB" trié, discussions entre deux utilisateurs
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX conversations_support_owner ON conversations(owner_id) WHERE kind = 'support';
CREATE UNIQUE INDEX conversations_order ON conversations(order_id) WHERE kind = 'order';

CREATE TABLE conversation_members (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id),
  last_read_id    BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX conversation_members_user_idx ON conversation_members(user_id);

CREATE TABLE messages (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID REFERENCES users(id),
  body            TEXT NOT NULL,
  photo           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX messages_conversation_idx ON messages(conversation_id, id);

CREATE TABLE push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  keys       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions(user_id);

ALTER TABLE disputes ADD COLUMN admin_reply TEXT;
ALTER TABLE disputes ADD COLUMN updated_at TIMESTAMPTZ;

-- Paiements mobile money (SasPay) : chaque recharge passe par une page de paiement hébergée.
-- Le portefeuille n'est crédité qu'après confirmation par l'API SasPay (jamais sur le seul retour du client).
CREATE TABLE payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id),
  purpose        TEXT NOT NULL DEFAULT 'topup',        -- topup (recharge du portefeuille)
  amount         INTEGER NOT NULL,                      -- montant demandé (FCFA)
  provider       TEXT NOT NULL DEFAULT 'saspay',
  mode           TEXT NOT NULL DEFAULT 'test',          -- test | live
  session_id     TEXT,                                  -- session de paiement SasPay
  transaction_id TEXT,                                  -- transaction SasPay (une fois payée)
  checkout_url   TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',       -- pending | paid | failed | expired | review
  fee            INTEGER,                               -- frais SasPay constatés, pour information
  network        TEXT,
  last_check     TIMESTAMPTZ,
  paid_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX payments_user_idx ON payments(user_id, created_at DESC);
CREATE INDEX payments_pending_idx ON payments(created_at) WHERE status = 'pending';
CREATE UNIQUE INDEX payments_tx_idx ON payments(transaction_id) WHERE transaction_id IS NOT NULL;
ALTER TABLE wallet_tx ADD COLUMN payment_id UUID REFERENCES payments(id);
CREATE UNIQUE INDEX wallet_tx_payment_idx ON wallet_tx(payment_id) WHERE payment_id IS NOT NULL;

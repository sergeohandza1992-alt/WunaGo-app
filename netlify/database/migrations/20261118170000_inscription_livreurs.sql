-- Inscription des livreurs : dossier (identité, permis, domicile, garant, véhicule), pièces justificatives, contrat accepté.
CREATE TABLE courier_applications (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL UNIQUE REFERENCES users(id),
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  data               JSONB NOT NULL DEFAULT '{}'::jsonb,
  contract_version   TEXT,
  accepted_at        TIMESTAMPTZ,
  accepted_via       TEXT,                                  -- 'self' (son téléphone) ou 'agent' (en agence, en sa présence)
  accepted_agent     UUID REFERENCES users(id),
  created_by         UUID REFERENCES users(id),             -- agent qui a ouvert le dossier
  reviewed_by        UUID REFERENCES users(id),
  reviewed_at        TIMESTAMPTZ,
  review_note        TEXT,
  submitted_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX courier_applications_status_idx ON courier_applications(status, submitted_at);
CREATE TABLE courier_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES courier_applications(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,
  mime            TEXT NOT NULL,
  data            TEXT NOT NULL,                            -- image compressée, en base64
  bytes           INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (application_id, kind)
);

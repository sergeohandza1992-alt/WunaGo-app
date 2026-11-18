-- Paramètres de l'application gardés en base (ex. clés des notifications générées automatiquement au premier démarrage).
CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Parcours dédiés (pressing, courses, déplacement), grille tarifaire détaillée, voiture, suppression de compte.

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_vehicle_check;
ALTER TABLE orders ADD CONSTRAINT orders_vehicle_check CHECK (vehicle IN ('bike','tricycle','van','car'));

ALTER TABLE orders ADD COLUMN details      JSONB NOT NULL DEFAULT '{}'::jsonb; -- articles pressing, liste d'achats, passagers
ALTER TABLE orders ADD COLUMN price_lines  JSONB;                              -- détail du devis (livraison, zone, heure…)
ALTER TABLE orders ADD COLUMN distance_km  NUMERIC(6,1);
ALTER TABLE orders ADD COLUMN zone         SMALLINT;
ALTER TABLE orders ADD COLUMN scheduled_at TIMESTAMPTZ;

ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;

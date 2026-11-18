-- Commerce : secteur d'activité et photo du point de vente ; photo du colis jointe à un envoi.
ALTER TABLE merchants ADD COLUMN activity TEXT NOT NULL DEFAULT '';
ALTER TABLE merchants ADD COLUMN photo TEXT;          -- image compressée (data URL), vitrine ou enseigne
CREATE TABLE parcel_photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id     UUID REFERENCES delivery_links(id) ON DELETE CASCADE,
  order_id    UUID REFERENCES orders(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  image       TEXT NOT NULL,                          -- data URL JPEG compressée
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX parcel_photos_link_idx ON parcel_photos(link_id) WHERE link_id IS NOT NULL;
CREATE UNIQUE INDEX parcel_photos_order_idx ON parcel_photos(order_id) WHERE order_id IS NOT NULL;

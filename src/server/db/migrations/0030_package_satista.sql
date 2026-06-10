-- satista=false → paket katalogda görünür ama satın alınamaz ("en kısa sürede satışta")
ALTER TABLE packages ADD COLUMN IF NOT EXISTS satista boolean NOT NULL DEFAULT true;

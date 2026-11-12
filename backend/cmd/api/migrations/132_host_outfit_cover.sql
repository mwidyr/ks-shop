-- Host photo shown at the top of each Outfit card on the storefront (landscape 3:2, uploaded in Website Hosts > Outfits).
ALTER TABLE host_outfits ADD COLUMN IF NOT EXISTS cover_url TEXT;

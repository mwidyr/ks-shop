-- Export templates (7-ELEVEN .xlsm, FamilyMart .xlsx) uploaded by staff from the Shipping Workbench.
-- Append-only history; at most one row per provider is active. No active row = the template that ships
-- with the app (frontend/public/cvs-templates) is used. Kept in the database (not on disk) so a rebuilt
-- container never loses it and it is backed up with everything else.
CREATE TABLE shipping_templates (
    id          SERIAL PRIMARY KEY,
    provider    TEXT NOT NULL CHECK (provider IN ('cvs_711', 'cvs_familymart')),
    filename    TEXT NOT NULL,
    version     TEXT NOT NULL DEFAULT '',
    content     BYTEA NOT NULL,
    size_bytes  INT NOT NULL,
    uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    active      BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX shipping_templates_one_active ON shipping_templates (provider) WHERE active;
CREATE INDEX shipping_templates_provider ON shipping_templates (provider, uploaded_at DESC);

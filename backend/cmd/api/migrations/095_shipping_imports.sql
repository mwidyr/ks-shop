-- =========================================================
-- Shipping Workbench, step 4: import history and import issues.
--   shipping_import_log     every uploaded Excel (parsed client-side into normalised records and
--                           posted as JSON): kind, file name, SHA-256 of the file, who/when, and
--                           a summary of what it changed. Re-uploading the same file is safe - the
--                           records are applied idempotently - and is simply logged again.
--   shipping_import_issues  rows that could not be matched reliably or that conflict with what the
--                           ERP already holds. They are never applied by guessing; staff review them
--                           (Pending Issues). `ref` is the row's best identifier, so a later
--                           successful import of the same identifier resolves the issue.
-- =========================================================

CREATE TABLE IF NOT EXISTS shipping_import_log (
    id         SERIAL PRIMARY KEY,
    batch_id   INT REFERENCES shipping_batches(id),
    provider   VARCHAR(20),
    kind       VARCHAR(30) NOT NULL,
    file_name  TEXT NOT NULL DEFAULT '',
    file_hash  VARCHAR(64) NOT NULL DEFAULT '',
    user_id    INT REFERENCES users(id),
    summary    JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shipping_import_log_batch ON shipping_import_log(batch_id, created_at DESC);

CREATE TABLE IF NOT EXISTS shipping_import_issues (
    id          SERIAL PRIMARY KEY,
    import_id   INT NOT NULL REFERENCES shipping_import_log(id) ON DELETE CASCADE,
    provider    VARCHAR(20),
    row_no      INT,
    issue       VARCHAR(40) NOT NULL,       -- unmatched | conflict | identifier_conflict | other_batch | not_in_batch | not_exported | not_ready | ...
    ref         TEXT NOT NULL DEFAULT '',
    detail      JSONB NOT NULL DEFAULT '{}',
    order_id    INT REFERENCES orders(id),
    resolved_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- one open issue per (issue, ref): a repeated upload doesn't pile up duplicates
CREATE UNIQUE INDEX IF NOT EXISTS uq_shipping_import_issues_open
    ON shipping_import_issues (issue, ref) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipping_import_issues_import ON shipping_import_issues(import_id);

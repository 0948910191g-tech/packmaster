-- Isolated from the existing marketplace registry database.
-- All mutations use optimistic revision checks; deletion is a tombstone.
CREATE TABLE IF NOT EXISTS workspace_batches (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  meta_json TEXT NOT NULL CHECK (json_valid(meta_json)),
  orders_key TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS workspace_batches_updated
  ON workspace_batches(deleted_at, updated_at DESC);

CREATE TABLE IF NOT EXISTS workspace_documents (
  doc_key TEXT PRIMARY KEY NOT NULL CHECK (doc_key IN (
    'skuMappingRules', 'archiveState', 'duplicateFingerprints',
    'sourceFiles', 'reprintSnapshots', 'settings'
  )),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  operation TEXT NOT NULL,
  actor TEXT NOT NULL,
  revision INTEGER NOT NULL,
  changed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS workspace_audit_changed
  ON workspace_audit(changed_at DESC);

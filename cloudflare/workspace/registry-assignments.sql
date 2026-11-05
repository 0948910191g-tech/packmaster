-- Additive Cloud MVP migration; existing Batch, Orders and SKU Mapping data are untouched.
CREATE TABLE IF NOT EXISTS workspace_registry_assignments (
  id TEXT PRIMARY KEY NOT NULL CHECK (id = 'registrySkuAssignments'),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL
);

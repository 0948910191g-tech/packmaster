CREATE TABLE IF NOT EXISTS packmaster_marketplace_registry (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  registry_json TEXT NOT NULL CHECK (json_valid(registry_json)),
  revision INTEGER NOT NULL CHECK (revision > 0),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
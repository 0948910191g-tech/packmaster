-- Immutable D1 snapshot chunks for Workers Free without R2/billing.
-- Free D1 limits: 500 MB per database; app enforces 4 MB per snapshot.
CREATE TABLE IF NOT EXISTS workspace_objects (
  object_key TEXT PRIMARY KEY NOT NULL,
  total_bytes INTEGER NOT NULL CHECK (total_bytes BETWEEN 0 AND 4194304),
  total_chunks INTEGER NOT NULL CHECK (total_chunks BETWEEN 1 AND 30),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_object_chunks (
  object_key TEXT NOT NULL REFERENCES workspace_objects(object_key) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK (chunk_index BETWEEN 0 AND 29),
  body BLOB NOT NULL CHECK (length(body) <= 196608),
  PRIMARY KEY (object_key, chunk_index)
);

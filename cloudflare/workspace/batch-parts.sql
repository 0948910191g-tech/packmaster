-- Additive staging index for Free-plan multipart Batch storage.
-- It does not alter or delete existing batches, orders or SKU assignments.
CREATE TABLE IF NOT EXISTS workspace_order_parts (
  object_key TEXT PRIMARY KEY NOT NULL REFERENCES workspace_objects(object_key) ON DELETE CASCADE,
  batch_id TEXT NOT NULL,
  part_hash TEXT NOT NULL CHECK (length(part_hash) = 64),
  order_ids_json TEXT NOT NULL CHECK (json_valid(order_ids_json)),
  order_count INTEGER NOT NULL CHECK (order_count BETWEEN 1 AND 5000),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS workspace_order_parts_batch
  ON workspace_order_parts(batch_id);

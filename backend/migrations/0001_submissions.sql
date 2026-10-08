-- No names, addresses, proposal text or documents are stored here.
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  payload_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'accepted')),
  lease_until INTEGER NOT NULL DEFAULT 0,
  provider_id TEXT,
  accepted_at INTEGER
);
CREATE INDEX IF NOT EXISTS submissions_created ON submissions(created_at);

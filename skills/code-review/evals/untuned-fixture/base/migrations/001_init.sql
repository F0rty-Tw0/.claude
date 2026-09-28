CREATE TABLE documents (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  owner_id    TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX documents_tenant_idx ON documents (tenant_id);

CREATE TABLE document_shares (
  document_id TEXT NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
  PRIMARY KEY (document_id, user_id)
);

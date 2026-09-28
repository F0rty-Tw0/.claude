CREATE TABLE share_links (
  token        TEXT PRIMARY KEY,
  document_id  TEXT NOT NULL,
  created_by   TEXT NOT NULL,
  expires_at   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX share_links_document_idx ON share_links (document_id);

ALTER TABLE documents ADD COLUMN link_count INTEGER NOT NULL;

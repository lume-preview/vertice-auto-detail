-- Banco D1: sessao de demonstracao isolada por navegador.
-- Execute SOMENTE depois de fazer backup e conferir o banco selecionado.
CREATE TABLE IF NOT EXISTS demo_instances (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  state_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_demo_instances_expiry
  ON demo_instances(expires_at);

-- Fase 2: labels e preferências de exibição dos cartões

CREATE TABLE labels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE task_labels (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);

-- Quais informações aparecem no cartão (JSON com flags)
ALTER TABLE boards ADD COLUMN card_fields TEXT NOT NULL
  DEFAULT '{"priority":true,"labels":true,"due":true,"start":false,"description":false}';

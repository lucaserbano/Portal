-- Status únicos para temas e roteiros: ideia, aprovado, roteirizado, design (design pronto), postado, descartado.
-- O SQLite não deixa mudar o CHECK; as tabelas são recriadas sem ele (a API valida os valores).
-- Cuidado: apagar a tabela antiga dispara as ações das chaves (SET NULL / CASCADE), então guardamos antes e restauramos depois.

CREATE TABLE _bk_script_theme AS SELECT id, theme_id FROM scripts;
CREATE TABLE _bk_script_images AS SELECT * FROM script_images;

-- temas
CREATE TABLE themes_new (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  pillar TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT 'reels',
  status TEXT NOT NULL DEFAULT 'ideia',
  task_id TEXT,
  position REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO themes_new SELECT id, client_id, title, notes, pillar, format, status, task_id, position, created_at, updated_at FROM themes;
DROP TABLE themes;
ALTER TABLE themes_new RENAME TO themes;
CREATE INDEX idx_themes_client ON themes(client_id, status);

-- roteiros (rascunho / em revisão / aprovado → roteirizado)
CREATE TABLE scripts_new (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  theme_id TEXT REFERENCES themes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'reels',
  status TEXT NOT NULL DEFAULT 'roteirizado',
  body_md TEXT NOT NULL DEFAULT '',
  task_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO scripts_new
  SELECT s.id, s.client_id, b.theme_id, s.title, s.format,
         CASE WHEN s.status = 'postado' THEN 'postado' ELSE 'roteirizado' END,
         s.body_md, s.task_id, s.created_at, s.updated_at
  FROM scripts s JOIN _bk_script_theme b ON b.id = s.id;
DROP TABLE scripts;
ALTER TABLE scripts_new RENAME TO scripts;
CREATE INDEX idx_scripts_client ON scripts(client_id, updated_at);

INSERT INTO script_images SELECT * FROM _bk_script_images WHERE id NOT IN (SELECT id FROM script_images);
DROP TABLE _bk_script_theme;
DROP TABLE _bk_script_images;

-- Etapas do roteiro na agenda (evento no calendário πύλη do iCloud)
CREATE TABLE script_events (
  script_id TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,            -- roteiro | design | publicar
  start INTEGER NOT NULL,
  href TEXT NOT NULL,
  PRIMARY KEY (script_id, kind)
);

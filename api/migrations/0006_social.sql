-- Fase 7: Social Media (clientes, temas, roteiros, modelos de roteiro)

CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  handle TEXT NOT NULL DEFAULT '',      -- @ do Instagram
  niche TEXT NOT NULL DEFAULT '',       -- nicho / o que faz
  audience TEXT NOT NULL DEFAULT '',    -- público
  voice TEXT NOT NULL DEFAULT '',       -- tom de voz
  pillars TEXT NOT NULL DEFAULT '',     -- pilares de conteúdo, um por linha
  dos TEXT NOT NULL DEFAULT '',         -- o que fazer / palavras que usa
  donts TEXT NOT NULL DEFAULT '',       -- o que evitar
  refs TEXT NOT NULL DEFAULT '',        -- referências (links), uma por linha
  notes TEXT NOT NULL DEFAULT '',
  position REAL NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Banco de temas (pautas)
CREATE TABLE themes (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  pillar TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT 'reels' CHECK (format IN ('reels','carrossel','estatico','stories','outro')),
  status TEXT NOT NULL DEFAULT 'ideia' CHECK (status IN ('ideia','aprovado','roteirizado','postado','descartado')),
  task_id TEXT,
  position REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_themes_client ON themes(client_id, status);

CREATE TABLE scripts (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  theme_id TEXT REFERENCES themes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'reels' CHECK (format IN ('reels','carrossel','estatico','stories','outro')),
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','revisao','aprovado','postado')),
  body_md TEXT NOT NULL DEFAULT '',
  task_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_scripts_client ON scripts(client_id, updated_at);

CREATE TABLE script_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'reels',
  body_md TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

-- Os modelos padrão são criados pela API na primeira vez (src/social.ts → DEFAULT_TEMPLATES).

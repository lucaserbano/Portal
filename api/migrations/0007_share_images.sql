-- Imagens dos roteiros, links para o cliente acompanhar, widget (só adições)

CREATE TABLE script_images (
  id TEXT PRIMARY KEY,
  script_id TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  mime TEXT,
  caption TEXT NOT NULL DEFAULT '',
  position REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_script_images ON script_images(script_id, position);

-- Link secreto de uma tarefa (o cliente vê o andamento)
ALTER TABLE tasks ADD COLUMN share_token TEXT;
ALTER TABLE tasks ADD COLUMN share_desc INTEGER NOT NULL DEFAULT 0; -- mostrar a descrição no link
-- Tarefa ligada a um cliente e visível na página dele
ALTER TABLE tasks ADD COLUMN client_id TEXT;
ALTER TABLE tasks ADD COLUMN client_visible INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX idx_tasks_share ON tasks(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX idx_tasks_client ON tasks(client_id);

-- Página do cliente
ALTER TABLE clients ADD COLUMN share_token TEXT;
CREATE UNIQUE INDEX idx_clients_share ON clients(share_token) WHERE share_token IS NOT NULL;

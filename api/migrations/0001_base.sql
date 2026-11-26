-- πύλη: esquema base (fase 1 e 2)

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT
);

CREATE TABLE login_attempts (
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX idx_login_attempts_ip ON login_attempts(ip, at);

CREATE TABLE boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position REAL NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- "Cards" no vocabulário do usuário = colunas do board
CREATE TABLE lists (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position REAL NOT NULL,
  is_final INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_lists_board ON lists(board_id, position);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description_md TEXT NOT NULL DEFAULT '',
  start_at INTEGER,
  due_at INTEGER,
  priority TEXT CHECK (priority IN ('bom','preocupante','critico')),
  color TEXT,
  cover_key TEXT,
  done_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Onde a tarefa aparece. Sem linhas = Inbox. Mais de uma = cartão espelho.
-- board_id sem list_id = atribuída só ao board.
CREATE TABLE task_placements (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  list_id TEXT REFERENCES lists(id) ON DELETE SET NULL,
  position REAL NOT NULL
);
CREATE INDEX idx_placements_list ON task_placements(list_id, position);
CREATE INDEX idx_placements_task ON task_placements(task_id);

CREATE TABLE task_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT
);
CREATE INDEX idx_history_task ON task_history(task_id, at);

-- Quadros iniciais
INSERT INTO boards (id, name, position, created_at) VALUES
  ('b_ars', 'Ars', 1, unixepoch()),
  ('b_enxerga', 'Enxerga', 2, unixepoch()),
  ('b_social', 'Social Media', 3, unixepoch()),
  ('b_gerais', 'Gerais', 4, unixepoch());

INSERT INTO lists (id, board_id, name, position, is_final, created_at) VALUES
  ('l_ars_1', 'b_ars', 'Clientes para contatar', 1, 0, unixepoch()),
  ('l_ars_2', 'b_ars', 'Pronto para iniciar', 2, 0, unixepoch()),
  ('l_ars_3', 'b_ars', 'Em produção', 3, 0, unixepoch()),
  ('l_ars_4', 'b_ars', 'Aguardando aprovação do cliente', 4, 0, unixepoch()),
  ('l_ars_5', 'b_ars', 'Projetos finalizados', 5, 1, unixepoch()),
  ('l_enx_1', 'b_enxerga', 'Clientes para contatar', 1, 0, unixepoch()),
  ('l_enx_2', 'b_enxerga', 'Aguardando data marcada ou gravação', 2, 0, unixepoch()),
  ('l_enx_3', 'b_enxerga', 'Em produção ou edição', 3, 0, unixepoch()),
  ('l_enx_4', 'b_enxerga', 'Aguardando aprovação do cliente', 4, 0, unixepoch()),
  ('l_enx_5', 'b_enxerga', 'Projetos finalizados', 5, 1, unixepoch()),
  ('l_soc_1', 'b_social', 'Clientes para contatar', 1, 0, unixepoch()),
  ('l_soc_2', 'b_social', 'Definir tema', 2, 0, unixepoch()),
  ('l_soc_3', 'b_social', 'Fazer roteiro', 3, 0, unixepoch()),
  ('l_soc_4', 'b_social', 'Enviar para Designer', 4, 0, unixepoch()),
  ('l_soc_5', 'b_social', 'Prontos para postagem', 5, 0, unixepoch()),
  ('l_soc_6', 'b_social', 'Postados', 6, 1, unixepoch()),
  ('l_ger_1', 'b_gerais', 'Para iniciar', 1, 0, unixepoch()),
  ('l_ger_2', 'b_gerais', 'Em produção', 2, 0, unixepoch()),
  ('l_ger_3', 'b_gerais', 'Finalizados', 3, 1, unixepoch());

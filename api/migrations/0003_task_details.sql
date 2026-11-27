-- Fase 3: membros, checklists, anexos, referências, modelos

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  created_at INTEGER NOT NULL
);

-- role: 'member' (responsável pela tarefa) ou 'mention' (@ na descrição)
CREATE TABLE task_people (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('member','mention')),
  PRIMARY KEY (task_id, person_id, role)
);

CREATE TABLE checklist_items (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  weight REAL,            -- % do trabalho da tarefa (NULL = divide o restante igualmente)
  done INTEGER NOT NULL DEFAULT 0,
  person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  position REAL NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_checklist_task ON checklist_items(task_id, position);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('link','file')),
  name TEXT NOT NULL,
  url TEXT,               -- para links
  r2_key TEXT,            -- para arquivos
  size INTEGER NOT NULL DEFAULT 0,
  mime TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_attachments_task ON attachments(task_id);

-- Referência de uma tarefa a outra (links task:<id> na descrição)
CREATE TABLE task_links (
  from_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (from_id, to_id)
);

CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data TEXT NOT NULL,     -- JSON: título, descrição, checklist, labels, prioridade, cor, capa
  cover_r2_key TEXT,
  cover_size INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- tasks.cover_key passa a guardar o id do anexo usado como capa

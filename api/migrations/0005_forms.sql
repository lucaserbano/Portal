-- Fase 6: formulários

-- fields: JSON [{id, type, label, help, required, options[], min, max}]
CREATE TABLE forms (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  fields TEXT NOT NULL DEFAULT '[]',
  open INTEGER NOT NULL DEFAULT 1,
  notify INTEGER NOT NULL DEFAULT 1,
  thanks TEXT NOT NULL DEFAULT 'Resposta enviada. Obrigado!',
  title_field TEXT,   -- campo cuja resposta vira o título da tarefa
  due_field TEXT,     -- campo (data) cuja resposta vira o prazo da tarefa
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- answers: JSON [{id, label, value}] (cópia dos rótulos no momento da resposta)
CREATE TABLE form_responses (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  answers TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'portal', -- portal | google
  ip_hash TEXT,
  read_at INTEGER,
  task_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_responses_form ON form_responses(form_id, created_at);
CREATE INDEX idx_responses_ip ON form_responses(ip_hash, created_at);

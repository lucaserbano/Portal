-- Fase 5: agenda (iCloud via CalDAV)

-- Configurações simples (pasta de calendários no iCloud, calendário πύλη, cache da lista)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- O que já foi enviado ao calendário πύλη para cada tarefa com data
CREATE TABLE task_sync (
  task_id TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  synced_at INTEGER NOT NULL
);

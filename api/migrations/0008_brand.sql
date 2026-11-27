-- Marca do cliente (manual de marca): cores e logotipo nas páginas públicas (formulário e acompanhamento).
-- Tudo vazio = a página fica com a cara padrão do πύλη.
ALTER TABLE clients ADD COLUMN brand_text TEXT;      -- cor dos textos
ALTER TABLE clients ADD COLUMN brand_bg TEXT;        -- plano de fundo
ALTER TABLE clients ADD COLUMN brand_section TEXT;   -- fundo das seções (perguntas / tarefas)
ALTER TABLE clients ADD COLUMN brand_question TEXT;  -- texto das perguntas / títulos das seções
ALTER TABLE clients ADD COLUMN brand_accent TEXT;    -- cor de destaque
ALTER TABLE clients ADD COLUMN brand_logo_key TEXT;  -- logotipo / capa (R2)
ALTER TABLE clients ADD COLUMN brand_logo_size INTEGER NOT NULL DEFAULT 0;
-- Formulário com a marca de um cliente
ALTER TABLE forms ADD COLUMN client_id TEXT;

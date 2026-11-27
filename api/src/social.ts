// Fase 7: Social Media — clientes, banco de temas, roteiros e modelos de roteiro
import { Hono } from 'hono';
import type { Env } from './index';

const now = () => Math.floor(Date.now() / 1000);
const newId = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
type Row = Record<string, any>;

const FORMATS = ['reels', 'carrossel', 'estatico', 'stories', 'outro'];
const THEME_STATUS = ['ideia', 'aprovado', 'roteirizado', 'postado', 'descartado'];
const SCRIPT_STATUS = ['rascunho', 'revisao', 'aprovado', 'postado'];
const FORMAT_NAME: Record<string, string> = { reels: 'Reels', carrossel: 'Carrossel', estatico: 'Post estático', stories: 'Stories', outro: 'Outro' };
const CLIENT_TEXT = ['name', 'handle', 'niche', 'audience', 'voice', 'pillars', 'dos', 'donts', 'refs', 'notes'];

export const social = new Hono<{ Bindings: Env }>();

/** UPDATE só com os campos permitidos */
async function update(env: Env, table: string, id: string, body: Row, allowed: Record<string, (v: unknown) => unknown>) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, clean] of Object.entries(allowed)) {
    if (body[k] === undefined) continue;
    sets.push(`${k} = ?`);
    vals.push(clean(body[k]));
  }
  if (!sets.length) return;
  sets.push('updated_at = ?');
  vals.push(now());
  await env.DB.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id).run();
}
const text = (max: number) => (v: unknown) => String(v ?? '').slice(0, max);
const oneOf = (list: string[], fallback: string) => (v: unknown) => (list.includes(String(v)) ? String(v) : fallback);

// ---------- Clientes ----------
social.get('/clients', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT c.id, c.name, c.handle, c.niche,
       (SELECT COUNT(*) FROM themes t WHERE t.client_id = c.id AND t.status IN ('ideia','aprovado')) AS open_themes,
       (SELECT COUNT(*) FROM scripts s WHERE s.client_id = c.id AND s.status != 'postado') AS open_scripts
     FROM clients c WHERE c.archived = 0 ORDER BY c.position, c.name`,
  ).all();
  return c.json({ clients: rows.results });
});

social.post('/clients', async (c) => {
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) return c.json({ error: 'Dê um nome ao cliente.' }, 400);
  const id = newId('cl');
  const max = await c.env.DB.prepare('SELECT COALESCE(MAX(position), 0) AS p FROM clients').first<{ p: number }>();
  await c.env.DB.prepare('INSERT INTO clients (id, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, name.trim().slice(0, 200), (max?.p ?? 0) + 1, now(), now())
    .run();
  return c.json({ id });
});

social.get('/clients/:id', async (c) => {
  const id = c.req.param('id');
  const client = await c.env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first();
  if (!client) return c.json({ error: 'Cliente não encontrado.' }, 404);
  const [themes, scripts] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM themes WHERE client_id = ? ORDER BY position DESC, created_at DESC').bind(id).all(),
    c.env.DB.prepare(
      `SELECT s.id, s.theme_id, s.title, s.format, s.status, s.task_id, s.updated_at, s.created_at, substr(s.body_md, 1, 160) AS excerpt
       FROM scripts s WHERE s.client_id = ? ORDER BY s.updated_at DESC`,
    )
      .bind(id)
      .all(),
  ]);
  return c.json({ client, themes: themes.results, scripts: scripts.results });
});

social.patch('/clients/:id', async (c) => {
  const b = await c.req.json<Row>();
  if (b.name !== undefined && !String(b.name).trim()) delete b.name;
  await update(c.env, 'clients', c.req.param('id'), b, Object.fromEntries(CLIENT_TEXT.map((k) => [k, text(k === 'name' ? 200 : 5000)])));
  return c.json({ ok: true });
});

// Arquivar (temas e roteiros ficam guardados)
social.delete('/clients/:id', async (c) => {
  await c.env.DB.prepare('UPDATE clients SET archived = 1, updated_at = ? WHERE id = ?').bind(now(), c.req.param('id')).run();
  return c.json({ ok: true });
});

// ---------- Temas ----------
social.post('/clients/:id/themes', async (c) => {
  const b = await c.req.json<Row>();
  const items: Row[] = Array.isArray(b.items) ? b.items : [b]; // aceita vários de uma vez (colar uma lista)
  const max = await c.env.DB.prepare('SELECT COALESCE(MAX(position), 0) AS p FROM themes WHERE client_id = ?').bind(c.req.param('id')).first<{ p: number }>();
  let pos = max?.p ?? 0;
  const ids: string[] = [];
  const stmts = items
    .filter((t) => String(t.title ?? '').trim())
    .slice(0, 100)
    .map((t) => {
      const id = newId('th');
      ids.push(id);
      return c.env.DB.prepare(
        'INSERT INTO themes (id, client_id, title, notes, pillar, format, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        id,
        c.req.param('id'),
        String(t.title).trim().slice(0, 500),
        text(5000)(t.notes),
        text(200)(t.pillar),
        oneOf(FORMATS, 'reels')(t.format),
        ++pos,
        now(),
        now(),
      );
    });
  if (!stmts.length) return c.json({ error: 'Escreva o tema.' }, 400);
  await c.env.DB.batch(stmts);
  return c.json({ ids });
});

social.patch('/themes/:id', async (c) => {
  await update(c.env, 'themes', c.req.param('id'), await c.req.json<Row>(), {
    title: text(500),
    notes: text(5000),
    pillar: text(200),
    format: oneOf(FORMATS, 'reels'),
    status: oneOf(THEME_STATUS, 'ideia'),
    position: (v) => Number(v) || 0,
  });
  return c.json({ ok: true });
});

social.delete('/themes/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM themes WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

// ---------- Roteiros ----------
social.post('/clients/:id/scripts', async (c) => {
  const b = await c.req.json<Row>();
  let body = '';
  let format = oneOf(FORMATS, 'reels')(b.format);
  let title = String(b.title ?? '').trim();
  if (b.template_id) {
    const t = await c.env.DB.prepare('SELECT * FROM script_templates WHERE id = ?').bind(b.template_id).first<Row>();
    if (t) {
      body = t.body_md;
      if (!b.format) format = t.format;
    }
  }
  if (b.theme_id) {
    const th = await c.env.DB.prepare('SELECT * FROM themes WHERE id = ? AND client_id = ?').bind(b.theme_id, c.req.param('id')).first<Row>();
    if (th) {
      title ||= th.title;
      if (!b.format && !b.template_id) format = th.format;
      if (th.notes) body = `> Tema: ${th.notes.replace(/\n/g, '\n> ')}\n\n${body}`;
      await c.env.DB.prepare("UPDATE themes SET status = 'roteirizado', updated_at = ? WHERE id = ? AND status IN ('ideia','aprovado')")
        .bind(now(), th.id)
        .run();
    }
  }
  const id = newId('sc');
  await c.env.DB.prepare(
    'INSERT INTO scripts (id, client_id, theme_id, title, format, body_md, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, c.req.param('id'), b.theme_id || null, (title || 'Roteiro sem título').slice(0, 500), format, body, now(), now())
    .run();
  return c.json({ id });
});

social.get('/scripts/:id', async (c) => {
  const s = await c.env.DB.prepare(
    'SELECT s.*, t.title AS theme_title, cl.name AS client_name FROM scripts s LEFT JOIN themes t ON t.id = s.theme_id JOIN clients cl ON cl.id = s.client_id WHERE s.id = ?',
  )
    .bind(c.req.param('id'))
    .first();
  if (!s) return c.json({ error: 'Roteiro não encontrado.' }, 404);
  return c.json({ script: s });
});

social.patch('/scripts/:id', async (c) => {
  await update(c.env, 'scripts', c.req.param('id'), await c.req.json<Row>(), {
    title: text(500),
    body_md: text(100000),
    format: oneOf(FORMATS, 'reels'),
    status: oneOf(SCRIPT_STATUS, 'rascunho'),
  });
  return c.json({ ok: true });
});

social.delete('/scripts/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM scripts WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

// ---------- Tema ou roteiro → tarefa (inbox ou quadro/card) ----------
async function makeTask(env: Env, title: string, md: string, dest: { board_id?: string; list_id?: string | null }) {
  const tid = newId('t');
  const stmts = [env.DB.prepare('INSERT INTO tasks (id, title, description_md, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(tid, title.slice(0, 300), md, now(), now())];
  if (dest.board_id) {
    const edge = await env.DB.prepare('SELECT COALESCE(MAX(position), 0) AS p FROM task_placements WHERE board_id = ? AND list_id IS ?')
      .bind(dest.board_id, dest.list_id ?? null)
      .first<{ p: number }>();
    stmts.push(
      env.DB.prepare('INSERT INTO task_placements (id, task_id, board_id, list_id, position) VALUES (?, ?, ?, ?, ?)').bind(
        newId('p'), tid, dest.board_id, dest.list_id ?? null, (edge?.p ?? 0) + 1,
      ),
    );
  }
  await env.DB.batch(stmts);
  return tid;
}

social.post('/themes/:id/task', async (c) => {
  const th = await c.env.DB.prepare('SELECT t.*, c.name AS client FROM themes t JOIN clients c ON c.id = t.client_id WHERE t.id = ?')
    .bind(c.req.param('id'))
    .first<Row>();
  if (!th) return c.json({ error: 'Tema não encontrado.' }, 404);
  const md = [`**Cliente:** ${th.client}`, `**Formato:** ${FORMAT_NAME[th.format] ?? th.format}`, th.pillar && `**Pilar:** ${th.pillar}`, th.notes && `\n${th.notes}`]
    .filter(Boolean)
    .join('\n\n');
  const tid = await makeTask(c.env, `${th.client} — ${th.title}`, md, await c.req.json<Row>().catch(() => ({})));
  await c.env.DB.prepare('UPDATE themes SET task_id = ?, updated_at = ? WHERE id = ?').bind(tid, now(), th.id).run();
  return c.json({ id: tid });
});

social.post('/scripts/:id/task', async (c) => {
  const s = await c.env.DB.prepare('SELECT s.*, c.name AS client FROM scripts s JOIN clients c ON c.id = s.client_id WHERE s.id = ?')
    .bind(c.req.param('id'))
    .first<Row>();
  if (!s) return c.json({ error: 'Roteiro não encontrado.' }, 404);
  const md = `**Cliente:** ${s.client} · **Formato:** ${FORMAT_NAME[s.format] ?? s.format}\n\n${s.body_md}`;
  const tid = await makeTask(c.env, `${s.client} — ${s.title}`, md, await c.req.json<Row>().catch(() => ({})));
  await c.env.DB.prepare('UPDATE scripts SET task_id = ?, updated_at = ? WHERE id = ?').bind(tid, now(), s.id).run();
  return c.json({ id: tid });
});

// ---------- Modelos de roteiro ----------
const DEFAULT_TEMPLATES: [string, string, string, string][] = [
  ['st_reels', 'Reels: gancho, desenvolvimento, CTA', 'reels',
    '**Gancho (0–3 s)**\n\nFrase ou imagem que para a rolagem.\n\n**Desenvolvimento**\n\n1. Ponto 1\n2. Ponto 2\n3. Ponto 3\n\n**CTA**\n\nO que a pessoa deve fazer no fim (salvar, comentar, chamar no direct).\n\n**Legenda**\n\n**Notas de gravação**\n\n- Cenário:\n- Takes extras:\n- Texto na tela:'],
  ['st_carrossel', 'Carrossel: capa, slides, CTA', 'carrossel',
    '**Slide 1: capa**\n\nTítulo forte + promessa.\n\n**Slide 2**\n\n**Slide 3**\n\n**Slide 4**\n\n**Slide 5**\n\n**Último slide: CTA**\n\n**Legenda**\n\n**Notas para o designer**'],
  ['st_estatico', 'Post estático: arte e legenda', 'estatico',
    '**Texto da arte**\n\n**Legenda**\n\nPrimeira linha (gancho):\n\nCorpo:\n\nCTA:\n\n**Notas para o designer**'],
  ['st_stories', 'Stories: sequência', 'stories',
    '**Story 1: abertura**\n\n**Story 2**\n\n**Story 3: interação (enquete, caixinha, quiz)**\n\n**Story 4: CTA / link**'],
];

social.get('/script-templates', async (c) => {
  // na primeira vez, cria os modelos padrão (uma vez só, mesmo que depois sejam apagados)
  const seeded = await c.env.DB.prepare("SELECT value FROM settings WHERE key = 'templates_seeded'").first();
  if (!seeded) {
    await c.env.DB.batch([
      ...DEFAULT_TEMPLATES.map(([id, name, format, body], i) =>
        c.env.DB.prepare('INSERT OR IGNORE INTO script_templates (id, name, format, body_md, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, name, format, body, now() + i),
      ),
      c.env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('templates_seeded', '1')"),
    ]);
  }
  const rows = await c.env.DB.prepare('SELECT * FROM script_templates ORDER BY created_at, name').all();
  return c.json({ templates: rows.results });
});

social.post('/script-templates', async (c) => {
  const b = await c.req.json<Row>();
  const id = newId('st');
  await c.env.DB.prepare('INSERT INTO script_templates (id, name, format, body_md, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, String(b.name ?? '').trim().slice(0, 200) || 'Modelo sem nome', oneOf(FORMATS, 'reels')(b.format), text(50000)(b.body_md), now())
    .run();
  return c.json({ id });
});

social.patch('/script-templates/:id', async (c) => {
  const b = await c.req.json<Row>();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (b.name !== undefined) sets.push('name = ?'), vals.push(String(b.name).slice(0, 200));
  if (b.format !== undefined) sets.push('format = ?'), vals.push(oneOf(FORMATS, 'reels')(b.format));
  if (b.body_md !== undefined) sets.push('body_md = ?'), vals.push(text(50000)(b.body_md));
  if (sets.length) await c.env.DB.prepare(`UPDATE script_templates SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, c.req.param('id')).run();
  return c.json({ ok: true });
});

social.delete('/script-templates/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM script_templates WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

// ---------- Backup em markdown ----------
export async function socialMarkdown(env: Env) {
  const cs = (await env.DB.prepare('SELECT * FROM clients WHERE archived = 0 ORDER BY position').all<Row>()).results;
  const ts = (await env.DB.prepare('SELECT * FROM themes ORDER BY position DESC').all<Row>()).results;
  const ss = (await env.DB.prepare('SELECT * FROM scripts ORDER BY updated_at DESC').all<Row>()).results;
  const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cliente';
  const files: Record<string, string> = {};
  for (const c of cs) {
    let md = `# ${c.name}${c.handle ? ` (${c.handle})` : ''}\n\n`;
    for (const [k, label] of [['niche', 'Nicho'], ['audience', 'Público'], ['voice', 'Tom de voz'], ['pillars', 'Pilares'], ['dos', 'Fazer'], ['donts', 'Evitar'], ['refs', 'Referências'], ['notes', 'Observações']]) {
      if (c[k]) md += `## ${label}\n\n${c[k]}\n\n`;
    }
    md += `## Temas\n\n` + ts.filter((t) => t.client_id === c.id).map((t) => `- [${t.status}] ${t.title} (${t.format})${t.notes ? ` — ${t.notes.replace(/\n/g, ' ')}` : ''}`).join('\n') + '\n\n';
    md += `## Roteiros\n\n` + ss.filter((s) => s.client_id === c.id).map((s) => `### ${s.title} (${s.format}, ${s.status})\n\n${s.body_md}\n`).join('\n');
    files[`clientes/${slug(c.name)}.md`] = md;
  }
  return files;
}

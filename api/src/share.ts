// Páginas para o cliente acompanhar o andamento (links secretos, sem login)
//   /t/<token>  uma tarefa    ·    /c/<token>  todas as tarefas visíveis de um cliente
import { Hono } from 'hono';
import type { Env } from './index';
import { progress } from './details';

const now = () => Math.floor(Date.now() / 1000);
type Row = Record<string, any>;
// 32 caracteres aleatórios: impossível de adivinhar
const token = () => crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8);

/** Texto simples para o cliente (tira menções internas e marcação) */
const clean = (md: string) =>
  md
    .replace(/<[^>]*(>|$)/g, '')
    .replace(/\[([^\]]+)\]\((?:person|task):[^)]+\)/g, '$1')
    .replace(/\\([[\]*_#>`~-])/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/==([^=]+)==/g, '$1')
    .trim();

/** O que o cliente vê de uma tarefa */
async function publicTask(env: Env, t: Row, withDesc: boolean) {
  const [items, place] = await Promise.all([
    env.DB.prepare('SELECT text, done, weight FROM checklist_items WHERE task_id = ? ORDER BY position').bind(t.id).all<Row>(),
    env.DB.prepare(
      `SELECT l.name AS list, l.is_final FROM task_placements p LEFT JOIN lists l ON l.id = p.list_id
       WHERE p.task_id = ? ORDER BY l.is_final DESC LIMIT 1`,
    )
      .bind(t.id)
      .first<Row>(),
  ]);
  return {
    title: t.title,
    stage: t.done_at ? 'Concluída' : (place?.list ?? null),
    due_at: t.due_at,
    done_at: t.done_at,
    updated_at: t.updated_at,
    progress: progress(items.results.map((i) => ({ weight: i.weight, done: i.done }))),
    checklist: items.results.map((i) => ({ text: i.text, done: !!i.done })),
    description: withDesc ? clean(t.description_md ?? '') : null,
  };
}

// =====================================================================
// Com login: gerar/desligar links, ligar tarefa a cliente
// =====================================================================
export const share = new Hono<{ Bindings: Env }>();

share.get('/tasks/:id/share', async (c) => {
  const t = await c.env.DB.prepare('SELECT share_token, share_desc, client_id, client_visible FROM tasks WHERE id = ?').bind(c.req.param('id')).first<Row>();
  if (!t) return c.json({ error: 'Tarefa não encontrada.' }, 404);
  return c.json({ ...t, url: t.share_token ? `${c.env.SITE_URL}/t/${t.share_token}` : null });
});

// { enable?: boolean, desc?: boolean, client_id?: string|null, client_visible?: boolean }
share.patch('/tasks/:id/share', async (c) => {
  const id = c.req.param('id');
  const b = await c.req.json<Row>();
  const cur = await c.env.DB.prepare('SELECT share_token FROM tasks WHERE id = ?').bind(id).first<Row>();
  if (!cur) return c.json({ error: 'Tarefa não encontrada.' }, 404);
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (b.enable === true && !cur.share_token) sets.push('share_token = ?'), vals.push(token());
  if (b.enable === false) sets.push('share_token = NULL');
  if (b.desc !== undefined) sets.push('share_desc = ?'), vals.push(b.desc ? 1 : 0);
  if (b.client_id !== undefined) sets.push('client_id = ?'), vals.push(b.client_id || null);
  if (b.client_visible !== undefined) sets.push('client_visible = ?'), vals.push(b.client_visible ? 1 : 0);
  if (sets.length) await c.env.DB.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id).run();
  const t = await c.env.DB.prepare('SELECT share_token, share_desc, client_id, client_visible FROM tasks WHERE id = ?').bind(id).first<Row>();
  return c.json({ ...t, url: t?.share_token ? `${c.env.SITE_URL}/t/${t.share_token}` : null });
});

share.get('/clients/:id/share', async (c) => {
  const id = c.req.param('id');
  const cl = await c.env.DB.prepare('SELECT share_token FROM clients WHERE id = ?').bind(id).first<Row>();
  if (!cl) return c.json({ error: 'Cliente não encontrado.' }, 404);
  const tasks = await c.env.DB.prepare('SELECT id, title, client_visible, done_at, due_at FROM tasks WHERE client_id = ? ORDER BY COALESCE(done_at, 0), due_at IS NULL, due_at')
    .bind(id)
    .all();
  return c.json({ url: cl.share_token ? `${c.env.SITE_URL}/c/${cl.share_token}` : null, tasks: tasks.results });
});

share.patch('/clients/:id/share', async (c) => {
  const id = c.req.param('id');
  const { enable } = await c.req.json<{ enable: boolean }>();
  if (enable) await c.env.DB.prepare('UPDATE clients SET share_token = COALESCE(share_token, ?) WHERE id = ?').bind(token(), id).run();
  else await c.env.DB.prepare('UPDATE clients SET share_token = NULL WHERE id = ?').bind(id).run();
  const cl = await c.env.DB.prepare('SELECT share_token FROM clients WHERE id = ?').bind(id).first<Row>();
  return c.json({ url: cl?.share_token ? `${c.env.SITE_URL}/c/${cl.share_token}` : null });
});

// =====================================================================
// Público
// =====================================================================
export const publicShare = new Hono<{ Bindings: Env }>();

const valid = (t: string) => /^[a-f0-9]{40}$/.test(t);

publicShare.get('/public/t/:token', async (c) => {
  const tk = c.req.param('token');
  if (!valid(tk)) return c.json({ error: 'Link inválido.' }, 404);
  const t = await c.env.DB.prepare('SELECT * FROM tasks WHERE share_token = ?').bind(tk).first<Row>();
  if (!t) return c.json({ error: 'Este link não está mais ativo.' }, 404);
  c.header('Cache-Control', 'no-store');
  return c.json({ task: await publicTask(c.env, t, !!t.share_desc), now: now() });
});

publicShare.get('/public/c/:token', async (c) => {
  const tk = c.req.param('token');
  if (!valid(tk)) return c.json({ error: 'Link inválido.' }, 404);
  const cl = await c.env.DB.prepare('SELECT id, name FROM clients WHERE share_token = ? AND archived = 0').bind(tk).first<Row>();
  if (!cl) return c.json({ error: 'Este link não está mais ativo.' }, 404);
  const rows = (
    await c.env.DB.prepare('SELECT * FROM tasks WHERE client_id = ? AND client_visible = 1 ORDER BY done_at IS NOT NULL, due_at IS NULL, due_at, created_at')
      .bind(cl.id)
      .all<Row>()
  ).results;
  c.header('Cache-Control', 'no-store');
  return c.json({ client: cl.name, tasks: await Promise.all(rows.map((t) => publicTask(c.env, t, !!t.share_desc))), now: now() });
});

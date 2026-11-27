// Widget do iPhone (app Scriptable): lê prazos e eventos com um token só de leitura
import { Hono } from 'hono';
import type { Env } from './index';
import { sha256 } from './auth';
import { TZ, listEvents, zoned } from './caldav';

const now = () => Math.floor(Date.now() / 1000);
type Row = Record<string, any>;
const KEY = 'widget_token_hash';

/** Meia-noite de hoje no fuso do usuário (segundos) */
function todayStart() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return zoned(+p.year, +p.month, +p.day, 0, 0, 0, TZ);
}

// ---------- Com login: criar / desligar o token ----------
export const widgetAdmin = new Hono<{ Bindings: Env }>();

widgetAdmin.get('/widget/status', async (c) => {
  const r = await c.env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(KEY).first();
  return c.json({ active: !!r });
});

// Gera um token novo (o antigo deixa de valer). Só é mostrado uma vez.
widgetAdmin.post('/widget/token', async (c) => {
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  await c.env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(KEY, await sha256(token))
    .run();
  return c.json({ token, url: `${new URL(c.req.url).origin}/widget?k=${token}` });
});

widgetAdmin.delete('/widget/token', async (c) => {
  await c.env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(KEY).run();
  return c.json({ ok: true });
});

// ---------- Público com token: os dados do widget ----------
export const widgetPublic = new Hono<{ Bindings: Env }>();

widgetPublic.get('/widget', async (c) => {
  const k = c.req.query('k') ?? '';
  const saved = await c.env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(KEY).first<{ value: string }>();
  if (!saved || !k || (await sha256(k)) !== saved.value) return c.json({ error: 'Token do widget inválido. Gere outro no portal (ajustes).' }, 401);

  const t0 = todayStart();
  const rows = (
    await c.env.DB.prepare(
      `SELECT t.title, t.due_at, t.priority,
         (SELECT b.name FROM task_placements p JOIN boards b ON b.id = p.board_id WHERE p.task_id = t.id LIMIT 1) AS board
       FROM tasks t WHERE t.done_at IS NULL AND t.due_at IS NOT NULL AND t.due_at < ? ORDER BY t.due_at`,
    )
      .bind(t0 + 4 * 86400)
      .all<Row>()
  ).results;
  const item = (r: Row) => ({ title: r.title, due_at: r.due_at, board: r.board, priority: r.priority });
  const ev = c.req.query('eventos') === '0' ? null : await listEvents(c.env, t0, t0 + 86400);
  c.header('Cache-Control', 'no-store');
  return c.json({
    now: now(),
    late: rows.filter((r) => r.due_at < now()).map(item),
    today: rows.filter((r) => r.due_at >= now() && r.due_at < t0 + 86400).map(item),
    soon: rows.filter((r) => r.due_at >= t0 + 86400).map(item),
    events: (ev?.events ?? []).sort((a, b) => a.start - b.start).map((e) => ({ title: e.title, start: e.start, all_day: e.all_day })),
  });
});

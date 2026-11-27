// Widget do iPhone (app Scriptable): lê prazos e eventos com um token só de leitura
import { Hono } from 'hono';
import type { Env } from './index';
import { sha256 } from './auth';
import { TZ, listEvents, zoned } from './caldav';
import { signedUrl } from './files';

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
  const DAYS = 14; // horizonte do widget
  const rows = (
    await c.env.DB.prepare(
      `SELECT t.title, t.due_at, t.priority,
         (SELECT b.name FROM task_placements p JOIN boards b ON b.id = p.board_id WHERE p.task_id = t.id LIMIT 1) AS board,
         (SELECT cl.name FROM clients cl WHERE cl.id = t.client_id) AS client
       FROM tasks t WHERE t.done_at IS NULL AND t.due_at IS NOT NULL AND t.due_at < ? ORDER BY t.due_at`,
    )
      .bind(t0 + DAYS * 86400)
      .all<Row>()
  ).results;
  const item = (r: Row) => ({ title: r.title, due_at: r.due_at, board: r.board, priority: r.priority });
  const ev = c.req.query('eventos') === '0' ? null : await listEvents(c.env, t0, t0 + DAYS * 86400);
  const evs = (ev?.events ?? []).sort((a, b) => a.start - b.start);
  // etapas de roteiro: formato novo "cliente › título › ação" e o antigo "Ação · título (cliente)"
  const STEP_NEW = /^(.+?) › (.+) › (criar roteiro|enviar ao designer|publicar)$/;
  const STEP_OLD = /^(Criar roteiro|Enviar ao designer|Publicar) \u00b7 (.+?)(?: \(([^)]+)\))?$/;
  const agenda = [
    ...rows.map((r) => ({ kind: 'task', title: r.title, at: r.due_at, all_day: false, late: r.due_at < now(), where: r.client || r.board || '' })),
    ...evs
      .filter((e) => e.all_day || e.end > now()) // evento que já acabou some
      .map((e) => {
        const own = e.uid.startsWith('pyle-ev-');
        const n = own ? STEP_NEW.exec(e.title) : null;
        if (n) return { kind: 'step', step: n[3], title: n[2], at: e.start, all_day: e.all_day, late: false, where: n[1] };
        const o = own ? STEP_OLD.exec(e.title) : null;
        if (o) return { kind: 'step', step: o[1].toLowerCase(), title: o[2], at: e.start, all_day: e.all_day, late: false, where: o[3] ?? '' };
        return { kind: 'event', title: e.title, at: e.start, all_day: e.all_day, late: false, where: '' };
      }),
  ].sort((a, b) => Number(b.late) - Number(a.late) || a.at - b.at || Number(b.all_day) - Number(a.all_day));
  c.header('Cache-Control', 'no-store');
  return c.json({
    now: now(),
    today0: t0,
    agenda,
    // foto do fundo (a mesma do login: pyle-23 = cosmos_470762718, tom ajustado)
    bg: await signedUrl(c.env, new URL(c.req.url).origin, 'site/pyle-23.webp'),
    // formato antigo (widgets que ainda não foram atualizados)
    late: rows.filter((r) => r.due_at < now()).map(item),
    today: rows.filter((r) => r.due_at >= now() && r.due_at < t0 + 86400).map(item),
    soon: rows.filter((r) => r.due_at >= t0 + 86400 && r.due_at < t0 + 4 * 86400).map(item),
    events: evs.filter((e) => e.start < t0 + 86400).map((e) => ({ title: e.title, start: e.start, all_day: e.all_day })),
  });
});

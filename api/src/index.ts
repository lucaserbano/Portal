import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { FAIL_WINDOW_S, MAX_FAILS, SESSION_DAYS, newToken, sha256, verifyPassword } from './auth';
import { runBackup } from './backup';
import { boards } from './boards';
import { details } from './details';
import { verify } from './files';

export interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  BACKUP_REPO: string;
  PASSWORD_HASH: string;
  GITHUB_TOKEN?: string;
  FILES: R2Bucket;
  FILE_KEY: string;
  FILES_QUOTA_BYTES: string;
}

const now = () => Math.floor(Date.now() / 1000);

const app = new Hono<{ Bindings: Env }>();

app.use('*', (c, next) =>
  cors({
    origin: (origin) => (c.env.ALLOWED_ORIGINS.split(',').includes(origin) ? origin : null),
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  })(c, next),
);

app.get('/health', (c) => c.json({ ok: true }));

// ---------- Login ----------
app.post('/auth/login', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'local';
  const since = now() - FAIL_WINDOW_S;
  const fails = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND at > ?')
    .bind(ip, since)
    .first<{ n: number }>();
  if ((fails?.n ?? 0) >= MAX_FAILS) {
    return c.json({ error: 'Muitas tentativas. Tente de novo em 15 minutos.' }, 429);
  }

  const { password } = await c.req.json<{ password?: string }>().catch(() => ({ password: undefined }));
  if (!password || !c.env.PASSWORD_HASH || !(await verifyPassword(password, c.env.PASSWORD_HASH))) {
    await c.env.DB.prepare('INSERT INTO login_attempts (ip, at) VALUES (?, ?)').bind(ip, now()).run();
    return c.json({ error: 'Senha incorreta.' }, 401);
  }

  const token = newToken();
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM login_attempts WHERE ip = ? OR at < ?').bind(ip, since),
    c.env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now()),
    c.env.DB.prepare('INSERT INTO sessions (token_hash, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?)').bind(
      await sha256(token),
      now(),
      now() + SESSION_DAYS * 86400,
      c.req.header('User-Agent') ?? '',
    ),
  ]);
  return c.json({ token });
});

// ---------- Arquivos: URL assinada (sem sessão, para <img> e downloads) ----------
app.get('/files/:key{.+}', async (c) => {
  const key = decodeURIComponent(c.req.param('key'));
  if (!(await verify(c.env, key, c.req.query('e'), c.req.query('s')))) return c.text('Link expirado.', 403);
  const obj = await c.env.FILES.get(key);
  if (!obj) return c.text('Não encontrado.', 404);
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set('Cache-Control', 'private, max-age=86400');
  h.set('X-Content-Type-Options', 'nosniff');
  // Arquivo enviado nunca roda como página (evita HTML/JS malicioso)
  h.set('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
  return new Response(obj.body, { headers: h });
});

// ---------- Tudo abaixo exige sessão ----------
const api = new Hono<{ Bindings: Env }>();

api.use('*', async (c, next) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer /, '');
  if (!token) return c.json({ error: 'Não autenticado.' }, 401);
  const s = await c.env.DB.prepare('SELECT expires_at FROM sessions WHERE token_hash = ?')
    .bind(await sha256(token))
    .first<{ expires_at: number }>();
  if (!s || s.expires_at < now()) return c.json({ error: 'Sessão expirada.' }, 401);
  await next();
});

api.post('/auth/logout', async (c) => {
  const token = c.req.header('Authorization')!.replace(/^Bearer /, '');
  await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return c.json({ ok: true });
});

api.get('/me', (c) => c.json({ ok: true }));

api.get('/boards', async (c) => {
  const boards = await c.env.DB.prepare(
    `SELECT b.id, b.name,
       (SELECT COUNT(*) FROM lists l WHERE l.board_id = b.id) AS lists,
       (SELECT COUNT(DISTINCT p.task_id) FROM task_placements p JOIN tasks t ON t.id = p.task_id
          WHERE p.board_id = b.id AND t.done_at IS NULL) AS open_tasks,
       (SELECT COUNT(DISTINCT p.task_id) FROM task_placements p JOIN tasks t ON t.id = p.task_id
          WHERE p.board_id = b.id AND t.done_at IS NULL AND t.due_at < ?) AS late_tasks
     FROM boards b WHERE b.archived = 0 ORDER BY b.position`,
  )
    .bind(now())
    .all();
  const inbox = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM tasks WHERE id NOT IN (SELECT task_id FROM task_placements)',
  ).first<{ n: number }>();
  return c.json({ boards: boards.results, inbox: inbox?.n ?? 0 });
});

api.route('/', boards);
api.route('/', details);

api.post('/backup', async (c) => c.json(await runBackup(c.env)));

app.route('/', api);

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runBackup(env).then((r) => console.log('backup', JSON.stringify(r))));
  },
} satisfies ExportedHandler<Env>;

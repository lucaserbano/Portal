// Fase 2: Boards, Cards (colunas = "lists"), Tarefas, Inbox, Labels
import { Hono } from 'hono';
import type { Env } from './index';

const now = () => Math.floor(Date.now() / 1000);
const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

const PRIORITIES = ['bom', 'preocupante', 'critico'] as const;
const TASK_FIELDS = ['title', 'description_md', 'start_at', 'due_at', 'priority', 'color'] as const;

type Task = Record<string, any>;

async function attachLabels(db: D1Database, tasks: Task[]) {
  if (!tasks.length) return tasks;
  const ids = [...new Set(tasks.map((t) => t.id))];
  const rows = (
    await db
      .prepare(`SELECT task_id, label_id FROM task_labels WHERE task_id IN (${ids.map(() => '?').join(',')})`)
      .bind(...ids)
      .all<{ task_id: string; label_id: string }>()
  ).results;
  for (const t of tasks) t.labels = rows.filter((r) => r.task_id === t.id).map((r) => r.label_id);
  return tasks;
}

export const boards = new Hono<{ Bindings: Env }>();

// ---------- Boards ----------
boards.post('/boards', async (c) => {
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) return c.json({ error: 'Nome obrigatório.' }, 400);
  const max = await c.env.DB.prepare('SELECT COALESCE(MAX(position), 0) AS p FROM boards').first<{ p: number }>();
  const bid = id('b');
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO boards (id, name, position, created_at) VALUES (?, ?, ?, ?)').bind(
      bid, name.trim(), (max?.p ?? 0) + 1, now(),
    ),
    // Todo board nasce com uma coluna final, para o botão "concluir"
    c.env.DB.prepare('INSERT INTO lists (id, board_id, name, position, is_final, created_at) VALUES (?, ?, ?, ?, 1, ?)').bind(
      id('l'), bid, 'Finalizados', 1, now(),
    ),
  ]);
  return c.json({ id: bid });
});

boards.get('/boards/:id', async (c) => {
  const bid = c.req.param('id');
  const board = await c.env.DB.prepare('SELECT * FROM boards WHERE id = ? AND archived = 0').bind(bid).first();
  if (!board) return c.json({ error: 'Quadro não encontrado.' }, 404);
  const lists = (await c.env.DB.prepare('SELECT * FROM lists WHERE board_id = ? ORDER BY position').bind(bid).all())
    .results;
  const tasks = (
    await c.env.DB.prepare(
      `SELECT t.*, p.id AS placement_id, p.list_id, p.position,
         (SELECT COUNT(*) FROM task_placements p2 WHERE p2.task_id = t.id) AS placements
       FROM task_placements p JOIN tasks t ON t.id = p.task_id
       WHERE p.board_id = ? ORDER BY p.position`,
    )
      .bind(bid)
      .all<Task>()
  ).results;
  const labels = (await c.env.DB.prepare('SELECT * FROM labels ORDER BY name').all()).results;
  return c.json({
    board: { ...board, card_fields: JSON.parse(String(board.card_fields)) },
    lists,
    tasks: await attachLabels(c.env.DB, tasks),
    labels,
  });
});

boards.patch('/boards/:id', async (c) => {
  const b = await c.req.json<{ name?: string; position?: number; card_fields?: object }>();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (b.name !== undefined) (sets.push('name = ?'), vals.push(b.name.trim()));
  if (b.position !== undefined) (sets.push('position = ?'), vals.push(b.position));
  if (b.card_fields !== undefined) (sets.push('card_fields = ?'), vals.push(JSON.stringify(b.card_fields)));
  if (!sets.length) return c.json({ ok: true });
  await c.env.DB.prepare(`UPDATE boards SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, c.req.param('id')).run();
  return c.json({ ok: true });
});

// Arquiva (não apaga): as tarefas continuam no backup
boards.delete('/boards/:id', async (c) => {
  await c.env.DB.prepare('UPDATE boards SET archived = 1 WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

// ---------- Cards (colunas) ----------
boards.post('/boards/:id/lists', async (c) => {
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) return c.json({ error: 'Nome obrigatório.' }, 400);
  const bid = c.req.param('id');
  // Nova coluna entra antes da coluna final
  const final = await c.env.DB.prepare('SELECT position FROM lists WHERE board_id = ? AND is_final = 1 ORDER BY position LIMIT 1')
    .bind(bid)
    .first<{ position: number }>();
  const before = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(position), 0) AS p FROM lists WHERE board_id = ? AND (? IS NULL OR position < ?)',
  )
    .bind(bid, final?.position ?? null, final?.position ?? null)
    .first<{ p: number }>();
  const pos = final ? ((before?.p ?? 0) + final.position) / 2 : (before?.p ?? 0) + 1;
  const lid = id('l');
  await c.env.DB.prepare('INSERT INTO lists (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(lid, bid, name.trim(), pos, now())
    .run();
  return c.json({ id: lid, position: pos });
});

boards.patch('/lists/:id', async (c) => {
  const b = await c.req.json<{ name?: string; position?: number; is_final?: boolean }>();
  const lid = c.req.param('id');
  const stmts: D1PreparedStatement[] = [];
  if (b.name !== undefined) stmts.push(c.env.DB.prepare('UPDATE lists SET name = ? WHERE id = ?').bind(b.name.trim(), lid));
  if (b.position !== undefined) stmts.push(c.env.DB.prepare('UPDATE lists SET position = ? WHERE id = ?').bind(b.position, lid));
  if (b.is_final) {
    // Só uma coluna final por board
    stmts.push(
      c.env.DB.prepare('UPDATE lists SET is_final = 0 WHERE board_id = (SELECT board_id FROM lists WHERE id = ?)').bind(lid),
      c.env.DB.prepare('UPDATE lists SET is_final = 1 WHERE id = ?').bind(lid),
    );
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

// Apagar coluna: as tarefas dela ficam no board, sem coluna (não se perdem)
boards.delete('/lists/:id', async (c) => {
  const lid = c.req.param('id');
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE task_placements SET list_id = NULL WHERE list_id = ?').bind(lid),
    c.env.DB.prepare('DELETE FROM lists WHERE id = ?').bind(lid),
  ]);
  return c.json({ ok: true });
});

// ---------- Tarefas ----------
boards.post('/tasks', async (c) => {
  const b = await c.req.json<{ title: string; board_id?: string; list_id?: string; at?: 'top' | 'bottom' }>();
  if (!b.title?.trim()) return c.json({ error: 'Título obrigatório.' }, 400);
  const tid = id('t');
  const stmts = [
    c.env.DB.prepare('INSERT INTO tasks (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').bind(
      tid, b.title.trim(), now(), now(),
    ),
  ];
  if (b.board_id) {
    const top = b.at === 'top';
    const edge = await c.env.DB.prepare(
      `SELECT COALESCE(${top ? 'MIN' : 'MAX'}(position), ${top ? 1 : 0}) AS p FROM task_placements WHERE board_id = ? AND list_id IS ?`,
    )
      .bind(b.board_id, b.list_id ?? null)
      .first<{ p: number }>();
    stmts.push(
      c.env.DB.prepare('INSERT INTO task_placements (id, task_id, board_id, list_id, position) VALUES (?, ?, ?, ?, ?)').bind(
        id('p'), tid, b.board_id, b.list_id ?? null, (edge?.p ?? 0) + (top ? -1 : 1),
      ),
    );
  }
  await c.env.DB.batch(stmts);
  return c.json({ id: tid });
});

boards.get('/tasks/:id', async (c) => {
  const tid = c.req.param('id');
  const task = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(tid).first<Task>();
  if (!task) return c.json({ error: 'Tarefa não encontrada.' }, 404);
  const placements = (
    await c.env.DB.prepare(
      `SELECT p.*, b.name AS board_name, l.name AS list_name FROM task_placements p
       JOIN boards b ON b.id = p.board_id LEFT JOIN lists l ON l.id = p.list_id WHERE p.task_id = ?`,
    )
      .bind(tid)
      .all()
  ).results;
  const history = (
    await c.env.DB.prepare('SELECT * FROM task_history WHERE task_id = ? ORDER BY at DESC LIMIT 100').bind(tid).all()
  ).results;
  await attachLabels(c.env.DB, [task]);
  return c.json({ task, placements, history });
});

boards.patch('/tasks/:id', async (c) => {
  const tid = c.req.param('id');
  const body = await c.req.json<Record<string, any>>();
  const cur = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(tid).first<Task>();
  if (!cur) return c.json({ error: 'Tarefa não encontrada.' }, 404);
  if (body.priority !== undefined && body.priority !== null && !PRIORITIES.includes(body.priority)) {
    return c.json({ error: 'Prioridade inválida.' }, 400);
  }

  const stmts: D1PreparedStatement[] = [];
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of TASK_FIELDS) {
    if (body[f] === undefined || body[f] === cur[f]) continue;
    sets.push(`${f} = ?`);
    vals.push(body[f]);
    stmts.push(
      c.env.DB.prepare('INSERT INTO task_history (task_id, at, field, old_value, new_value) VALUES (?, ?, ?, ?, ?)').bind(
        tid, now(), f, cur[f] == null ? null : String(cur[f]), body[f] == null ? null : String(body[f]),
      ),
    );
  }
  if (sets.length) {
    stmts.unshift(
      c.env.DB.prepare(`UPDATE tasks SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).bind(...vals, now(), tid),
    );
  }
  if (Array.isArray(body.labels)) {
    stmts.push(c.env.DB.prepare('DELETE FROM task_labels WHERE task_id = ?').bind(tid));
    for (const lid of body.labels) {
      stmts.push(c.env.DB.prepare('INSERT INTO task_labels (task_id, label_id) VALUES (?, ?)').bind(tid, lid));
    }
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

// Concluir: marca e leva para a coluna final de cada board onde a tarefa está
boards.post('/tasks/:id/done', async (c) => {
  const tid = c.req.param('id');
  const t = now();
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE tasks SET done_at = ?, updated_at = ? WHERE id = ?').bind(t, t, tid),
    c.env.DB.prepare(
      `UPDATE task_placements SET
         list_id = COALESCE((SELECT l.id FROM lists l WHERE l.board_id = task_placements.board_id AND l.is_final = 1 LIMIT 1), list_id),
         position = (SELECT COALESCE(MIN(p2.position), 1) - 1 FROM task_placements p2
                     WHERE p2.list_id = (SELECT l.id FROM lists l WHERE l.board_id = task_placements.board_id AND l.is_final = 1 LIMIT 1))
       WHERE task_id = ?`,
    ).bind(tid),
    c.env.DB.prepare('INSERT INTO task_history (task_id, at, field, old_value, new_value) VALUES (?, ?, ?, NULL, ?)').bind(
      tid, t, 'done_at', String(t),
    ),
  ]);
  return c.json({ ok: true });
});

boards.post('/tasks/:id/undone', async (c) => {
  const tid = c.req.param('id');
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE tasks SET done_at = NULL, updated_at = ? WHERE id = ?').bind(now(), tid),
    // Sai da coluna final e volta para a última coluna antes dela
    c.env.DB.prepare(
      `UPDATE task_placements SET
         list_id = COALESCE((SELECT l.id FROM lists l WHERE l.board_id = task_placements.board_id AND l.is_final = 0
                             ORDER BY l.position DESC LIMIT 1), list_id)
       WHERE task_id = ? AND list_id IN (SELECT id FROM lists WHERE is_final = 1)`,
    ).bind(tid),
    c.env.DB.prepare('INSERT INTO task_history (task_id, at, field, old_value, new_value) VALUES (?, ?, ?, ?, NULL)').bind(
      tid, now(), 'done_at', 'reaberta',
    ),
  ]);
  return c.json({ ok: true });
});

boards.delete('/tasks/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

// Mover / reordenar uma tarefa dentro do board
boards.patch('/placements/:id', async (c) => {
  const b = await c.req.json<{ list_id: string | null; position: number }>();
  const pid = c.req.param('id');
  const info = await c.env.DB.prepare(
    `SELECT t.id AS task_id, t.done_at, (SELECT is_final FROM lists WHERE id = ?) AS to_final
     FROM task_placements p JOIN tasks t ON t.id = p.task_id WHERE p.id = ?`,
  )
    .bind(b.list_id, pid)
    .first<{ task_id: string; done_at: number | null; to_final: number | null }>();
  if (!info) return c.json({ error: 'Não encontrado.' }, 404);

  const stmts = [c.env.DB.prepare('UPDATE task_placements SET list_id = ?, position = ? WHERE id = ?').bind(b.list_id, b.position, pid)];
  // Coluna final = concluída. Arrastar para lá conclui; tirar de lá reabre.
  let done_at = info.done_at;
  if (info.to_final && !info.done_at) done_at = now();
  if (!info.to_final && info.done_at) done_at = null;
  if (done_at !== info.done_at) {
    stmts.push(
      c.env.DB.prepare('UPDATE tasks SET done_at = ?, updated_at = ? WHERE id = ?').bind(done_at, now(), info.task_id),
      c.env.DB.prepare('INSERT INTO task_history (task_id, at, field, old_value, new_value) VALUES (?, ?, ?, ?, ?)').bind(
        info.task_id, now(), 'done_at', info.done_at ? String(info.done_at) : null, done_at ? String(done_at) : 'reaberta',
      ),
    );
  }
  await c.env.DB.batch(stmts);
  return c.json({ ok: true, done_at });
});

// ---------- Inbox ----------
boards.get('/inbox', async (c) => {
  const tasks = (
    await c.env.DB.prepare(
      'SELECT * FROM tasks WHERE id NOT IN (SELECT task_id FROM task_placements) ORDER BY created_at DESC',
    ).all<Task>()
  ).results;
  return c.json({ tasks: await attachLabels(c.env.DB, tasks) });
});

// Atribui várias tarefas de uma vez a um board (e opcionalmente a uma coluna)
boards.post('/inbox/assign', async (c) => {
  const b = await c.req.json<{ task_ids: string[]; board_id: string; list_id?: string | null }>();
  if (!b.task_ids?.length || !b.board_id) return c.json({ error: 'Escolha tarefas e um quadro.' }, 400);
  const max = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(position), 0) AS p FROM task_placements WHERE board_id = ? AND list_id IS ?',
  )
    .bind(b.board_id, b.list_id ?? null)
    .first<{ p: number }>();
  let pos = max?.p ?? 0;
  await c.env.DB.batch(
    b.task_ids.map((tid) =>
      c.env.DB.prepare('INSERT INTO task_placements (id, task_id, board_id, list_id, position) VALUES (?, ?, ?, ?, ?)').bind(
        id('p'), tid, b.board_id, b.list_id ?? null, ++pos,
      ),
    ),
  );
  return c.json({ ok: true });
});

// ---------- Labels ----------
boards.get('/labels', async (c) => c.json({ labels: (await c.env.DB.prepare('SELECT * FROM labels ORDER BY name').all()).results }));

boards.post('/labels', async (c) => {
  const { name, color } = await c.req.json<{ name: string; color: string }>();
  if (!name?.trim()) return c.json({ error: 'Nome obrigatório.' }, 400);
  const lid = id('lb');
  await c.env.DB.prepare('INSERT INTO labels (id, name, color, created_at) VALUES (?, ?, ?, ?)')
    .bind(lid, name.trim(), color || '#808080', now())
    .run();
  return c.json({ id: lid });
});

boards.delete('/labels/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM labels WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

// Lista enxuta de boards + colunas (para os seletores do Inbox)
boards.get('/destinations', async (c) => {
  const bs = (await c.env.DB.prepare('SELECT id, name FROM boards WHERE archived = 0 ORDER BY position').all()).results;
  const ls = (await c.env.DB.prepare('SELECT id, board_id, name FROM lists ORDER BY position').all()).results;
  return c.json({ boards: bs.map((b) => ({ ...b, lists: ls.filter((l) => l.board_id === b.id) })) });
});

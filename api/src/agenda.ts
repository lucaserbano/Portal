// Fase 5: rotas da agenda
import { Hono } from 'hono';
import type { Env } from './index';
import { createEvent, deleteEvent, listEvents, syncTasks, updateEvent, type EventInput } from './caldav';

type Row = Record<string, any>;
export const agenda = new Hono<{ Bindings: Env }>();

// Tarefas que tocam o intervalo + eventos do iCloud + listas para os filtros
agenda.get('/agenda', async (c) => {
  const from = Number(c.req.query('from'));
  const to = Number(c.req.query('to'));
  if (!from || !to || to <= from || to - from > 100 * 86400) return c.json({ error: 'Intervalo inválido.' }, 400);
  const db = c.env.DB;
  // abrir a agenda também confere se as tarefas do iPhone estão em dia (só envia o que mudou)
  c.executionCtx.waitUntil(syncTasks(c.env, c.env.SITE_URL).catch((e) => console.log('sync', String(e))));
  const [tasks, places, tl, tp, boards, labels, people, cal] = await Promise.all([
    db
      .prepare(
        `SELECT id, title, start_at, due_at, priority, color, done_at FROM tasks
         WHERE (start_at IS NOT NULL OR due_at IS NOT NULL)
           AND COALESCE(start_at, due_at) < ? AND COALESCE(due_at, start_at) >= ?`,
      )
      .bind(to, from)
      .all<Row>(),
    db.prepare('SELECT task_id, board_id FROM task_placements').all<Row>(),
    db.prepare('SELECT task_id, label_id FROM task_labels').all<Row>(),
    // membros e @menções contam como "pessoa marcada"
    db.prepare('SELECT task_id, person_id FROM task_people').all<Row>(),
    db.prepare('SELECT id, name FROM boards WHERE archived = 0 ORDER BY position').all<Row>(),
    db.prepare('SELECT id, name, color FROM labels ORDER BY name').all<Row>(),
    db.prepare('SELECT id, name FROM people ORDER BY name').all<Row>(),
    listEvents(c.env, from, to),
  ]);
  const group = (rows: Row[], key: string) => {
    const m = new Map<string, string[]>();
    for (const r of rows) m.set(r.task_id, [...(m.get(r.task_id) ?? []), r[key]]);
    return m;
  };
  const pb = group(places.results, 'board_id');
  const pl = group(tl.results, 'label_id');
  const pp = group(tp.results, 'person_id');
  return c.json({
    tasks: tasks.results.map((t) => ({
      ...t,
      boards: [...new Set(pb.get(t.id) ?? [])],
      labels: pl.get(t.id) ?? [],
      people: [...new Set(pp.get(t.id) ?? [])],
    })),
    boards: boards.results,
    labels: labels.results,
    people: people.results,
    ...cal,
  });
});

function input(b: Row): EventInput | string {
  const title = String(b.title ?? '').trim();
  if (!title) return 'Dê um título ao evento.';
  const start = Number(b.start);
  const end = Number(b.end ?? b.start);
  if (!start || !end || end < start) return 'Confira o início e o fim.';
  const remind = b.remind_min === null || b.remind_min === undefined || b.remind_min === '' ? null : Number(b.remind_min);
  return {
    title: title.slice(0, 300),
    start,
    end,
    all_day: !!b.all_day,
    location: String(b.location ?? '').slice(0, 300),
    notes: String(b.notes ?? '').slice(0, 5000),
    remind_min: remind != null && Number.isFinite(remind) && remind >= 0 && remind <= 40320 ? remind : null,
  };
}

agenda.post('/events', async (c) => {
  const e = input(await c.req.json<Row>());
  if (typeof e === 'string') return c.json({ error: e }, 400);
  try {
    return c.json(await createEvent(c.env, e));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});

agenda.put('/events', async (c) => {
  const b = await c.req.json<Row>();
  const e = input(b);
  if (typeof e === 'string') return c.json({ error: e }, 400);
  if (!b.href || !b.uid) return c.json({ error: 'Evento sem endereço.' }, 400);
  try {
    await updateEvent(c.env, String(b.href), String(b.uid), e);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});

agenda.delete('/events', async (c) => {
  const href = c.req.query('href');
  if (!href) return c.json({ error: 'Evento sem endereço.' }, 400);
  try {
    await deleteEvent(c.env, href);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});

// Envia ao iCloud todas as tarefas com data (o que mudou)
agenda.post('/agenda/sync', async (c) => {
  try {
    return c.json(await syncTasks(c.env, c.env.SITE_URL));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});

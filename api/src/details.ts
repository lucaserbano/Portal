// Fase 3: membros, checklists, anexos, capa, referências, ações (mover/copiar/duplicar/espelhar), modelos
import { Hono } from 'hono';
import type { Env } from './index';
import { MAX_FILE_BYTES, copyObject, signedUrl, usedBytes } from './files';

const now = () => Math.floor(Date.now() / 1000);
export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
const origin = (url: string) => new URL(url).origin;

type Row = Record<string, any>;

// ---------- Progresso ponderado do checklist ----------
// Itens com peso contam o peso; os sem peso dividem igualmente o que sobrar até 100%.
export function progress(items: { weight: number | null; done: number }[]) {
  if (!items.length) return null;
  const weighted = items.filter((i) => i.weight != null);
  const fixed = weighted.reduce((s, i) => s + (i.weight as number), 0);
  const free = items.length - weighted.length;
  const share = free ? Math.max(0, 100 - fixed) / free : 0;
  const total = fixed + share * free;
  const done = items.reduce((s, i) => s + (i.done ? (i.weight ?? share) : 0), 0);
  return {
    done: items.filter((i) => i.done).length,
    total: items.length,
    pct: total ? Math.round((done / total) * 100) : 0,
  };
}

// ---------- Sincroniza @menções e referências a partir do markdown ----------
// Menção:     [@Nome](person:pe_xxx)      Referência: [Título](task:t_xxx)
export function syncFromDescription(db: D1Database, taskId: string, md: string) {
  const mentions = [...new Set([...md.matchAll(/\(person:(pe_[a-z0-9]+)\)/g)].map((m) => m[1]))];
  const refs = [...new Set([...md.matchAll(/\(task:(t_[a-z0-9]+)\)/g)].map((m) => m[1]))].filter((t) => t !== taskId);
  return [
    db.prepare("DELETE FROM task_people WHERE task_id = ? AND role = 'mention'").bind(taskId),
    ...mentions.map((p) =>
      db.prepare("INSERT OR IGNORE INTO task_people (task_id, person_id, role) SELECT ?, id, 'mention' FROM people WHERE id = ?").bind(taskId, p),
    ),
    db.prepare('DELETE FROM task_links WHERE from_id = ?').bind(taskId),
    ...refs.map((t) => db.prepare('INSERT OR IGNORE INTO task_links (from_id, to_id) SELECT ?, id FROM tasks WHERE id = ?').bind(taskId, t)),
  ];
}

/** Extras para os cartões de um board: progresso, capa, membros */
export async function cardExtras(env: Env, reqUrl: string, taskIds: string[]) {
  const out: Record<string, { progress: ReturnType<typeof progress>; cover_url: string | null; people: string[] }> = {};
  if (!taskIds.length) return out;
  const ph = taskIds.map(() => '?').join(',');
  const [items, covers, people] = await Promise.all([
    env.DB.prepare(`SELECT task_id, weight, done FROM checklist_items WHERE task_id IN (${ph})`).bind(...taskIds).all<Row>(),
    env.DB.prepare(
      `SELECT t.id, a.r2_key FROM tasks t JOIN attachments a ON a.id = t.cover_key WHERE t.id IN (${ph}) AND a.kind = 'file' AND a.mime LIKE 'image/%'`,
    )
      .bind(...taskIds)
      .all<Row>(),
    env.DB.prepare(`SELECT task_id, person_id FROM task_people WHERE role = 'member' AND task_id IN (${ph})`).bind(...taskIds).all<Row>(),
  ]);
  for (const id of taskIds) {
    const cover = covers.results.find((c) => c.id === id);
    out[id] = {
      progress: progress(items.results.filter((i) => i.task_id === id) as any),
      cover_url: cover ? await signedUrl(env, origin(reqUrl), cover.r2_key) : null,
      people: people.results.filter((p) => p.task_id === id).map((p) => p.person_id),
    };
  }
  return out;
}

/** Copia uma tarefa inteira (checklist, labels, membros, anexos). Retorna o id novo. */
async function cloneTask(env: Env, srcId: string, titleSuffix = '') {
  const t = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(srcId).first<Row>();
  if (!t) return null;
  const tid = newId('t');
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO tasks (id, title, description_md, start_at, due_at, priority, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(tid, t.title + titleSuffix, t.description_md, t.start_at, t.due_at, t.priority, t.color, now(), now()),
    env.DB.prepare('INSERT INTO task_labels (task_id, label_id) SELECT ?, label_id FROM task_labels WHERE task_id = ?').bind(tid, srcId),
    env.DB.prepare('INSERT INTO task_people (task_id, person_id, role) SELECT ?, person_id, role FROM task_people WHERE task_id = ?').bind(tid, srcId),
    env.DB.prepare('INSERT INTO task_links (from_id, to_id) SELECT ?, to_id FROM task_links WHERE from_id = ?').bind(tid, srcId),
  ];
  const items = (await env.DB.prepare('SELECT * FROM checklist_items WHERE task_id = ?').bind(srcId).all<Row>()).results;
  for (const i of items) {
    stmts.push(
      env.DB.prepare(
        'INSERT INTO checklist_items (id, task_id, text, weight, done, person_id, position, created_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)',
      ).bind(newId('c'), tid, i.text, i.weight, i.person_id, i.position, now()),
    );
  }
  const atts = (await env.DB.prepare('SELECT * FROM attachments WHERE task_id = ?').bind(srcId).all<Row>()).results;
  let coverKey: string | null = null;
  for (const a of atts) {
    const aid = newId('a');
    let key = a.r2_key;
    if (a.kind === 'file') {
      key = `tasks/${tid}/${aid}`;
      if (!(await copyObject(env, a.r2_key, key))) continue;
    }
    if (t.cover_key === a.id) coverKey = aid;
    stmts.push(
      env.DB.prepare(
        'INSERT INTO attachments (id, task_id, kind, name, url, r2_key, size, mime, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(aid, tid, a.kind, a.name, a.url, key, a.size, a.mime, now()),
    );
  }
  await env.DB.batch(stmts);
  if (coverKey) await env.DB.prepare('UPDATE tasks SET cover_key = ? WHERE id = ?').bind(coverKey, tid).run();
  return tid;
}

async function place(env: Env, taskId: string, boardId: string, listId: string | null) {
  const edge = await env.DB.prepare('SELECT COALESCE(MIN(position), 1) AS p FROM task_placements WHERE board_id = ? AND list_id IS ?')
    .bind(boardId, listId)
    .first<{ p: number }>();
  const pid = newId('p');
  await env.DB.prepare('INSERT INTO task_placements (id, task_id, board_id, list_id, position) VALUES (?, ?, ?, ?, ?)')
    .bind(pid, taskId, boardId, listId, (edge?.p ?? 1) - 1)
    .run();
  return pid;
}

/** Cria tarefa a partir de um modelo */
export async function taskFromTemplate(env: Env, templateId: string, title?: string) {
  const tpl = await env.DB.prepare('SELECT * FROM templates WHERE id = ?').bind(templateId).first<Row>();
  if (!tpl) return null;
  const d = JSON.parse(tpl.data);
  const tid = newId('t');
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(
      'INSERT INTO tasks (id, title, description_md, priority, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(tid, title?.trim() || d.title, d.description_md ?? '', d.priority ?? null, d.color ?? null, now(), now()),
    ...(d.labels ?? []).map((l: string) =>
      env.DB.prepare('INSERT OR IGNORE INTO task_labels (task_id, label_id) SELECT ?, id FROM labels WHERE id = ?').bind(tid, l),
    ),
    ...(d.people ?? []).map((p: string) =>
      env.DB.prepare("INSERT OR IGNORE INTO task_people (task_id, person_id, role) SELECT ?, id, 'member' FROM people WHERE id = ?").bind(tid, p),
    ),
    ...(d.checklist ?? []).map((c: Row, i: number) =>
      env.DB.prepare(
        'INSERT INTO checklist_items (id, task_id, text, weight, done, person_id, position, created_at) VALUES (?, ?, ?, ?, 0, NULL, ?, ?)',
      ).bind(newId('c'), tid, c.text, c.weight ?? null, i + 1, now()),
    ),
  ];
  await env.DB.batch(stmts);
  if (d.description_md) await env.DB.batch(syncFromDescription(env.DB, tid, d.description_md));
  if (tpl.cover_r2_key) {
    const aid = newId('a');
    const key = `tasks/${tid}/${aid}`;
    if (await copyObject(env, tpl.cover_r2_key, key)) {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO attachments (id, task_id, kind, name, r2_key, size, mime, created_at) VALUES (?, ?, 'file', ?, ?, ?, ?, ?)",
        ).bind(aid, tid, d.cover_name ?? 'capa', key, tpl.cover_size, d.cover_mime ?? 'image/jpeg', now()),
        env.DB.prepare('UPDATE tasks SET cover_key = ? WHERE id = ?').bind(aid, tid),
      ]);
    }
  }
  return tid;
}

export const details = new Hono<{ Bindings: Env }>();

// ---------- Detalhe completo da tarefa ----------
details.get('/tasks/:id/full', async (c) => {
  const tid = c.req.param('id');
  const [items, people, atts, out, inc] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM checklist_items WHERE task_id = ? ORDER BY position').bind(tid).all<Row>(),
    c.env.DB.prepare('SELECT person_id, role FROM task_people WHERE task_id = ?').bind(tid).all<Row>(),
    c.env.DB.prepare('SELECT * FROM attachments WHERE task_id = ? ORDER BY created_at').bind(tid).all<Row>(),
    c.env.DB.prepare('SELECT t.id, t.title, t.done_at FROM task_links l JOIN tasks t ON t.id = l.to_id WHERE l.from_id = ?').bind(tid).all(),
    c.env.DB.prepare('SELECT t.id, t.title, t.done_at FROM task_links l JOIN tasks t ON t.id = l.from_id WHERE l.to_id = ?').bind(tid).all(),
  ]);
  const o = origin(c.req.url);
  const attachments = await Promise.all(
    atts.results.map(async (a) => ({ ...a, href: a.kind === 'file' ? await signedUrl(c.env, o, a.r2_key) : a.url })),
  );
  return c.json({
    checklist: items.results,
    progress: progress(items.results as any),
    members: people.results.filter((p) => p.role === 'member').map((p) => p.person_id),
    mentions: people.results.filter((p) => p.role === 'mention').map((p) => p.person_id),
    attachments,
    refs_out: out.results,
    refs_in: inc.results,
  });
});

// Busca rápida para referenciar (#) e para os seletores
details.get('/tasks-search', async (c) => {
  const q = `%${(c.req.query('q') ?? '').trim()}%`;
  const r = await c.env.DB.prepare(
    `SELECT t.id, t.title, t.done_at,
       (SELECT b.name FROM task_placements p JOIN boards b ON b.id = p.board_id WHERE p.task_id = t.id LIMIT 1) AS board_name
     FROM tasks t WHERE t.title LIKE ? ORDER BY t.updated_at DESC LIMIT 12`,
  )
    .bind(q)
    .all();
  return c.json({ tasks: r.results });
});

// ---------- Pessoas ----------
details.get('/people', async (c) => c.json({ people: (await c.env.DB.prepare('SELECT * FROM people ORDER BY name').all()).results }));

details.post('/people', async (c) => {
  const { name, email } = await c.req.json<{ name: string; email?: string }>();
  if (!name?.trim()) return c.json({ error: 'Nome obrigatório.' }, 400);
  const pid = newId('pe');
  await c.env.DB.prepare('INSERT INTO people (id, name, email, created_at) VALUES (?, ?, ?, ?)')
    .bind(pid, name.trim(), email?.trim() || null, now())
    .run();
  return c.json({ id: pid });
});

details.patch('/people/:id', async (c) => {
  const { name, email } = await c.req.json<{ name?: string; email?: string }>();
  await c.env.DB.prepare('UPDATE people SET name = COALESCE(?, name), email = COALESCE(?, email) WHERE id = ?')
    .bind(name?.trim() || null, email === undefined ? null : email.trim(), c.req.param('id'))
    .run();
  return c.json({ ok: true });
});

details.delete('/people/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM people WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

details.put('/tasks/:id/members', async (c) => {
  const tid = c.req.param('id');
  const { person_ids } = await c.req.json<{ person_ids: string[] }>();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM task_people WHERE task_id = ? AND role = 'member'").bind(tid),
    ...person_ids.map((p) => c.env.DB.prepare("INSERT INTO task_people (task_id, person_id, role) VALUES (?, ?, 'member')").bind(tid, p)),
  ]);
  return c.json({ ok: true });
});

// ---------- Checklist ----------
details.post('/tasks/:id/checklist', async (c) => {
  const tid = c.req.param('id');
  const b = await c.req.json<{ text: string; weight?: number | null }>();
  if (!b.text?.trim()) return c.json({ error: 'Texto obrigatório.' }, 400);
  const max = await c.env.DB.prepare('SELECT COALESCE(MAX(position), 0) AS p FROM checklist_items WHERE task_id = ?').bind(tid).first<{ p: number }>();
  const cid = newId('c');
  await c.env.DB.prepare('INSERT INTO checklist_items (id, task_id, text, weight, position, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(cid, tid, b.text.trim(), b.weight ?? null, (max?.p ?? 0) + 1, now())
    .run();
  return c.json({ id: cid });
});

details.patch('/checklist/:id', async (c) => {
  const b = await c.req.json<Row>();
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of ['text', 'weight', 'done', 'person_id', 'position']) {
    if (b[f] === undefined) continue;
    sets.push(`${f} = ?`);
    vals.push(f === 'done' ? (b[f] ? 1 : 0) : b[f]);
  }
  if (sets.length) await c.env.DB.prepare(`UPDATE checklist_items SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, c.req.param('id')).run();
  return c.json({ ok: true });
});

details.delete('/checklist/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM checklist_items WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

// Todos os checklists de um board, por card e tarefa
details.get('/boards/:id/checklists', async (c) => {
  const bid = c.req.param('id');
  const rows = (
    await c.env.DB.prepare(
      `SELECT ci.*, t.title AS task_title, t.done_at AS task_done, p.list_id, l.name AS list_name, l.position AS list_pos, p.position AS task_pos
       FROM checklist_items ci
       JOIN tasks t ON t.id = ci.task_id
       JOIN task_placements p ON p.task_id = t.id AND p.board_id = ?
       LEFT JOIN lists l ON l.id = p.list_id
       ORDER BY l.position, p.position, ci.position`,
    )
      .bind(bid)
      .all<Row>()
  ).results;
  return c.json({ items: rows });
});

// ---------- Anexos ----------
details.post('/tasks/:id/attachments', async (c) => {
  const tid = c.req.param('id');
  const aid = newId('a');
  const type = c.req.header('Content-Type') ?? '';

  if (type.startsWith('application/json')) {
    const { url, name } = await c.req.json<{ url: string; name?: string }>();
    let u: URL;
    try {
      u = new URL(url);
      if (!/^https?:$/.test(u.protocol)) throw 0;
    } catch {
      return c.json({ error: 'Link inválido.' }, 400);
    }
    await c.env.DB.prepare("INSERT INTO attachments (id, task_id, kind, name, url, created_at) VALUES (?, ?, 'link', ?, ?, ?)")
      .bind(aid, tid, name?.trim() || u.hostname + u.pathname.replace(/\/$/, ''), u.toString(), now())
      .run();
    return c.json({ id: aid });
  }

  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return c.json({ error: 'Arquivo ausente.' }, 400);
  if (file.size > MAX_FILE_BYTES) return c.json({ error: 'Arquivo maior que 5 MB.' }, 413);
  const quota = Number(c.env.FILES_QUOTA_BYTES);
  if ((await usedBytes(c.env)) + file.size > quota) {
    return c.json({ error: 'Espaço de arquivos do portal cheio (limite para não sair do plano gratuito).' }, 507);
  }
  const key = `tasks/${tid}/${aid}`;
  await c.env.FILES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream', contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(file.name)}` },
  });
  await c.env.DB.prepare(
    "INSERT INTO attachments (id, task_id, kind, name, r2_key, size, mime, created_at) VALUES (?, ?, 'file', ?, ?, ?, ?, ?)",
  )
    .bind(aid, tid, file.name, key, file.size, file.type, now())
    .run();
  return c.json({ id: aid });
});

details.delete('/attachments/:id', async (c) => {
  const a = await c.env.DB.prepare('SELECT * FROM attachments WHERE id = ?').bind(c.req.param('id')).first<Row>();
  if (!a) return c.json({ ok: true });
  if (a.r2_key) await c.env.FILES.delete(a.r2_key);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE tasks SET cover_key = NULL WHERE cover_key = ?').bind(a.id),
    c.env.DB.prepare('DELETE FROM attachments WHERE id = ?').bind(a.id),
  ]);
  return c.json({ ok: true });
});

details.get('/storage', async (c) => c.json({ used: await usedBytes(c.env), quota: Number(c.env.FILES_QUOTA_BYTES) }));

// ---------- Ações: mover, copiar, duplicar, espelhar ----------
// mover: troca o lugar de UMA colocação (board/card)
details.post('/placements/:id/move', async (c) => {
  const { board_id, list_id } = await c.req.json<{ board_id: string; list_id: string | null }>();
  const edge = await c.env.DB.prepare('SELECT COALESCE(MIN(position), 1) AS p FROM task_placements WHERE board_id = ? AND list_id IS ?')
    .bind(board_id, list_id ?? null)
    .first<{ p: number }>();
  await c.env.DB.prepare('UPDATE task_placements SET board_id = ?, list_id = ?, position = ? WHERE id = ?')
    .bind(board_id, list_id ?? null, (edge?.p ?? 1) - 1, c.req.param('id'))
    .run();
  return c.json({ ok: true });
});

// tirar a tarefa de um lugar (desfazer espelho). Se era o único lugar, ela volta para o Inbox.
details.delete('/placements/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM task_placements WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

// copiar para outro lugar (tarefa nova, independente)
details.post('/tasks/:id/copy', async (c) => {
  const { board_id, list_id } = await c.req.json<{ board_id?: string | null; list_id?: string | null }>();
  const tid = await cloneTask(c.env, c.req.param('id'), ' (cópia)');
  if (!tid) return c.json({ error: 'Tarefa não encontrada.' }, 404);
  if (board_id) await place(c.env, tid, board_id, list_id ?? null);
  return c.json({ id: tid });
});

// duplicar no(s) mesmo(s) lugar(es)
details.post('/tasks/:id/duplicate', async (c) => {
  const src = c.req.param('id');
  const tid = await cloneTask(c.env, src, ' (cópia)');
  if (!tid) return c.json({ error: 'Tarefa não encontrada.' }, 404);
  const pls = (await c.env.DB.prepare('SELECT board_id, list_id FROM task_placements WHERE task_id = ?').bind(src).all<Row>()).results;
  for (const p of pls) await place(c.env, tid, p.board_id, p.list_id);
  return c.json({ id: tid });
});

// espelhar: a MESMA tarefa aparece em outro lugar; editar num lugar muda nos dois
details.post('/tasks/:id/mirror', async (c) => {
  const { board_id, list_id } = await c.req.json<{ board_id: string; list_id?: string | null }>();
  if (!board_id) return c.json({ error: 'Escolha um quadro.' }, 400);
  const pid = await place(c.env, c.req.param('id'), board_id, list_id ?? null);
  return c.json({ id: pid });
});

// ---------- Modelos ----------
details.get('/templates', async (c) =>
  c.json({ templates: (await c.env.DB.prepare('SELECT id, name, data FROM templates ORDER BY name').all<Row>()).results.map((t) => ({ ...t, data: JSON.parse(t.data) })) }),
);

// salvar tarefa como modelo
details.post('/templates', async (c) => {
  const { task_id, name } = await c.req.json<{ task_id: string; name: string }>();
  const t = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(task_id).first<Row>();
  if (!t || !name?.trim()) return c.json({ error: 'Tarefa e nome são obrigatórios.' }, 400);
  const [items, labels, people, cover] = await Promise.all([
    c.env.DB.prepare('SELECT text, weight FROM checklist_items WHERE task_id = ? ORDER BY position').bind(task_id).all<Row>(),
    c.env.DB.prepare('SELECT label_id FROM task_labels WHERE task_id = ?').bind(task_id).all<Row>(),
    c.env.DB.prepare("SELECT person_id FROM task_people WHERE task_id = ? AND role = 'member'").bind(task_id).all<Row>(),
    t.cover_key ? c.env.DB.prepare('SELECT * FROM attachments WHERE id = ?').bind(t.cover_key).first<Row>() : null,
  ]);
  const tplId = newId('tp');
  let coverKey: string | null = null;
  if (cover?.r2_key) {
    coverKey = `templates/${tplId}`;
    if (!(await copyObject(c.env, cover.r2_key, coverKey))) coverKey = null;
  }
  const data = {
    title: t.title,
    description_md: t.description_md,
    priority: t.priority,
    color: t.color,
    checklist: items.results,
    labels: labels.results.map((l) => l.label_id),
    people: people.results.map((p) => p.person_id),
    cover_name: cover?.name,
    cover_mime: cover?.mime,
  };
  await c.env.DB.prepare('INSERT INTO templates (id, name, data, cover_r2_key, cover_size, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(tplId, name.trim(), JSON.stringify(data), coverKey, coverKey ? cover!.size : 0, now())
    .run();
  return c.json({ id: tplId });
});

details.delete('/templates/:id', async (c) => {
  const t = await c.env.DB.prepare('SELECT cover_r2_key FROM templates WHERE id = ?').bind(c.req.param('id')).first<Row>();
  if (t?.cover_r2_key) await c.env.FILES.delete(t.cover_r2_key);
  await c.env.DB.prepare('DELETE FROM templates WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

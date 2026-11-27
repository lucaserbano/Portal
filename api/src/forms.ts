// Fase 6: formulários (construtor, link público, respostas, aviso por e-mail, Google Forms, tarefa a partir da resposta)
import { Hono } from 'hono';
import type { Env } from './index';
import { brandOf } from './files';
import { sha256 } from './auth';

const now = () => Math.floor(Date.now() / 1000);
const newId = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
type Row = Record<string, any>;

export const FIELD_TYPES = ['short', 'long', 'choice', 'checks', 'select', 'date', 'email', 'phone', 'number', 'scale', 'section'] as const;
type FieldType = (typeof FIELD_TYPES)[number];
export type Field = {
  id: string;
  type: FieldType;
  label: string;
  help?: string;
  required?: boolean;
  options?: string[];
  min?: number;
  max?: number;
};
type Answer = { id: string; label: string; value: string | string[] };

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'formulario';
const shortRand = () => crypto.randomUUID().replace(/-/g, '').slice(0, 4);

/** Limpa a lista de campos vinda do construtor */
function cleanFields(input: unknown): Field[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 100).flatMap((f: Row): Field[] => {
    if (!f || !FIELD_TYPES.includes(f.type)) return [];
    const field: Field = {
      id: typeof f.id === 'string' && /^[\w-]{1,40}$/.test(f.id) ? f.id : newId('q'),
      type: f.type,
      label: String(f.label ?? '').slice(0, 500),
      help: String(f.help ?? '').slice(0, 1000),
      required: !!f.required && f.type !== 'section',
    };
    if (['choice', 'checks', 'select'].includes(f.type)) {
      field.options = (Array.isArray(f.options) ? f.options : []).map((o: unknown) => String(o).slice(0, 300)).filter(Boolean).slice(0, 100);
    }
    if (f.type === 'scale') {
      field.min = Math.max(0, Math.min(1, Number(f.min ?? 1)));
      field.max = Math.max(2, Math.min(10, Number(f.max ?? 5)));
    }
    return [field];
  });
}

/** Confere as respostas contra os campos; devolve a lista final ou a mensagem de erro */
function validate(fields: Field[], raw: Record<string, unknown>): Answer[] | string {
  const out: Answer[] = [];
  for (const f of fields) {
    if (f.type === 'section') continue;
    let v = raw?.[f.id];
    if (f.type === 'checks') {
      const arr = (Array.isArray(v) ? v : []).map(String).filter((x) => f.options?.includes(x) || x.startsWith('Outro: '));
      if (f.required && !arr.length) return `Responda: ${f.label}`;
      out.push({ id: f.id, label: f.label, value: arr });
      continue;
    }
    const s = v == null ? '' : String(v).trim().slice(0, 10000);
    if (f.required && !s) return `Responda: ${f.label}`;
    if (s) {
      if ((f.type === 'choice' || f.type === 'select') && !f.options?.includes(s)) return `Opção inválida em: ${f.label}`;
      if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return `E-mail inválido em: ${f.label}`;
      if (f.type === 'number' && !Number.isFinite(Number(s.replace(',', '.')))) return `Número inválido em: ${f.label}`;
      if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(s)) return `Data inválida em: ${f.label}`;
      if (f.type === 'scale') {
        const n = Number(s);
        if (!Number.isInteger(n) || n < (f.min ?? 1) || n > (f.max ?? 5)) return `Valor inválido em: ${f.label}`;
      }
    }
    out.push({ id: f.id, label: f.label, value: s });
  }
  return out;
}

const showValue = (v: string | string[]) => (Array.isArray(v) ? v.join(', ') : v);
const fmtDate = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : s);

function answersText(fields: Field[], answers: Answer[]) {
  return answers
    .map((a) => {
      const f = fields.find((x) => x.id === a.id);
      const v = showValue(a.value);
      return `${a.label}\n${(f?.type === 'date' ? fmtDate(v) : v) || '—'}`;
    })
    .join('\n\n');
}

// ---------- Aviso por e-mail (Resend, plano grátis) ----------
async function notify(env: Env, form: Row, answers: Answer[]) {
  if (!env.RESEND_API_KEY || !env.NOTIFY_EMAIL || !form.notify) return;
  const fields: Field[] = JSON.parse(form.fields);
  const text = `Nova resposta em “${form.title}”.\n\n${answersText(fields, answers)}\n\nVer no portal: ${env.SITE_URL}/formularios/${form.id}`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'πύλη <onboarding@resend.dev>', to: [env.NOTIFY_EMAIL], subject: `Nova resposta: ${form.title}`, text }),
  });
  if (!r.ok) console.log('resend', r.status, await r.text());
}

// ---------- Google Forms (formulário público: lê a estrutura da página) ----------
// 18 = nota em estrelas; 10 = horário (vira texto curto). Grades e upload de arquivo ficam de fora.
const GOOGLE_TYPES: Record<number, FieldType> = { 0: 'short', 1: 'long', 2: 'choice', 3: 'select', 4: 'checks', 5: 'scale', 8: 'section', 9: 'date', 10: 'short', 18: 'scale' };

export async function readGoogleForm(url: string) {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    throw new Error('Link inválido.');
  }
  if (!['docs.google.com', 'forms.gle'].includes(u.hostname)) throw new Error('Cole o link de um Google Forms (docs.google.com/forms/… ou forms.gle/…).');
  const r = await fetch(u.toString(), { redirect: 'follow', headers: { 'Accept-Language': 'pt-BR' } });
  const final = new URL(r.url);
  if (final.hostname !== 'docs.google.com') throw new Error('O link não levou a um Google Forms.');
  const html = await r.text();
  const m = /FB_PUBLIC_LOAD_DATA_\s*=\s*([\s\S]*?);\s*<\/script>/.exec(html);
  if (!m) throw new Error('Não consegui ler o formulário. Ele precisa estar aberto a qualquer pessoa com o link (sem exigir login).');
  const data = JSON.parse(m[1]);
  const title = String(data?.[1]?.[8] ?? data?.[3] ?? 'Formulário importado');
  const description = String(data?.[1]?.[0] ?? '');
  const items: any[] = data?.[1]?.[1] ?? [];
  const fields: Field[] = [];
  const skipped: string[] = [];
  for (const it of items) {
    const label = String(it?.[1] ?? '').trim();
    const help = String(it?.[2] ?? '').trim();
    const type = GOOGLE_TYPES[it?.[3]];
    const entry = it?.[4]?.[0];
    if (!type) {
      if (label) skipped.push(label);
      continue;
    }
    const f: Field = { id: newId('q'), type, label, help, required: !!entry?.[2] };
    if (it?.[3] === 10) f.help = (help ? help + ' ' : '') + '(horário)';
    if (['choice', 'checks', 'select'].includes(type)) f.options = (entry?.[1] ?? []).map((o: any[]) => String(o?.[0] ?? '').trim()).filter(Boolean);
    if (type === 'scale') {
      const opts = (entry?.[1] ?? []).map((o: any[]) => Number(o?.[0]));
      f.min = Math.min(...opts.filter(Number.isFinite), 1);
      f.max = Math.max(...opts.filter(Number.isFinite), 5);
    }
    if (type === 'short' && /e-?mail/i.test(label)) f.type = 'email';
    if (type === 'short' && /(telefone|celular|whats)/i.test(label)) f.type = 'phone';
    fields.push(f);
  }
  return { title, description, fields, skipped };
}

// =====================================================================
// Rotas com login
// =====================================================================
export const forms = new Hono<{ Bindings: Env }>();

forms.get('/forms', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT f.id, f.slug, f.title, f.open, f.updated_at,
       (SELECT COUNT(*) FROM form_responses r WHERE r.form_id = f.id) AS total,
       (SELECT COUNT(*) FROM form_responses r WHERE r.form_id = f.id AND r.read_at IS NULL) AS unread,
       (SELECT MAX(created_at) FROM form_responses r WHERE r.form_id = f.id) AS last_at
     FROM forms f WHERE f.archived = 0 ORDER BY f.updated_at DESC`,
  ).all();
  return c.json({ forms: rows.results });
});

async function insertForm(env: Env, title: string, description: string, fields: Field[]) {
  const id = newId('f');
  const slug = `${slugify(title)}-${shortRand()}`;
  await env.DB.prepare('INSERT INTO forms (id, slug, title, description, fields, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, slug, title.slice(0, 300), description.slice(0, 5000), JSON.stringify(fields), now(), now())
    .run();
  return id;
}

forms.post('/forms', async (c) => {
  const b = await c.req.json<Row>().catch(() => ({}) as Row);
  const title = String(b.title ?? '').trim() || 'Formulário sem título';
  const fields: Field[] = [
    { id: newId('q'), type: 'short', label: 'Seu nome', required: true },
    { id: newId('q'), type: 'email', label: 'Seu e-mail', required: false },
  ];
  const id = await insertForm(c.env, title, '', fields);
  await c.env.DB.prepare('UPDATE forms SET title_field = ? WHERE id = ?').bind(fields[0].id, id).run();
  return c.json({ id });
});

forms.post('/forms/import-google', async (c) => {
  const { url } = await c.req.json<{ url: string }>();
  try {
    const g = await readGoogleForm(url);
    if (!g.fields.length) return c.json({ error: 'O formulário não tem perguntas que eu consiga ler.' }, 400);
    const id = await insertForm(c.env, g.title, g.description, g.fields);
    const first = g.fields.find((f) => f.type === 'short');
    if (first) await c.env.DB.prepare('UPDATE forms SET title_field = ? WHERE id = ?').bind(first.id, id).run();
    return c.json({ id, skipped: g.skipped });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

forms.get('/forms/:id', async (c) => {
  const f = await c.env.DB.prepare('SELECT * FROM forms WHERE id = ?').bind(c.req.param('id')).first<Row>();
  if (!f) return c.json({ error: 'Formulário não encontrado.' }, 404);
  return c.json({
    form: { ...f, fields: JSON.parse(f.fields) },
    public_url: `${c.env.SITE_URL}/f/${f.slug}`,
    email_ready: !!(c.env.RESEND_API_KEY && c.env.NOTIFY_EMAIL),
  });
});

forms.patch('/forms/:id', async (c) => {
  const b = await c.req.json<Row>();
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (k: string, v: unknown) => (sets.push(`${k} = ?`), vals.push(v));
  if (b.title !== undefined) set('title', String(b.title).trim().slice(0, 300) || 'Formulário sem título');
  if (b.description !== undefined) set('description', String(b.description).slice(0, 5000));
  if (b.thanks !== undefined) set('thanks', String(b.thanks).slice(0, 1000));
  if (b.fields !== undefined) set('fields', JSON.stringify(cleanFields(b.fields)));
  if (b.open !== undefined) set('open', b.open ? 1 : 0);
  if (b.notify !== undefined) set('notify', b.notify ? 1 : 0);
  if (b.title_field !== undefined) set('title_field', b.title_field || null);
  if (b.due_field !== undefined) set('due_field', b.due_field || null);
  if (b.client_id !== undefined) set('client_id', b.client_id || null);
  if (b.slug !== undefined) {
    const s = slugify(String(b.slug));
    const taken = await c.env.DB.prepare('SELECT id FROM forms WHERE slug = ? AND id != ?').bind(s, c.req.param('id')).first();
    if (taken) return c.json({ error: 'Esse endereço já está em uso.' }, 409);
    set('slug', s);
  }
  if (!sets.length) return c.json({ ok: true });
  set('updated_at', now());
  await c.env.DB.prepare(`UPDATE forms SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, c.req.param('id')).run();
  return c.json({ ok: true });
});

// Arquivar (as respostas ficam guardadas)
forms.delete('/forms/:id', async (c) => {
  await c.env.DB.prepare('UPDATE forms SET archived = 1, open = 0, updated_at = ? WHERE id = ?').bind(now(), c.req.param('id')).run();
  return c.json({ ok: true });
});

forms.get('/forms/:id/responses', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT r.id, r.answers, r.source, r.read_at, r.task_id, r.created_at, t.title AS task_title
     FROM form_responses r LEFT JOIN tasks t ON t.id = r.task_id
     WHERE r.form_id = ? ORDER BY r.created_at DESC`,
  )
    .bind(c.req.param('id'))
    .all<Row>();
  return c.json({ responses: rows.results.map((r) => ({ ...r, answers: JSON.parse(r.answers) })) });
});

forms.patch('/responses/:id', async (c) => {
  const b = await c.req.json<{ read?: boolean }>();
  await c.env.DB.prepare('UPDATE form_responses SET read_at = ? WHERE id = ?')
    .bind(b.read ? now() : null, c.req.param('id'))
    .run();
  return c.json({ ok: true });
});

forms.delete('/responses/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM form_responses WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

// Respostas antigas do Google Forms (CSV baixado do Forms/Planilhas, já lido no navegador)
forms.post('/forms/:id/import-responses', async (c) => {
  const f = await c.env.DB.prepare('SELECT fields FROM forms WHERE id = ?').bind(c.req.param('id')).first<Row>();
  if (!f) return c.json({ error: 'Formulário não encontrado.' }, 404);
  const fields: Field[] = JSON.parse(f.fields);
  const { rows } = await c.req.json<{ rows: Record<string, string>[] }>();
  if (!Array.isArray(rows) || !rows.length) return c.json({ error: 'Nenhuma linha no arquivo.' }, 400);
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const stmts: D1PreparedStatement[] = [];
  for (const row of rows.slice(0, 2000)) {
    const answers: Answer[] = [];
    let at = now();
    for (const [h, v] of Object.entries(row)) {
      if (/carimbo|timestamp|data\/hora/i.test(h)) {
        const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(v);
        if (m) at = Math.floor(Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4] + 3, +m[5], +(m[6] ?? 0)) / 1000); // horário de Brasília
        continue;
      }
      const field = fields.find((x) => norm(x.label) === norm(h));
      let value: string | string[] = String(v ?? '');
      if (field?.type === 'checks') value = value ? value.split(/,\s*/) : [];
      if (field?.type === 'date') {
        const d = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value as string);
        if (d) value = `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`;
      }
      answers.push({ id: field?.id ?? newId('q'), label: field?.label ?? h, value });
    }
    if (!answers.some((a) => showValue(a.value))) continue;
    stmts.push(
      c.env.DB.prepare('INSERT INTO form_responses (id, form_id, answers, source, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(
        newId('r'), c.req.param('id'), JSON.stringify(answers), 'google', now(), at,
      ),
    );
  }
  for (let i = 0; i < stmts.length; i += 50) await c.env.DB.batch(stmts.slice(i, i + 50));
  return c.json({ imported: stmts.length });
});

/** Resposta → tarefa no Inbox, com título, descrição e prazo preenchidos */
forms.post('/responses/:id/task', async (c) => {
  const r = await c.env.DB.prepare(
    'SELECT r.*, f.title AS form_title, f.fields, f.title_field, f.due_field FROM form_responses r JOIN forms f ON f.id = r.form_id WHERE r.id = ?',
  )
    .bind(c.req.param('id'))
    .first<Row>();
  if (!r) return c.json({ error: 'Resposta não encontrada.' }, 404);
  if (r.task_id) {
    const exists = await c.env.DB.prepare('SELECT id FROM tasks WHERE id = ?').bind(r.task_id).first();
    if (exists) return c.json({ id: r.task_id, existed: true });
  }
  const fields: Field[] = JSON.parse(r.fields);
  const answers: Answer[] = JSON.parse(r.answers);
  const pick = (fid: string | null) => (fid ? showValue(answers.find((a) => a.id === fid)?.value ?? '') : '');
  const who = pick(r.title_field);
  const title = who ? `${r.form_title} — ${who}` : `${r.form_title} — resposta de ${new Date(r.created_at * 1000).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
  const md =
    `**Resposta do formulário “${r.form_title}”** (${new Date(r.created_at * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })})\n\n` +
    answers
      .map((a) => {
        const f = fields.find((x) => x.id === a.id);
        const v = showValue(a.value);
        return `**${a.label}**\n\n${(f?.type === 'date' ? fmtDate(v) : v) || '—'}`;
      })
      .join('\n\n');
  let due: number | null = null;
  const d = pick(r.due_field);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) due = Math.floor(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), 21) / 1000); // 18h em Brasília
  const tid = newId('t');
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO tasks (id, title, description_md, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(
      tid, title.slice(0, 300), md, due, now(), now(),
    ),
    c.env.DB.prepare('UPDATE form_responses SET task_id = ?, read_at = COALESCE(read_at, ?) WHERE id = ?').bind(tid, now(), r.id),
  ]);
  return c.json({ id: tid });
});

// =====================================================================
// Rotas públicas (sem login): o link /f/slug que o cliente abre
// =====================================================================
export const publicForms = new Hono<{ Bindings: Env }>();

publicForms.get('/public/forms/:slug', async (c) => {
  const f = await c.env.DB.prepare('SELECT title, description, fields, open, thanks, client_id FROM forms WHERE slug = ? AND archived = 0')
    .bind(c.req.param('slug'))
    .first<Row>();
  if (!f) return c.json({ error: 'Formulário não encontrado.' }, 404);
  const cl = f.client_id ? await c.env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(f.client_id).first<Row>() : null;
  const { client_id, ...pub } = f;
  return c.json({ form: { ...pub, fields: JSON.parse(f.fields), open: !!f.open }, brand: await brandOf(c.env, new URL(c.req.url).origin, cl) });
});

publicForms.post('/public/forms/:slug', async (c) => {
  const f = await c.env.DB.prepare('SELECT * FROM forms WHERE slug = ? AND archived = 0').bind(c.req.param('slug')).first<Row>();
  if (!f) return c.json({ error: 'Formulário não encontrado.' }, 404);
  if (!f.open) return c.json({ error: 'Este formulário não está recebendo respostas.' }, 403);
  const b = await c.req.json<Row>().catch(() => ({}) as Row);
  if (b.website) return c.json({ ok: true }); // campo-isca: robôs preenchem, pessoas não veem
  const ip = await sha256((c.req.header('CF-Connecting-IP') ?? 'local') + f.id);
  const recent = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM form_responses WHERE ip_hash = ? AND created_at > ?')
    .bind(ip, now() - 3600)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= 10) return c.json({ error: 'Muitas respostas seguidas. Tente de novo mais tarde.' }, 429);
  const answers = validate(JSON.parse(f.fields), b.answers ?? {});
  if (typeof answers === 'string') return c.json({ error: answers }, 400);
  await c.env.DB.prepare('INSERT INTO form_responses (id, form_id, answers, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(newId('r'), f.id, JSON.stringify(answers), ip, now())
    .run();
  c.executionCtx.waitUntil(notify(c.env, f, answers).catch((e) => console.log('notify', String(e))));
  return c.json({ ok: true, thanks: f.thanks });
});

// Backup: formulários e respostas em markdown
export async function formsMarkdown(env: Env) {
  const fs = (await env.DB.prepare('SELECT * FROM forms WHERE archived = 0 ORDER BY created_at').all<Row>()).results;
  const rs = (await env.DB.prepare('SELECT form_id, answers, created_at FROM form_responses ORDER BY created_at').all<Row>()).results;
  const files: Record<string, string> = {};
  for (const f of fs) {
    const fields: Field[] = JSON.parse(f.fields);
    let md = `# ${f.title}\n\n${f.description ? f.description + '\n\n' : ''}Link: /f/${f.slug}\n\n## Perguntas\n\n`;
    md += fields.map((q) => `- ${q.label}${q.required ? ' *' : ''} (${q.type}${q.options?.length ? ': ' + q.options.join(' | ') : ''})`).join('\n');
    md += '\n\n## Respostas\n\n';
    for (const r of rs.filter((x) => x.form_id === f.id)) {
      md += `### ${new Date(r.created_at * 1000).toISOString().slice(0, 16).replace('T', ' ')}\n\n${answersText(fields, JSON.parse(r.answers))}\n\n`;
    }
    files[`formularios/${f.slug}.md`] = md;
  }
  return files;
}

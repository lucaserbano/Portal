// Backup diário: exporta tudo como .md para o repositório PRIVADO (BACKUP_REPO).
import type { Env } from './index';
import { formsMarkdown } from './forms';

type Row = Record<string, any>;

const fmt = (ts: number | null) =>
  ts ? new Date(ts * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';

const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

let CHECK: Row[] = [];

function taskMd(t: Row) {
  const meta = [
    t.priority && `prioridade: ${t.priority}`,
    t.start_at && `início: ${fmt(t.start_at)}`,
    t.due_at && `prazo: ${fmt(t.due_at)}`,
    t.done_at && `concluída: ${fmt(t.done_at)}`,
  ].filter(Boolean);
  let md = `### ${t.done_at ? '[x]' : '[ ]'} ${t.title}\n`;
  if (meta.length) md += `\n_${meta.join(' · ')}_\n`;
  if (t.description_md) md += `\n${t.description_md}\n`;
  const items = CHECK.filter((c) => c.task_id === t.id);
  if (items.length) {
    md += '\n' + items.map((c) => `- [${c.done ? 'x' : ' '}] ${c.text}${c.weight === 2 || c.weight === 3 ? ` (×${c.weight})` : ''}`).join('\n') + '\n';
  }
  return md + '\n';
}

export async function buildMarkdownFiles(env: Env) {
  const boards = (await env.DB.prepare('SELECT * FROM boards WHERE archived = 0 ORDER BY position').all()).results;
  const lists = (await env.DB.prepare('SELECT * FROM lists ORDER BY position').all()).results;
  const placed = (
    await env.DB.prepare(
      `SELECT t.*, p.board_id, p.list_id, p.position AS pos FROM tasks t
       JOIN task_placements p ON p.task_id = t.id ORDER BY p.position`,
    ).all()
  ).results;
  const inbox = (
    await env.DB.prepare(
      'SELECT * FROM tasks WHERE id NOT IN (SELECT task_id FROM task_placements) ORDER BY created_at',
    ).all()
  ).results;

  CHECK = (await env.DB.prepare('SELECT task_id, text, weight, done FROM checklist_items ORDER BY position').all()).results;
  const files: Record<string, string> = {};
  for (const b of boards) {
    let md = `# ${b.name}\n\n`;
    for (const l of lists.filter((l) => l.board_id === b.id)) {
      md += `## ${l.name}\n\n`;
      for (const t of placed.filter((t) => t.list_id === l.id)) md += taskMd(t);
    }
    const loose = placed.filter((t) => t.board_id === b.id && !t.list_id);
    if (loose.length) {
      md += `## (sem card)\n\n`;
      for (const t of loose) md += taskMd(t);
    }
    files[`boards/${slug(String(b.name))}.md`] = md;
  }
  files['inbox.md'] = `# Inbox\n\n` + inbox.map(taskMd).join('');
  Object.assign(files, await formsMarkdown(env));
  return files;
}

const toB64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

export async function runBackup(env: Env) {
  if (!env.GITHUB_TOKEN) return { ok: false, error: 'GITHUB_TOKEN ausente' };
  const files = await buildMarkdownFiles(env);
  files['README.md'] =
    `# πύλη — backup\n\nBackup automático e diário dos dados do portal, em markdown.\n` +
    `Repositório privado. Última execução: ${fmt(Math.floor(Date.now() / 1000))}.\n`;

  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'pyle-backup',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  // Trava de segurança: nunca gravar dados num repositório público.
  const repo = await fetch(`https://api.github.com/repos/${env.BACKUP_REPO}`, { headers });
  if (!repo.ok) return { ok: false, error: `repositório inacessível: ${repo.status}` };
  if (!((await repo.json()) as { private: boolean }).private) {
    return { ok: false, error: `${env.BACKUP_REPO} está público — backup cancelado` };
  }

  const base = `https://api.github.com/repos/${env.BACKUP_REPO}/contents/`;
  let written = 0;
  for (const [path, content] of Object.entries(files)) {
    const url = base + path.split('/').map(encodeURIComponent).join('/');
    const cur = await fetch(url, { headers });
    let sha: string | undefined;
    if (cur.ok) {
      const j = (await cur.json()) as { sha: string; content: string };
      sha = j.sha;
      if (j.content.replace(/\n/g, '') === toB64(content)) continue; // sem mudança
    }
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ message: `backup: ${path}`, content: toB64(content), sha }),
    });
    if (!res.ok) return { ok: false, error: `${path}: ${res.status} ${await res.text()}` };
    written++;
  }
  return { ok: true, written };
}

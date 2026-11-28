// Fase 5: iCloud via CalDAV
// - Os eventos moram no iCloud (fonte da verdade); o portal lê e escreve direto lá.
// - As tarefas com data são espelhadas num calendário próprio "πύλη" (só ida: portal → iPhone).
import type { Env } from './index';

export const TZ = 'America/Sao_Paulo'; // fuso do usuário (horários sem fuso no iCloud)
const ROOT = 'https://caldav.icloud.com';
const pyleName = (env: Env) => env.PYLE_CALENDAR || 'πύλη'; // nos testes locais: outro calendário
const PYLE_COLOR = '#FF0006FF';
const TASK_UID = (id: string) => `pyle-task-${id}`;

export type Cal = { href: string; name: string; color: string; pyle: boolean };
export type CalEvent = {
  id: string; // href (+ instância, se repetir)
  href: string;
  etag: string;
  uid: string;
  cal: string;
  title: string;
  start: number; // segundos (UTC)
  end: number;
  all_day: boolean;
  location: string;
  notes: string;
  remind_min: number | null;
  recurring: boolean;
};

type Row = Record<string, any>;
const now = () => Math.floor(Date.now() / 1000);

// ---------- HTTP ----------
function configured(env: Env) {
  return !!(env.ICLOUD_EMAIL && env.ICLOUD_APP_PASSWORD);
}

async function dav(env: Env, method: string, url: string, body?: string, headers: Record<string, string> = {}) {
  const r = await fetch(url.startsWith('http') ? url : ROOT + url, {
    method,
    body,
    headers: {
      Authorization: 'Basic ' + btoa(`${env.ICLOUD_EMAIL}:${env.ICLOUD_APP_PASSWORD}`),
      ...(body && !headers['Content-Type'] ? { 'Content-Type': 'application/xml; charset=utf-8' } : {}),
      ...headers,
    },
  });
  if (r.status === 401) throw new Error('O iCloud recusou o login. A senha de app pode ter sido apagada.');
  return r;
}

// ---------- Configurações guardadas (pasta dos calendários, calendário πύλη) ----------
async function getSetting(env: Env, key: string) {
  return (await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>())?.value ?? null;
}
async function setSetting(env: Env, key: string, value: string) {
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, value)
    .run();
}

const tag = (x: string, name: string) => new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`).exec(x)?.[1]?.trim() ?? '';
const responses = (x: string) => x.match(/<(?:\w+:)?response\b[\s\S]*?<\/(?:\w+:)?response>/g) ?? [];
const xmlText = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

async function home(env: Env) {
  const cached = await getSetting(env, 'caldav_home');
  if (cached) return cached;
  const p = await dav(env, 'PROPFIND', '/', '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>', { Depth: '0' });
  const principal = tag(tag(await p.text(), 'current-user-principal'), 'href');
  const h = await dav(
    env,
    'PROPFIND',
    principal,
    '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>',
    { Depth: '0' },
  );
  const url = tag(tag(await h.text(), 'calendar-home-set'), 'href');
  if (!url) throw new Error('Não achei os calendários no iCloud.');
  await setSetting(env, 'caldav_home', url);
  return url;
}

const origin = (u: string) => new URL(u).origin;

/** Calendários de eventos do iCloud (guardados por 1 hora) */
export async function calendars(env: Env, fresh = false): Promise<Cal[]> {
  const PYLE_NAME = pyleName(env);
  if (!fresh) {
    const c = await getSetting(env, 'caldav_cals');
    if (c) {
      const { at, list } = JSON.parse(c);
      if (now() - at < 3600) return list;
    }
  }
  const h = await home(env);
  const r = await dav(
    env,
    'PROPFIND',
    h,
    `<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/">
      <d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/><a:calendar-color/></d:prop></d:propfind>`,
    { Depth: '1' },
  );
  const list: Cal[] = [];
  for (const x of responses(await r.text())) {
    if (!/<(?:\w+:)?calendar\b/.test(tag(x, 'resourcetype'))) continue;
    if (!/name=['"]VEVENT['"]/.test(x)) continue;
    const href = origin(h) + xmlText(tag(x, 'href'));
    const name = xmlText(tag(x, 'displayname')) || 'Calendário';
    const color = (tag(x, 'calendar-color') || '#808080').slice(0, 7);
    list.push({ href, name, color, pyle: name === PYLE_NAME });
  }
  await setSetting(env, 'caldav_cals', JSON.stringify({ at: now(), list }));
  return list;
}

/** Calendário "πύλη": acha ou cria */
export async function pyleCalendar(env: Env): Promise<string> {
  const PYLE_NAME = pyleName(env);
  const saved = await getSetting(env, 'caldav_pyle');
  if (saved) return saved;
  let cal = (await calendars(env, true)).find((c) => c.pyle);
  if (!cal) {
    const href = (await home(env)).replace(/\/?$/, '/') + crypto.randomUUID().toUpperCase() + '/';
    const r = await dav(
      env,
      'MKCOL', // MKCALENDAR não é aceito pelo fetch da Cloudflare; MKCOL estendido faz o mesmo
      href,
      `<d:mkcol xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/">
        <d:set><d:prop>
          <d:resourcetype><d:collection/><c:calendar/></d:resourcetype>
          <d:displayname>${PYLE_NAME}</d:displayname>
          <a:calendar-color>${PYLE_COLOR}</a:calendar-color>
          <c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>
        </d:prop></d:set></d:mkcol>`,
    );
    if (!r.ok) throw new Error(`Não consegui criar o calendário πύλη no iCloud (${r.status}).`);
    cal = (await calendars(env, true)).find((c) => c.pyle);
    if (!cal) throw new Error('Criei o calendário πύλη, mas ele não apareceu na lista.');
  }
  await setSetting(env, 'caldav_pyle', cal.href);
  return cal.href;
}

// ---------- Datas ----------
function tzOffsetMs(tz: string, t: number) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(t));
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour % 24, +m.minute, +m.second) - t;
}

/** Hora "de parede" num fuso → segundos UTC */
export function zoned(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string) {
  let zone = tz;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
  } catch {
    zone = TZ; // fusos com nome do Windows etc.: assume o do usuário
  }
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let t = guess - tzOffsetMs(zone, guess);
  const again = guess - tzOffsetMs(zone, t);
  if (again !== t) t = again;
  return Math.floor(t / 1000);
}

function parseDate(value: string, params: Record<string, string>) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h) return { t: zoned(+y, +mo, +d, 0, 0, 0, TZ), allDay: true };
  if (z) return { t: Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) / 1000, allDay: false };
  return { t: zoned(+y, +mo, +d, +h, +mi, +s, params.TZID ?? TZ), allDay: false };
}

const pad = (n: number) => String(n).padStart(2, '0');
function utcStamp(t: number) {
  const d = new Date(t * 1000);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
/** Data local (no fuso do usuário) "YYYYMMDD" */
function localDate(t: number) {
  const d = new Date(t * 1000 + tzOffsetMs(TZ, t * 1000));
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

// ---------- iCalendar ----------
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const unesc = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([\\;,])/g, '$1');

/** Linhas com mais de 75 bytes são dobradas (regra do iCalendar) */
function fold(line: string) {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > 74) {
      out.push(cur);
      cur = ' ';
      bytes = 1;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

function duration(min: number) {
  const m = Math.abs(min);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  return `${min > 0 ? '-' : ''}P${d ? d + 'D' : ''}${h || mm ? 'T' : ''}${h ? h + 'H' : ''}${mm ? mm + 'M' : ''}${!d && !h && !mm ? 'T0M' : ''}`;
}
function parseDuration(s: string) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(s.trim());
  if (!m) return null;
  const total = (+(m[2] ?? 0)) * 10080 + (+(m[3] ?? 0)) * 1440 + (+(m[4] ?? 0)) * 60 + +(m[5] ?? 0);
  return m[1] === '-' ? total : -total; // minutos ANTES do início
}

export type EventInput = {
  title: string;
  start: number;
  end: number;
  all_day: boolean;
  location?: string;
  notes?: string;
  remind_min?: number | null;
};

export function buildEvent(uid: string, e: EventInput, extra: string[] = []) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//pyle//portal//PT', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${utcStamp(now())}`];
  if (e.all_day) {
    const endDay = Math.max(e.end, e.start + 86400);
    lines.push(`DTSTART;VALUE=DATE:${localDate(e.start)}`, `DTEND;VALUE=DATE:${localDate(endDay)}`);
  } else {
    lines.push(`DTSTART:${utcStamp(e.start)}`, `DTEND:${utcStamp(Math.max(e.end, e.start + 60))}`);
  }
  lines.push(`SUMMARY:${esc(e.title)}`);
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
  if (e.notes) lines.push(`DESCRIPTION:${esc(e.notes)}`);
  lines.push(...extra);
  if (e.remind_min != null) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, `TRIGGER:${duration(e.remind_min)}`, 'END:VALARM');
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

type Prop = { name: string; params: Record<string, string>; value: string };
function props(block: string): Prop[] {
  return block
    .replace(/\r?\n[ \t]/g, '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const i = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
      const head = line.slice(0, i);
      const [name, ...ps] = head.split(';');
      const params: Record<string, string> = {};
      for (const p of ps) {
        const [k, v] = p.split('=');
        params[k.toUpperCase()] = (v ?? '').replace(/^"|"$/g, '');
      }
      return { name: name.toUpperCase(), params, value: line.slice(i + 1) };
    });
}

function parseEvents(ics: string, href: string, etag: string, cal: string): CalEvent[] {
  const out: CalEvent[] = [];
  const recurring = /^RRULE:/m.test(ics) || /^RECURRENCE-ID/m.test(ics);
  for (const block of ics.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? []) {
    const inner = block.replace(/BEGIN:VALARM[\s\S]*?END:VALARM/g, '');
    const ps = props(inner);
    const get = (n: string) => ps.find((p) => p.name === n);
    const ds = get('DTSTART');
    if (!ds) continue;
    const start = parseDate(ds.value, ds.params);
    if (!start) continue;
    const de = get('DTEND');
    let end = de ? parseDate(de.value, de.params)?.t ?? null : null;
    if (end == null) {
      const du = get('DURATION');
      const min = du ? parseDuration(du.value) : null;
      end = min != null ? start.t - min * 60 : start.t + (start.allDay ? 86400 : 3600);
    }
    let remind: number | null = null;
    const alarm = /BEGIN:VALARM[\s\S]*?END:VALARM/.exec(block)?.[0];
    if (alarm) {
      const tr = props(alarm).find((p) => p.name === 'TRIGGER');
      if (tr && tr.params.VALUE !== 'DATE-TIME') remind = parseDuration(tr.value);
    }
    const rid = get('RECURRENCE-ID')?.value;
    out.push({
      id: href + (rid ? '#' + rid : ''),
      href,
      etag,
      uid: get('UID')?.value ?? href,
      cal,
      title: unesc(get('SUMMARY')?.value ?? '(sem título)'),
      start: start.t,
      end,
      all_day: start.allDay,
      location: unesc(get('LOCATION')?.value ?? ''),
      notes: unesc(get('DESCRIPTION')?.value ?? ''),
      remind_min: remind,
      recurring,
    });
  }
  return out;
}

/** Eventos de um calendário num intervalo (repetições já expandidas pelo iCloud) */
async function query(env: Env, cal: Cal, from: number, to: number) {
  const range = `start="${utcStamp(from)}" end="${utcStamp(to)}"`;
  const r = await dav(
    env,
    'REPORT',
    cal.href,
    `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
      <d:prop><d:getetag/><c:calendar-data><c:expand ${range}/></c:calendar-data></d:prop>
      <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range ${range}/></c:comp-filter></c:comp-filter></c:filter>
    </c:calendar-query>`,
    { Depth: '1' },
  );
  if (!r.ok) return [];
  const out: CalEvent[] = [];
  for (const x of responses(await r.text())) {
    const data = xmlText(tag(x, 'calendar-data'));
    if (!data) continue;
    out.push(...parseEvents(data, origin(cal.href) + xmlText(tag(x, 'href')), xmlText(tag(x, 'getetag')), cal.href));
  }
  return out;
}

export async function listEvents(env: Env, from: number, to: number) {
  if (!configured(env)) return { calendars: [] as Cal[], events: [] as CalEvent[], error: 'iCloud não configurado.' };
  try {
    await pyleCalendar(env);
    const cals = await calendars(env);
    const all = await Promise.all(cals.map((c) => query(env, c, from, to)));
    // as tarefas já aparecem como barras: não repete os espelhos delas
    const events = all.flat().filter((e) => !e.uid.startsWith('pyle-task-'));
    return { calendars: cals, events, error: null as string | null };
  } catch (e) {
    return { calendars: [] as Cal[], events: [] as CalEvent[], error: (e as Error).message };
  }
}

/** Garante que o endereço pertence à pasta de calendários desta conta */
async function ownHref(env: Env, href: string) {
  const h = await home(env);
  const base = new URL(h);
  const u = new URL(href);
  if (u.origin !== base.origin || !u.pathname.startsWith(base.pathname)) throw new Error('Endereço de evento inválido.');
  return u.toString();
}

export async function createEvent(env: Env, e: EventInput) {
  const cal = await pyleCalendar(env);
  const uid = `pyle-ev-${crypto.randomUUID()}`;
  const href = cal + uid + '.ics';
  const r = await dav(env, 'PUT', href, buildEvent(uid, e), { 'Content-Type': 'text/calendar; charset=utf-8', 'If-None-Match': '*' });
  if (!r.ok) throw new Error(`O iCloud não aceitou o evento (${r.status}).`);
  return { href };
}

export async function updateEvent(env: Env, href: string, uid: string, e: EventInput) {
  const url = await ownHref(env, href);
  const r = await dav(env, 'PUT', url, buildEvent(uid, e), { 'Content-Type': 'text/calendar; charset=utf-8' });
  if (!r.ok) throw new Error(`O iCloud não aceitou a alteração (${r.status}).`);
}

export async function deleteEvent(env: Env, href: string) {
  const url = await ownHref(env, href);
  const r = await dav(env, 'DELETE', url);
  if (!r.ok && r.status !== 404) throw new Error(`O iCloud não apagou o evento (${r.status}).`);
}

// ---------- Tarefas → calendário πύλη ----------
async function sha(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

function taskIcs(t: Row, site: string) {
  const start = t.start_at ?? t.due_at - 1800;
  const end = t.due_at ?? t.start_at + 3600;
  const where = t.boards ? `Quadro: ${t.boards}\n` : '';
  const late = t.due_at && !t.done_at && t.due_at > now() ? 60 : null; // lembrete 1 h antes do prazo
  const extra = [`URL:${site}`];
  const ev: EventInput = {
    title: (t.done_at ? '✓ ' : '') + t.title,
    start,
    end: Math.max(end, start + 60),
    all_day: false,
    notes: `${where}Tarefa do πύλη (edite pelo portal).`,
    remind_min: null,
  };
  let ics = buildEvent(TASK_UID(t.id), ev, extra);
  if (late != null) {
    // alarme na hora exata (prazo − 1 h), mesmo que o início seja dias antes
    const alarm = ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc('Prazo em 1 h: ' + t.title)}`, `TRIGGER;VALUE=DATE-TIME:${utcStamp(t.due_at - 3600)}`, 'END:VALARM'];
    ics = ics.replace('END:VEVENT', alarm.map(fold).join('\r\n') + '\r\nEND:VEVENT');
  }
  return ics;
}

/**
 * Compara as tarefas com data e o que já foi enviado ao iCloud; envia só o que mudou.
 * Roda depois de cada alteração e no cron diário.
 */
export async function syncTasks(env: Env, site: string) {
  if (!configured(env)) return { skipped: true };
  const cal = await pyleCalendar(env);
  const tasks = (
    await env.DB.prepare(
      `SELECT t.id, t.title, t.start_at, t.due_at, t.done_at,
         (SELECT GROUP_CONCAT(b.name, ', ') FROM task_placements p JOIN boards b ON b.id = p.board_id WHERE p.task_id = t.id) AS boards
       FROM tasks t WHERE t.start_at IS NOT NULL OR t.due_at IS NOT NULL`,
    ).all<Row>()
  ).results;
  const synced = new Map(
    (await env.DB.prepare('SELECT task_id, hash FROM task_sync').all<{ task_id: string; hash: string }>()).results.map((r) => [r.task_id, r.hash]),
  );
  let put = 0;
  let removed = 0;
  const errors: string[] = [];
  for (const t of tasks) {
    const ics = taskIcs(t, site);
    // o DTSTAMP muda a cada vez: fica fora da comparação
    const hash = await sha(ics.replace(/DTSTAMP:[^\r\n]+/, ''));
    if (synced.get(t.id) === hash) {
      synced.delete(t.id);
      continue;
    }
    synced.delete(t.id);
    const r = await dav(env, 'PUT', `${cal}${TASK_UID(t.id)}.ics`, ics, { 'Content-Type': 'text/calendar; charset=utf-8' });
    if (!r.ok) {
      errors.push(`${t.title}: ${r.status}`);
      continue;
    }
    await env.DB.prepare('INSERT INTO task_sync (task_id, hash, synced_at) VALUES (?, ?, ?) ON CONFLICT(task_id) DO UPDATE SET hash = excluded.hash, synced_at = excluded.synced_at')
      .bind(t.id, hash, now())
      .run();
    put++;
  }
  // tarefas apagadas ou que perderam as datas
  for (const id of synced.keys()) {
    const r = await dav(env, 'DELETE', `${cal}${TASK_UID(id)}.ics`);
    if (r.ok || r.status === 404) {
      await env.DB.prepare('DELETE FROM task_sync WHERE task_id = ?').bind(id).run();
      removed++;
    }
  }
  return { put, removed, errors };
}

// Fase 8 (grátis): servidor MCP para o app do Claude ler e criar coisas no πύλη.
// Protocolo MCP "Streamable HTTP" sem estado, com respostas JSON. O login é por OAuth (ver oauth.ts).
// As ferramentas chamam as mesmas rotas da API por dentro do Worker (sem passar pela internet).
import { Hono } from 'hono';
import type { Env } from './index';
import { boards } from './boards';
import { details } from './details';
import { agenda } from './agenda';
import { forms } from './forms';
import { social } from './social';
import { share } from './share';
import { TZ, syncTasks, zoned } from './caldav';

type Row = Record<string, any>;

// rotas internas, sem o middleware de sessão: só o MCP (já autenticado) chama
const internal = new Hono<{ Bindings: Env }>();
internal.route('/', boards);
internal.route('/', details);
internal.route('/', agenda);
internal.route('/', forms);
internal.route('/', social);
internal.route('/', share);

async function call<T = any>(env: Env, ctx: ExecutionContext, method: string, path: string, body?: unknown): Promise<T> {
  const r = await internal.request(
    'https://interno' + path,
    { method, body: body === undefined ? undefined : JSON.stringify(body), headers: body === undefined ? {} : { 'Content-Type': 'application/json' } },
    env,
    ctx,
  );
  const d = (await r.json().catch(() => ({}))) as any;
  if (!r.ok) throw new Error(d.error ?? `erro ${r.status}`);
  return d as T;
}

// ---------- Datas: "2026-12-03 18:00" (horário de Brasília) ⇄ segundos ----------
function parseWhen(v: unknown, endOfDay = false): number | null {
  if (v == null || v === '') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(String(v).trim());
  if (!m) throw new Error(`Data inválida: “${v}”. Use AAAA-MM-DD ou AAAA-MM-DD HH:MM.`);
  const [, y, mo, d, h, mi] = m;
  return zoned(+y, +mo, +d, h ? +h : endOfDay ? 18 : 9, mi ? +mi : 0, 0, TZ);
}
const fmt = (t: number | null) =>
  t ? new Date(t * 1000).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
const PRIO: Record<string, string | null> = { bom: 'bom', preocupante: 'preocupante', critico: 'critico', 'crítico': 'critico', '': null };

// ---------- Ferramentas ----------
type Tool = {
  name: string;
  description: string;
  inputSchema: Row;
  readOnly?: boolean;
  run: (a: Row, env: Env, ctx: ExecutionContext) => Promise<unknown>;
};
const S = (props: Row, required: string[] = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
const str = (description: string) => ({ type: 'string', description });

const TOOLS: Tool[] = [
  {
    name: 'listar_quadros',
    description: 'Lista os quadros (boards) do πύλη com as colunas (que o usuário chama de "cards") e seus ids. Use antes de criar ou mover tarefas.',
    inputSchema: S({}),
    readOnly: true,
    run: async (_a, env, ctx) => (await call(env, ctx, 'GET', '/destinations')).boards,
  },
  {
    name: 'listar_tarefas',
    description: 'Lista tarefas. Filtre por quadro, coluna, inbox ou texto. Por padrão só as abertas.',
    inputSchema: S({
      quadro_id: str('id do quadro (de listar_quadros)'),
      coluna_id: str('id da coluna'),
      inbox: { type: 'boolean', description: 'só as tarefas do Inbox (sem quadro)' },
      incluir_concluidas: { type: 'boolean' },
      busca: str('texto no título ou na descrição'),
      limite: { type: 'number', description: 'máximo (padrão 50)' },
    }),
    readOnly: true,
    run: async (a, env) => {
      const where: string[] = [];
      const vals: unknown[] = [];
      if (!a.incluir_concluidas) where.push('t.done_at IS NULL');
      if (a.inbox) where.push('t.id NOT IN (SELECT task_id FROM task_placements)');
      if (a.quadro_id) where.push('t.id IN (SELECT task_id FROM task_placements WHERE board_id = ?)'), vals.push(a.quadro_id);
      if (a.coluna_id) where.push('t.id IN (SELECT task_id FROM task_placements WHERE list_id = ?)'), vals.push(a.coluna_id);
      if (a.busca) where.push('(t.title LIKE ? OR t.description_md LIKE ?)'), vals.push(`%${a.busca}%`, `%${a.busca}%`);
      const rows = (
        await env.DB.prepare(
          `SELECT t.id, t.title, t.priority, t.start_at, t.due_at, t.done_at,
             (SELECT GROUP_CONCAT(b.name || COALESCE(' › ' || l.name, ''), '; ') FROM task_placements p JOIN boards b ON b.id = p.board_id
                LEFT JOIN lists l ON l.id = p.list_id WHERE p.task_id = t.id) AS onde
           FROM tasks t ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
           ORDER BY t.due_at IS NULL, t.due_at, t.created_at DESC LIMIT ?`,
        )
          .bind(...vals, Math.min(200, Number(a.limite) || 50))
          .all<Row>()
      ).results;
      return rows.map((t) => ({ id: t.id, titulo: t.title, onde: t.onde ?? 'Inbox', prioridade: t.priority, inicio: fmt(t.start_at), prazo: fmt(t.due_at), concluida: fmt(t.done_at) }));
    },
  },
  {
    name: 'ler_tarefa',
    description: 'Lê uma tarefa completa: descrição (markdown), checklist (com ids), labels, membros, onde está, anexos e referências.',
    inputSchema: S({ id: str('id da tarefa') }, ['id']),
    readOnly: true,
    run: async (a, env, ctx) => {
      const [t, f] = await Promise.all([call(env, ctx, 'GET', `/tasks/${a.id}`), call(env, ctx, 'GET', `/tasks/${a.id}/full`)]);
      const x = t.task;
      return {
        id: x.id,
        titulo: x.title,
        descricao_md: x.description_md,
        prioridade: x.priority,
        inicio: fmt(x.start_at),
        prazo: fmt(x.due_at),
        concluida: fmt(x.done_at),
        onde: t.placements.map((p: Row) => `${p.board_name}${p.list_name ? ' › ' + p.list_name : ''}`),
        checklist: f.checklist.map((i: Row) => ({ id: i.id, texto: i.text, feito: !!i.done, peso: i.weight ?? 1 })),
        anexos: f.attachments.map((a: Row) => ({ nome: a.name, tipo: a.kind })),
        referencias: [...f.refs_out, ...f.refs_in].map((r: Row) => r.title),
      };
    },
  },
  {
    name: 'criar_tarefa',
    description:
      'Cria uma tarefa. Sem quadro, vai para o Inbox. Datas no horário de Brasília (AAAA-MM-DD ou AAAA-MM-DD HH:MM). Prioridade: bom, preocupante ou critico. ' +
      'Use para transformar documentos, briefings ou respostas de formulário em tarefas.',
    inputSchema: S(
      {
        titulo: str('título curto'),
        descricao_md: str('descrição em markdown (negrito, listas, links; sem títulos #)'),
        quadro_id: str('id do quadro (opcional)'),
        coluna_id: str('id da coluna dentro do quadro (opcional)'),
        inicio: str('AAAA-MM-DD ou AAAA-MM-DD HH:MM'),
        prazo: str('AAAA-MM-DD ou AAAA-MM-DD HH:MM (sem hora = 18:00)'),
        prioridade: { type: 'string', enum: ['bom', 'preocupante', 'critico'] },
        checklist: { type: 'array', items: { type: 'string' }, description: 'itens do checklist, na ordem' },
      },
      ['titulo'],
    ),
    run: async (a, env, ctx) => {
      // valida tudo antes de criar (não deixa tarefa pela metade)
      const patch: Row = {};
      if (a.descricao_md) patch.description_md = a.descricao_md;
      if (a.inicio) patch.start_at = parseWhen(a.inicio);
      if (a.prazo) patch.due_at = parseWhen(a.prazo, true);
      if (a.prioridade) patch.priority = PRIO[a.prioridade] ?? null;
      const { id } = await call(env, ctx, 'POST', '/tasks', { title: a.titulo, board_id: a.quadro_id || undefined, list_id: a.coluna_id || undefined, at: 'bottom' });
      if (Object.keys(patch).length) await call(env, ctx, 'PATCH', `/tasks/${id}`, patch);
      for (const item of (a.checklist ?? []).slice(0, 100)) await call(env, ctx, 'POST', `/tasks/${id}/checklist`, { text: String(item) });
      return { id, criada: true, onde: a.quadro_id ? 'quadro' : 'Inbox' };
    },
  },
  {
    name: 'atualizar_tarefa',
    description: 'Altera uma tarefa: título, descrição, datas, prioridade, concluir/reabrir, adicionar itens ao checklist ou marcar itens (ids de ler_tarefa) como feitos.',
    inputSchema: S(
      {
        id: str('id da tarefa'),
        titulo: { type: 'string' },
        descricao_md: { type: 'string' },
        inicio: str('AAAA-MM-DD [HH:MM] ou vazio para tirar'),
        prazo: str('AAAA-MM-DD [HH:MM] ou vazio para tirar'),
        prioridade: { type: 'string', enum: ['bom', 'preocupante', 'critico', ''] },
        concluida: { type: 'boolean' },
        adicionar_checklist: { type: 'array', items: { type: 'string' } },
        marcar_feitos: { type: 'array', items: { type: 'string' }, description: 'ids de itens do checklist' },
      },
      ['id'],
    ),
    run: async (a, env, ctx) => {
      const patch: Row = {};
      if (a.titulo) patch.title = a.titulo;
      if (a.descricao_md !== undefined) patch.description_md = a.descricao_md;
      if (a.inicio !== undefined) patch.start_at = parseWhen(a.inicio);
      if (a.prazo !== undefined) patch.due_at = parseWhen(a.prazo, true);
      if (a.prioridade !== undefined) patch.priority = PRIO[a.prioridade] ?? null;
      if (Object.keys(patch).length) await call(env, ctx, 'PATCH', `/tasks/${a.id}`, patch);
      for (const item of a.adicionar_checklist ?? []) await call(env, ctx, 'POST', `/tasks/${a.id}/checklist`, { text: String(item) });
      for (const cid of a.marcar_feitos ?? []) await call(env, ctx, 'PATCH', `/checklist/${cid}`, { done: 1 });
      if (a.concluida !== undefined) await call(env, ctx, 'POST', `/tasks/${a.id}/${a.concluida ? 'done' : 'undone'}`);
      return { ok: true };
    },
  },
  {
    name: 'listar_clientes',
    description: 'Lista os clientes de Social Media (com ids).',
    inputSchema: S({}),
    readOnly: true,
    run: async (_a, env, ctx) => (await call(env, ctx, 'GET', '/clients')).clients,
  },
  {
    name: 'ler_cliente',
    description: 'Perfil do cliente (nicho, público, tom de voz, pilares, fazer/evitar, referências), banco de temas e lista de roteiros. Use antes de sugerir temas ou escrever roteiros.',
    inputSchema: S({ id: str('id do cliente') }, ['id']),
    readOnly: true,
    run: async (a, env, ctx) => {
      const d = await call(env, ctx, 'GET', `/clients/${a.id}`);
      return {
        perfil: d.client,
        temas: d.themes.map((t: Row) => ({ id: t.id, titulo: t.title, formato: t.format, pilar: t.pillar, status: t.status, ideia: t.notes })),
        roteiros: d.scripts.map((s: Row) => ({ id: s.id, titulo: s.title, formato: s.format, status: s.status, resumo: s.excerpt })),
      };
    },
  },
  {
    name: 'criar_temas',
    description: 'Adiciona temas ao banco de temas de um cliente. Formato: reels, carrossel, estatico, stories ou outro.',
    inputSchema: S(
      {
        cliente_id: { type: 'string' },
        temas: {
          type: 'array',
          items: S({ titulo: { type: 'string' }, formato: { type: 'string', enum: ['reels', 'carrossel', 'estatico', 'stories', 'outro'] }, pilar: { type: 'string' }, ideia: { type: 'string' } }, ['titulo']),
        },
      },
      ['cliente_id', 'temas'],
    ),
    run: async (a, env, ctx) =>
      call(env, ctx, 'POST', `/clients/${a.cliente_id}/themes`, {
        items: (a.temas ?? []).map((t: Row) => ({ title: t.titulo, format: t.formato, pillar: t.pilar, notes: t.ideia })),
      }),
  },
  {
    name: 'criar_roteiro',
    description: 'Cria um roteiro para um cliente. Texto em markdown (use **negrito** para seções, sem títulos #). Pode partir de um tema (tema_id).',
    inputSchema: S(
      {
        cliente_id: { type: 'string' },
        titulo: { type: 'string' },
        formato: { type: 'string', enum: ['reels', 'carrossel', 'estatico', 'stories', 'outro'] },
        texto_md: { type: 'string' },
        tema_id: { type: 'string' },
      },
      ['cliente_id', 'titulo', 'texto_md'],
    ),
    run: async (a, env, ctx) => {
      const { id } = await call(env, ctx, 'POST', `/clients/${a.cliente_id}/scripts`, { title: a.titulo, format: a.formato, theme_id: a.tema_id });
      await call(env, ctx, 'PATCH', `/scripts/${id}`, { body_md: a.texto_md, title: a.titulo });
      return { id, criado: true };
    },
  },
  {
    name: 'listar_eventos',
    description: 'Agenda: eventos do iCloud e tarefas com data num intervalo de dias (AAAA-MM-DD, horário de Brasília).',
    inputSchema: S({ de: str('AAAA-MM-DD'), ate: str('AAAA-MM-DD (inclusive)') }, ['de', 'ate']),
    readOnly: true,
    run: async (a, env, ctx) => {
      const from = parseWhen(String(a.de).slice(0, 10) + ' 00:00')!;
      const to = parseWhen(String(a.ate).slice(0, 10) + ' 00:00')! + 86400;
      const d = await call(env, ctx, 'GET', `/agenda?from=${from}&to=${to}`);
      return {
        eventos: d.events.map((e: Row) => ({ titulo: e.title, inicio: fmt(e.start), fim: fmt(e.end), dia_inteiro: e.all_day, local: e.location })),
        tarefas: d.tasks.map((t: Row) => ({ id: t.id, titulo: t.title, inicio: fmt(t.start_at), prazo: fmt(t.due_at), concluida: !!t.done_at })),
        aviso: d.error,
      };
    },
  },
  {
    name: 'criar_evento',
    description: 'Cria um evento no calendário "πύλη" do iCloud (aparece no iPhone). Horário de Brasília.',
    inputSchema: S(
      {
        titulo: { type: 'string' },
        inicio: str('AAAA-MM-DD HH:MM (ou AAAA-MM-DD se dia inteiro)'),
        fim: str('AAAA-MM-DD HH:MM (opcional; padrão 1 h depois)'),
        dia_inteiro: { type: 'boolean' },
        lembrete_min: { type: 'number', description: 'minutos antes (opcional)' },
        local: { type: 'string' },
        notas: { type: 'string' },
      },
      ['titulo', 'inicio'],
    ),
    run: async (a, env, ctx) => {
      const allDay = !!a.dia_inteiro;
      const start = allDay ? parseWhen(String(a.inicio).slice(0, 10) + ' 00:00')! : parseWhen(a.inicio)!;
      const end = a.fim ? (allDay ? parseWhen(String(a.fim).slice(0, 10) + ' 00:00')! + 86400 : parseWhen(a.fim)!) : start + (allDay ? 86400 : 3600);
      await call(env, ctx, 'POST', '/events', { title: a.titulo, start, end, all_day: allDay, remind_min: a.lembrete_min ?? null, location: a.local, notes: a.notas });
      return { criado: true };
    },
  },
  {
    name: 'listar_formularios',
    description: 'Lista os formulários com total de respostas e quantas são novas.',
    inputSchema: S({}),
    readOnly: true,
    run: async (_a, env, ctx) => (await call(env, ctx, 'GET', '/forms')).forms,
  },
  {
    name: 'listar_respostas_formulario',
    description: 'Respostas de um formulário (perguntas e respostas). Útil para transformar uma resposta em tarefas com criar_tarefa.',
    inputSchema: S({ formulario_id: { type: 'string' }, so_novas: { type: 'boolean' } }, ['formulario_id']),
    readOnly: true,
    run: async (a, env, ctx) => {
      const d = await call(env, ctx, 'GET', `/forms/${a.formulario_id}/responses`);
      return d.responses
        .filter((r: Row) => !a.so_novas || !r.read_at)
        .map((r: Row) => ({ id: r.id, recebida: fmt(r.created_at), nova: !r.read_at, virou_tarefa: !!r.task_id, respostas: r.answers.map((x: Row) => ({ pergunta: x.label, resposta: x.value })) }));
    },
  },
];

// ---------- Protocolo (JSON-RPC 2.0) ----------
const VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const INSTRUCTIONS =
  'πύλη é o portal de trabalho pessoal do usuário (social media, produção audiovisual, aulas). Quadros têm colunas (o usuário chama de "cards") e tarefas; ' +
  'tarefas sem quadro ficam no Inbox. Datas sempre no horário de Brasília. Escreva em português. Antes de criar tarefas num quadro, use listar_quadros para achar os ids.';

type Msg = { jsonrpc: '2.0'; id?: string | number | null; method?: string; params?: Row };

async function handle(msg: Msg, env: Env, ctx: ExecutionContext, mutated: { v: boolean }) {
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id, result });
  const err = (code: number, message: string) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } });
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion;
      return ok({
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[2],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'pyle', title: 'πύλη', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { readOnlyHint: !!t.readOnly, destructiveHint: false },
        })),
      });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === msg.params?.name);
      if (!tool) return err(-32602, `Ferramenta desconhecida: ${msg.params?.name}`);
      try {
        const out = await tool.run(msg.params?.arguments ?? {}, env, ctx);
        if (!tool.readOnly) mutated.v = true;
        return ok({ content: [{ type: 'text', text: JSON.stringify(out, null, 1) }], structuredContent: Array.isArray(out) ? { itens: out } : (out as Row) });
      } catch (e) {
        return ok({ content: [{ type: 'text', text: `Erro: ${(e as Error).message}` }], isError: true });
      }
    }
    default:
      if (msg.id === undefined) return null; // notificação (ex.: notifications/initialized)
      return err(-32601, `Método não suportado: ${msg.method}`);
  }
}

/** Handler do endpoint /mcp (já autenticado pelo OAuth) */
export const mcpHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'GET') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    if (request.method === 'DELETE') return new Response(null, { status: 204 });
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    let body: Msg | Msg[];
    try {
      body = await request.json();
    } catch {
      return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } }, { status: 400 });
    }
    const mutated = { v: false };
    const list = Array.isArray(body) ? body : [body];
    const out = (await Promise.all(list.map((m) => handle(m, env, ctx, mutated)))).filter(Boolean);
    if (mutated.v) ctx.waitUntil(syncTasks(env, env.SITE_URL).catch((e) => console.log('sync', String(e))));
    if (!out.length) return new Response(null, { status: 202 });
    return Response.json(Array.isArray(body) ? out : out[0]);
  },
};

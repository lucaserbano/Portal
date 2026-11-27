// Tipos e formatação compartilhados

export type Priority = 'bom' | 'preocupante' | 'critico' | null;

export interface Task {
	id: string;
	title: string;
	description_md: string;
	start_at: number | null;
	due_at: number | null;
	priority: Priority;
	color: string | null;
	done_at: number | null;
	created_at: number;
	labels: string[];
	placement_id?: string;
	list_id?: string | null;
	position?: number;
	placements?: number;
	cover_key?: string | null;
	cover_url?: string | null;
	progress?: { done: number; total: number; pct: number } | null;
	people?: string[];
}

export interface List {
	id: string;
	board_id: string;
	name: string;
	position: number;
	is_final: number;
}

export interface Label {
	id: string;
	name: string;
	color: string;
}

export interface CardFields {
	priority: boolean;
	labels: boolean;
	due: boolean;
	start: boolean;
	description: boolean;
	cover: boolean;
	checklist: boolean;
	people: boolean;
}

export const PRIORITY_LABEL: Record<Exclude<Priority, null>, string> = {
	bom: 'Bom',
	preocupante: 'Preocupante',
	critico: 'Crítico'
};

// Cores de fundo do cartão: tons claros que não competem com o magenta.
// No modo noturno cada uma tem um tom escuro próprio (o texto fica branco).
export const CARD_COLORS = [
	{ value: null, name: 'branco', dark: null },
	{ value: '#f0f0f0', name: 'cinza', dark: '#262626' },
	{ value: '#ffe3ef', name: 'rosa', dark: '#4d0f2b' },
	{ value: '#fff4c2', name: 'amarelo', dark: '#3d3200' },
	{ value: '#e2ecff', name: 'azul', dark: '#10264d' },
	{ value: '#e3f4e1', name: 'verde', dark: '#123a1c' }
] as const;

/** Variáveis CSS do fundo do cartão (claro e escuro) */
export function cardVars(value: string | null) {
	if (!value) return undefined;
	const c = CARD_COLORS.find((x) => x.value === value);
	return `--card-l: ${value}; --card-d: ${c?.dark ?? `color-mix(in srgb, ${value} 30%, #000)`}`;
}

// Cores dos labels: tons médios, legíveis no fundo branco e no preto
export const LABEL_COLORS = [
	'#ff006f', // magenta
	'#ff8fb8', // rosa
	'#e53935', // vermelho
	'#ff7a00', // laranja
	'#e0a800', // amarelo
	'#1f9d55', // verde
	'#00a3a3', // turquesa
	'#2b6cff', // azul
	'#7c5cff', // roxo
	'#a8703a', // marrom
	'#808080', // cinza
	'#000000' // preto (vira branco no modo noturno)
];

/** Variáveis CSS do label: --c (cor) e --ink (texto sobre a cor) */
export function labelVars(hex: string) {
	if (/^#0{6}$/i.test(hex)) return '--c: var(--black); --ink: var(--white)';
	const n = parseInt(hex.slice(1), 16);
	const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
	return `--c: ${hex}; --ink: ${lum > 0.6 ? '#000' : '#fff'}`;
}

export const nowS = () => Math.floor(Date.now() / 1000);

export const isLate = (t: Pick<Task, 'due_at' | 'done_at'>) => !t.done_at && !!t.due_at && t.due_at < nowS();

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "26 nov, 18:59" (ano só quando diferente do atual) */
export function fmtShort(ts: number | null) {
	if (!ts) return '';
	const d = new Date(ts * 1000);
	const year = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
	return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "26/11/2026, 18:59" */
export function fmtLong(ts: number | null) {
	if (!ts) return '';
	const d = new Date(ts * 1000);
	return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** timestamp → valor de <input type="datetime-local"> */
export function toInput(ts: number | null) {
	if (!ts) return '';
	const d = new Date(ts * 1000);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromInput(v: string) {
	return v ? Math.floor(new Date(v).getTime() / 1000) : null;
}

/** Posição entre dois vizinhos (ordenação fracionária) */
export function between(prev: number | undefined, next: number | undefined) {
	if (prev === undefined && next === undefined) return 1;
	if (prev === undefined) return next! - 1;
	if (next === undefined) return prev + 1;
	return (prev + next) / 2;
}

/** "1 tarefa", "3 tarefas" */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Markdown/HTML do editor → texto simples para prévias (tira tags, inclusive cortadas no meio) */
export const plainText = (md: string) =>
	md
		.replace(/<[^>]*(>|$)/g, '')
		.replace(/\[([^\]]+)\]\((?:person|task):[^)]+\)/g, '$1')
		.replace(/\\([\[\]])/g, '$1')
		.replace(/[#>*_=`~\\]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

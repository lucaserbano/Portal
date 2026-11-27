// Exportação de quadros e tarefas: .md, .csv, .xlsx, .docx, .pdf
// As bibliotecas pesadas (xlsx, docx, pdf) só são baixadas quando usadas.
import { PRIORITY_LABEL, fmtLong } from './model.ts';

export type ExTask = {
	id: string;
	title: string;
	list: string | null;
	description_md: string;
	priority: 'bom' | 'preocupante' | 'critico' | null;
	start_at: number | null;
	due_at: number | null;
	done_at: number | null;
	created_at: number;
	labels: string[];
	members: string[];
	checklist: { text: string; weight: number | null; done: number; person: string | null }[];
	progress: { done: number; total: number; pct: number } | null;
	attachments: { kind: 'link' | 'file'; name: string; url: string | null }[];
};

export const FIELDS = [
	{ key: 'list', label: 'card' },
	{ key: 'priority', label: 'prioridade' },
	{ key: 'start', label: 'início' },
	{ key: 'due', label: 'prazo' },
	{ key: 'done', label: 'concluída' },
	{ key: 'labels', label: 'labels' },
	{ key: 'members', label: 'membros' },
	{ key: 'description', label: 'descrição' },
	{ key: 'checklist', label: 'checklist' },
	{ key: 'progress', label: 'progresso' },
	{ key: 'attachments', label: 'anexos' }
] as const;
export type FieldKey = (typeof FIELDS)[number]['key'];

/** markdown → texto simples (para csv, xlsx, docx e pdf) */
export function plain(md: string) {
	return md
		.replace(/\\([\[\]*_#>`~-])/g, '$1') // escapes do markdown (\[imagem 1\] → [imagem 1])
		.replace(/\[([^\]]+)\]\((?:person|task):[^)]+\)/g, '$1')
		.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1 ($2)')
		.replace(/<\/?(u|mark)[^>]*>/g, '')
		.replace(/==([^=]+)==/g, '$1')
		.replace(/\*\*([^*]+)\*\*/g, '$1')
		.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
		.replace(/~~([^~]+)~~/g, '$1')
		.replace(/^```\w*\n?|```$/gm, '')
		.replace(/^\s*[-*] /gm, '• ')
		.replace(/^> ?/gm, '│ ')
		.trim();
}

const prio = (p: ExTask['priority']) => (p ? PRIORITY_LABEL[p] : '');
const checkLine = (c: ExTask['checklist'][number]) =>
	`${c.text}${c.weight === 2 || c.weight === 3 ? ` (×${c.weight})` : ''}${c.person ? ` — ${c.person}` : ''}`;

/** Linhas de metadados na ordem escolhida */
function meta(t: ExTask, f: Set<FieldKey>) {
	const out: [string, string][] = [];
	if (f.has('list') && t.list) out.push(['card', t.list]);
	if (f.has('priority') && t.priority) out.push(['prioridade', prio(t.priority)]);
	if (f.has('start') && t.start_at) out.push(['início', fmtLong(t.start_at)]);
	if (f.has('due') && t.due_at) out.push(['prazo', fmtLong(t.due_at)]);
	if (f.has('done') && t.done_at) out.push(['concluída', fmtLong(t.done_at)]);
	if (f.has('labels') && t.labels.length) out.push(['labels', t.labels.join(', ')]);
	if (f.has('members') && t.members.length) out.push(['membros', t.members.join(', ')]);
	if (f.has('progress') && t.progress) out.push(['progresso', `${t.progress.pct}% (${t.progress.done}/${t.progress.total})`]);
	return out;
}

// ---------- .md (compatível com a importação) ----------
export function toMarkdown(title: string, groups: { name: string; tasks: ExTask[] }[], f: Set<FieldKey>) {
	let md = `# ${title}\n\n`;
	for (const g of groups) {
		md += `## ${g.name}\n\n`;
		for (const t of g.tasks) {
			md += `### ${t.done_at ? '[x]' : '[ ]'} ${t.title}\n\n`;
			const m = meta(t, new Set([...f].filter((k) => k !== 'list')));
			if (m.length) md += `_${m.map(([k, v]) => `${k}: ${v}`).join('; ')}_\n\n`;
			if (f.has('description') && t.description_md.trim()) md += `${t.description_md.trim()}\n\n`;
			if (f.has('checklist') && t.checklist.length) md += t.checklist.map((c) => `- [${c.done ? 'x' : ' '}] ${checkLine(c)}`).join('\n') + '\n\n';
			if (f.has('attachments') && t.attachments.length)
				md += 'Anexos:\n' + t.attachments.map((a) => (a.url ? `- [${a.name}](${a.url})` : `- ${a.name}`)).join('\n') + '\n\n';
		}
	}
	return md;
}

// ---------- tabela (csv / xlsx) ----------
function table(tasks: ExTask[], f: Set<FieldKey>) {
	const cols: { h: string; v: (t: ExTask) => string | number | Date | null }[] = [{ h: 'tarefa', v: (t) => t.title }];
	if (f.has('list')) cols.push({ h: 'card', v: (t) => t.list ?? '' });
	if (f.has('priority')) cols.push({ h: 'prioridade', v: (t) => prio(t.priority) });
	if (f.has('start')) cols.push({ h: 'início', v: (t) => (t.start_at ? new Date(t.start_at * 1000) : null) });
	if (f.has('due')) cols.push({ h: 'prazo', v: (t) => (t.due_at ? new Date(t.due_at * 1000) : null) });
	if (f.has('done')) cols.push({ h: 'concluída', v: (t) => (t.done_at ? new Date(t.done_at * 1000) : null) });
	if (f.has('labels')) cols.push({ h: 'labels', v: (t) => t.labels.join(', ') });
	if (f.has('members')) cols.push({ h: 'membros', v: (t) => t.members.join(', ') });
	if (f.has('progress')) cols.push({ h: 'progresso %', v: (t) => (t.progress ? t.progress.pct : null) });
	if (f.has('checklist')) cols.push({ h: 'checklist', v: (t) => t.checklist.map((c) => `${c.done ? '[x]' : '[ ]'} ${checkLine(c)}`).join('\n') });
	if (f.has('description')) cols.push({ h: 'descrição', v: (t) => plain(t.description_md) });
	if (f.has('attachments')) cols.push({ h: 'anexos', v: (t) => t.attachments.map((a) => a.url ?? a.name).join('\n') });
	return cols;
}

export function toCSV(tasks: ExTask[], f: Set<FieldKey>) {
	const cols = table(tasks, f);
	const cell = (v: string | number | Date | null) => {
		const s = v instanceof Date ? fmtLong(v.getTime() / 1000) : v == null ? '' : String(v);
		return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	};
	const rows = [cols.map((c) => c.h), ...tasks.map((t) => cols.map((c) => c.v(t)))];
	// ; e BOM: o Excel em português abre direto, com acentos
	return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}

export async function toXLSX(tasks: ExTask[], f: Set<FieldKey>) {
	const { default: writeExcelFile } = await import('write-excel-file/browser');
	const cols = table(tasks, f);
	const head = cols.map((c) => ({ value: c.h, fontWeight: 'bold' as const }));
	const body = tasks.map((t) =>
		cols.map((c) => {
			const v = c.v(t);
			if (v instanceof Date) return { value: v, type: Date, format: 'dd/mm/yyyy hh:mm' };
			if (typeof v === 'number') return { value: v, type: Number };
			return { value: v ?? '', type: String, wrap: true };
		})
	);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return writeExcelFile([head, ...body] as any).toBlob();
}

// ---------- .docx ----------
export async function toDOCX(title: string, groups: { name: string; tasks: ExTask[] }[], f: Set<FieldKey>) {
	const d = await import('docx');
	const P = (text: string, opts: Record<string, unknown> = {}) => new d.Paragraph({ children: [new d.TextRun({ text, ...opts })] });
	const children: InstanceType<typeof d.Paragraph>[] = [new d.Paragraph({ text: title, heading: d.HeadingLevel.TITLE })];
	for (const g of groups) {
		children.push(new d.Paragraph({ text: g.name, heading: d.HeadingLevel.HEADING_1 }));
		for (const t of g.tasks) {
			children.push(new d.Paragraph({ text: (t.done_at ? '✓ ' : '') + t.title, heading: d.HeadingLevel.HEADING_2 }));
			for (const [k, v] of meta(t, new Set([...f].filter((x) => x !== 'list')))) {
				children.push(new d.Paragraph({ children: [new d.TextRun({ text: `${k}: `, color: '808080' }), new d.TextRun(v)] }));
			}
			if (f.has('description') && t.description_md.trim()) {
				for (const line of plain(t.description_md).split('\n')) children.push(P(line));
			}
			if (f.has('checklist') && t.checklist.length) {
				for (const c of t.checklist) children.push(P(`${c.done ? '☑' : '☐'} ${checkLine(c)}`));
			}
			if (f.has('attachments') && t.attachments.length) {
				for (const a of t.attachments) children.push(P(`↗ ${a.name}${a.url ? ` — ${a.url}` : ''}`, { color: '555555' }));
			}
		}
	}
	const doc = new d.Document({
		styles: { default: { document: { run: { font: 'Helvetica', size: 22 } } } },
		sections: [{ children }]
	});
	return d.Packer.toBlob(doc);
}

// ---------- .pdf ----------
// Fonte padrão do PDF (Helvetica) só tem caracteres latinos: troca o que não cabe.
const pdfSafe = (s: string) =>
	s
		.replace(/πύλη/g, 'pyle')
		.replace(/›/g, '>')
		.replace(/[“”]/g, '"')
		.replace(/[‘’]/g, "'")
		.replace(/[–—]/g, '-')
		.replace(/│/g, '|')
		.replace(/…/g, '...')
		.replace(/[^\x00-\xFF•]/g, '');

export async function toPDF(title: string, subtitle: string, groups: { name: string; tasks: ExTask[] }[], f: Set<FieldKey>) {
	const { jsPDF } = await import('jspdf');
	const doc = new jsPDF({ unit: 'pt', format: 'a4' });
	const W = doc.internal.pageSize.getWidth();
	const H = doc.internal.pageSize.getHeight();
	const M = 48;
	const maxW = W - M * 2;
	let y = M;

	const need = (h: number) => {
		if (y + h > H - M) {
			doc.addPage();
			y = M;
		}
	};
	const text = (s: string, size: number, opts: { color?: [number, number, number]; bold?: boolean; indent?: number; gap?: number } = {}) => {
		doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
		doc.setFontSize(size);
		doc.setTextColor(...(opts.color ?? [0, 0, 0]));
		const lines = doc.splitTextToSize(pdfSafe(s), maxW - (opts.indent ?? 0)) as string[];
		for (const l of lines) {
			need(size * 1.35);
			doc.text(l, M + (opts.indent ?? 0), y + size);
			y += size * 1.35;
		}
		y += opts.gap ?? 0;
	};
	const rule = (color: [number, number, number] = [0, 0, 0], w = 1) => {
		need(10);
		doc.setDrawColor(...color);
		doc.setLineWidth(w);
		doc.line(M, y, W - M, y);
		y += 10;
	};

	text(subtitle, 9, { color: [128, 128, 128], gap: 4 });
	text(title, 24, { gap: 6 });
	rule([255, 0, 111], 2);

	// PDF de uma tarefa só: o título já está no cabeçalho
	const single = groups.length === 1 && !groups[0].name && groups[0].tasks.length === 1;
	for (const g of groups) {
		if (groups.length > 1 || g.name) {
			y += 6;
			text(g.name, 14, { bold: true, gap: 2 });
			rule();
		}
		for (const t of g.tasks) {
			need(60);
			if (!single) text((t.done_at ? '[x] ' : '') + t.title, 13, { gap: 2 });
			else if (t.done_at) text('concluída', 9, { color: [255, 0, 111], gap: 2 });
			const m = meta(t, new Set([...f].filter((k) => k !== 'list')));
			if (m.length) text(m.map(([k, v]) => `${k}: ${v}`).join('      '), 8.5, { color: [128, 128, 128], gap: 4 });
			if (f.has('description') && t.description_md.trim()) text(plain(t.description_md), 10, { gap: 6 });
			if (f.has('checklist') && t.checklist.length) {
				for (const c of t.checklist) text(`${c.done ? '[x]' : '[  ]'}  ${checkLine(c)}`, 10, { indent: 8, color: c.done ? [128, 128, 128] : [0, 0, 0] });
				y += 6;
			}
			if (f.has('attachments') && t.attachments.length) {
				for (const a of t.attachments) text(`anexo: ${a.name}${a.url ? ` — ${a.url}` : ''}`, 9, { color: [85, 85, 85] });
				y += 4;
			}
			y += 6;
			doc.setDrawColor(220, 220, 220);
			doc.setLineWidth(0.5);
			need(8);
			doc.line(M, y, W - M, y);
			y += 12;
		}
	}

	const pages = doc.getNumberOfPages();
	for (let i = 1; i <= pages; i++) {
		doc.setPage(i);
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(8);
		doc.setTextColor(128, 128, 128);
		doc.text(`${pdfSafe(title)}    ${i}/${pages}`, W - M, H - 24, { align: 'right' });
	}
	return doc.output('blob');
}

// ---------- PDF do roteiro (para o designer) ----------
export type ScriptPdf = {
	client: string;
	title: string;
	format: string;
	status: string;
	body_md: string;
	images: { url: string; caption: string }[];
};

/** Imagem (qualquer formato que o navegador abra) → JPEG para o PDF */
async function toJpeg(url: string) {
	const blob = await (await fetch(url)).blob();
	const bmp = await createImageBitmap(blob);
	const c = document.createElement('canvas');
	const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
	c.width = Math.round(bmp.width * scale);
	c.height = Math.round(bmp.height * scale);
	const ctx = c.getContext('2d')!;
	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, c.width, c.height);
	ctx.drawImage(bmp, 0, 0, c.width, c.height);
	return { data: c.toDataURL('image/jpeg', 0.88), w: c.width, h: c.height };
}

export async function scriptToPDF(sc: ScriptPdf) {
	const { jsPDF } = await import('jspdf');
	const doc = new jsPDF({ unit: 'pt', format: 'a4' });
	const W = doc.internal.pageSize.getWidth();
	const H = doc.internal.pageSize.getHeight();
	const M = 48;
	const maxW = W - M * 2;
	let y = M;
	const PINK: [number, number, number] = [255, 0, 111];
	const need = (h: number) => {
		if (y + h > H - M) {
			doc.addPage();
			y = M;
		}
	};
	const text = (s: string, size: number, o: { color?: [number, number, number]; bold?: boolean; indent?: number; gap?: number } = {}) => {
		doc.setFont('helvetica', o.bold ? 'bold' : 'normal');
		doc.setFontSize(size);
		doc.setTextColor(...(o.color ?? [0, 0, 0]));
		for (const l of doc.splitTextToSize(pdfSafe(s), maxW - (o.indent ?? 0)) as string[]) {
			need(size * 1.4);
			doc.text(l, M + (o.indent ?? 0), y + size);
			y += size * 1.4;
		}
		y += o.gap ?? 0;
	};

	text(`${sc.client}, ${sc.format}, ${sc.status}`, 9, { color: [128, 128, 128], gap: 4 });
	text(sc.title, 24, { gap: 6 });
	need(10);
	doc.setDrawColor(...PINK);
	doc.setLineWidth(2);
	doc.line(M, y, W - M, y);
	y += 16;

	// corpo: linha toda em negrito vira título de seção; [imagem N] fica em magenta
	const body = plain(sc.body_md.replace(/^\*\*(.+)\*\*\s*$/gm, '§§$1')).split('\n');
	for (const raw of body) {
		const line = raw.trimEnd();
		if (!line.trim()) {
			y += 6;
			continue;
		}
		if (line.startsWith('§§')) {
			y += 6;
			const h = line.slice(2);
			text(h.replace(/\[imagem (\d+)\]/gi, ' [IMAGEM $1]'), 12.5, { bold: true, gap: 2, color: /\[imagem \d+\]/i.test(h) ? PINK : undefined });
		} else if (/\[imagem \d+\]/i.test(line)) {
			text(line.replace(/\[imagem (\d+)\]/gi, '[IMAGEM $1]'), 10.5, { color: PINK });
		} else {
			text(line, 10.5);
		}
	}

	// imagens numeradas, uma por página, inteiras
	for (const [i, im] of sc.images.entries()) {
		try {
			const j = await toJpeg(im.url);
			doc.addPage();
			y = M;
			text(`Imagem ${i + 1}${im.caption ? ` — ${im.caption}` : ''}`, 12, { bold: true, color: PINK, gap: 8 });
			const boxH = H - y - M - 20;
			const r = Math.min(maxW / j.w, boxH / j.h);
			doc.addImage(j.data, 'JPEG', M + (maxW - j.w * r) / 2, y, j.w * r, j.h * r);
		} catch {
			text(`Imagem ${i + 1}: não foi possível incluir (formato não suportado neste navegador).`, 10, { color: [128, 128, 128] });
		}
	}

	const pages = doc.getNumberOfPages();
	for (let i = 1; i <= pages; i++) {
		doc.setPage(i);
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(8);
		doc.setTextColor(128, 128, 128);
		doc.text(`${pdfSafe(sc.client + ', ' + sc.title)}    ${i}/${pages}`, W - M, H - 24, { align: 'right' });
	}
	return doc.output('blob');
}

// ---------- entregar o arquivo ----------
export const fileSlug = (s: string) =>
	s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'export';

/** Compartilhar já com o arquivo pronto (chamar direto no clique) */
export function shareNow(file: File) {
	return navigator.share({ files: [file], title: file.name }).catch(() => {});
}

export async function deliver(blob: Blob, filename: string, share = false) {
	const file = new File([blob], filename, { type: blob.type });
	// compartilhar (WhatsApp etc.) só no celular; no computador, baixa o arquivo
	if (share && matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
		try {
			await navigator.share({ files: [file], title: filename });
			return 'shared';
		} catch (e) {
			if ((e as Error).name === 'AbortError') return 'cancelled';
			// iPhone: compartilhar precisa vir direto de um toque; quem chamou mostra um botão
			if ((e as Error).name === 'NotAllowedError') return 'gesture';
		}
	}
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 10000);
	return 'downloaded';
}

// ---------- importação de .md ----------
// "## Card" → card · "### [ ] Tarefa" (ou "- Tarefa" de 1º nível) → tarefa
// "- [x] item (20%)" logo abaixo de uma tarefa → checklist · resto → descrição
export function parseMarkdown(md: string) {
	type T = { title: string; description_md: string; done: boolean; checklist: { text: string; done: boolean; weight: number | null }[] };
	const lists: { name: string; tasks: T[] }[] = [];
	let list: { name: string; tasks: T[] } | null = null;
	let task: T | null = null;
	let inCode = false;
	const ensureList = () => {
		if (!list) lists.push((list = { name: 'Importados', tasks: [] }));
		return list;
	};
	for (const raw of md.replace(/\r/g, '').split('\n')) {
		const line = raw.trimEnd();
		if (/^```/.test(line.trim())) inCode = !inCode;
		if (!inCode) {
			let m: RegExpMatchArray | null;
			if (/^# /.test(line)) continue; // título do quadro
			if ((m = line.match(/^## +(.+)/))) {
				lists.push((list = { name: m[1].trim(), tasks: [] }));
				task = null;
				continue;
			}
			if ((m = line.match(/^### +(?:\[( |x|X)\] +)?(.+)/))) {
				ensureList().tasks.push((task = { title: m[2].trim(), description_md: '', done: m[1]?.toLowerCase() === 'x', checklist: [] }));
				continue;
			}
			if ((m = line.match(/^ {0,1}[-*] +\[( |x|X)\] +(.+?)(?: \(×([23])\))?(?: — .+)?$/)) && task) {
				task.checklist.push({ text: m[2].trim(), done: m[1].toLowerCase() === 'x', weight: m[3] ? Number(m[3]) : null });
				continue;
			}
			if ((m = line.match(/^[-*] +(?!\[)(.+)/)) && !task) {
				ensureList().tasks.push({ title: m[1].trim(), description_md: '', done: false, checklist: [] });
				continue;
			}
			if (/^_.+_$/.test(line.trim()) && task && !task.description_md) continue; // linha de metadados da exportação
			if (/^Anexos:$/.test(line.trim())) continue;
		}
		if (task) task.description_md += line + '\n';
	}
	for (const l of lists) for (const t of l.tasks) t.description_md = t.description_md.trim();
	return lists.filter((l) => l.tasks.length || l.name !== 'Importados');
}

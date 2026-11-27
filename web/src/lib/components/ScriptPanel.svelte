<script lang="ts" module>
	export const FORMATS = [
		['reels', 'Reels'],
		['carrossel', 'Carrossel'],
		['estatico', 'Post estático'],
		['stories', 'Stories'],
		['outro', 'Outro']
	] as const;
	export const formatName = (f: string) => FORMATS.find((x) => x[0] === f)?.[1] ?? f;
	/** Uma cor por formato, para bater o olho e saber o tipo de postagem */
	export const FORMAT_COLOR: Record<string, string> = {
		reels: '#2b6cff',
		carrossel: '#1f9d55',
		estatico: '#ff7a00',
		stories: '#7c5cff',
		outro: '#808080'
	};
	export const formatColor = (f: string) => FORMAT_COLOR[f] ?? '#808080';
	/** Os mesmos status para tema e roteiro */
	export const STATUS = [
		['ideia', 'ideia'],
		['aprovado', 'aprovado'],
		['roteirizado', 'roteirizado'],
		['design', 'design pronto'],
		['postado', 'postado'],
		['descartado', 'descartado']
	] as const;
	export const statusName = (v: string) => STATUS.find((x) => x[0] === v)?.[1] ?? v;
	export const SCRIPT_STATUS = STATUS;
	export type ClientProfile = {
		name: string;
		handle: string;
		niche: string;
		audience: string;
		voice: string;
		pillars: string;
		dos: string;
		donts: string;
		refs: string;
	};
	/** Perfil do cliente em texto, para os pedidos ao Claude */
	export function profileText(c: ClientProfile) {
		const parts: [string, string][] = [
			['Cliente', `${c.name}${c.handle ? ` (${c.handle})` : ''}`],
			['Nicho', c.niche],
			['Público', c.audience],
			['Tom de voz', c.voice],
			['Pilares de conteúdo', c.pillars.split('\n').filter(Boolean).join('; ')],
			['Fazer / usar', c.dos],
			['Evitar', c.donts],
			['Referências', c.refs.split('\n').filter(Boolean).join(' ')]
		];
		return parts
			.filter(([, v]) => v?.trim())
			.map(([k, v]) => `${k}: ${v.trim()}`)
			.join('\n');
	}
	export function claudeLink(q: string) {
		return `https://claude.ai/new?q=${encodeURIComponent(q.length > 7000 ? q.slice(0, 7000) + '…' : q)}`;
	}
</script>

<script lang="ts">
	import { api } from '#lib/api.ts';
	import { fmtLong } from '#lib/model.ts';
	import Destination from './Destination.svelte';

	let {
		id,
		client,
		onclose,
		onchange,
		onopentask
	}: { id: string; client: ClientProfile; onclose: () => void; onchange: () => void; onopentask: (tid: string) => void } = $props();

	type Script = {
		id: string;
		title: string;
		format: string;
		status: string;
		body_md: string;
		theme_title: string | null;
		task_id: string | null;
		updated_at: number;
	};
	type Img = { id: string; caption: string; url: string; mime: string | null };
	let s = $state<Script | null>(null);
	// ---------- Etapas na agenda ----------
	const STEPS = [
		['roteiro', 'criar roteiro'],
		['design', 'enviar ao designer'],
		['publicar', 'publicar']
	] as const;
	let events = $state<Record<string, number>>({});
	let stepBusy = $state('');
	// o que está escolhido no campo e ainda não foi salvo (só vai para a agenda ao tocar em "salvar")
	let drafts = $state<Record<string, string>>({});
	const dirty = (k: string) => drafts[k] !== undefined && drafts[k] !== (events[k] ? toLocal(events[k]) : '');
	const toLocal = (t: number) => {
		const d = new Date(t * 1000);
		const p = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
	};
	async function setStep(kind: string, v: string) {
		if (!v) return;
		const start = Math.floor(new Date(v).getTime() / 1000);
		if (!start) return;
		stepBusy = kind;
		try {
			await api(`/scripts/${id}/events/${kind}`, { method: 'PUT', body: JSON.stringify({ start }) });
			events[kind] = start;
			delete drafts[kind];
			say('na agenda ✓');
		} catch (e) {
			say((e as Error).message);
		} finally {
			stepBusy = '';
		}
	}
	async function removeStep(kind: string) {
		stepBusy = kind;
		try {
			await api(`/scripts/${id}/events/${kind}`, { method: 'DELETE' });
			delete events[kind];
			delete drafts[kind];
			say('tirado da agenda');
		} catch (e) {
			say((e as Error).message);
		} finally {
			stepBusy = '';
		}
	}
	// sugestão de horário: amanhã às 9h
	const tomorrow9 = () => {
		const d = new Date();
		d.setDate(d.getDate() + 1);
		d.setHours(9, 0, 0, 0);
		return toLocal(d.getTime() / 1000);
	};
	let images = $state<Img[]>([]);
	let uploading = $state(0);
	let editorRef = $state<any>(null);
	let pdfBusy = $state(false);
	let pendingPdf = $state<File | null>(null);
	let note = $state('');
	let people = $state<{ id: string; name: string }[]>([]);
	let Editor = $state<any>(null);
	let copied = $state(false);
	let sending = $state(false);
	let confirmDelete = $state(false);
	let saved = $state('');
	import('./Editor.svelte').then((m) => (Editor = m.default));

	$effect(() => {
		Promise.all([api<{ script: Script; images: Img[]; events: { kind: string; start: number }[] }>(`/scripts/${id}`), api<{ people: { id: string; name: string }[] }>('/people')]).then(([a, b]) => {
			s = a.script;
			images = a.images;
			events = Object.fromEntries((a.events ?? []).map((e) => [e.kind, e.start]));
			people = b.people;
		});
	});

	async function save(p: Partial<Script>) {
		if (!s) return;
		Object.assign(s, p);
		saved = 'salvando…';
		await api(`/scripts/${id}`, { method: 'PATCH', body: JSON.stringify(p) });
		saved = 'salvo';
		setTimeout(() => saved === 'salvo' && (saved = ''), 1500);
		onchange();
	}
	let timer: ReturnType<typeof setTimeout>;
	function onBody(md: string) {
		if (!s) return;
		s.body_md = md;
		saved = 'salvando…';
		clearTimeout(timer);
		timer = setTimeout(() => save({ body_md: md }), 800);
	}

	const plain = (md: string) =>
		md
			.replace(/\[([^\]]+)\]\((?:person|task):[^)]+\)/g, '$1')
			.replace(/<\/?(u|mark)[^>]*>/g, '')
			.replace(/^#{1,6} /gm, '')
			.replace(/\*\*([^*]+)\*\*/g, '$1');
	async function copy() {
		if (!s) return;
		await navigator.clipboard.writeText(`${s.title}\n\n${plain(s.body_md)}`);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	const claudePrompt = $derived(
		s
			? (
					`Você é roteirista de conteúdo para Instagram. Escreva (ou melhore, se já houver texto) o roteiro abaixo na voz do cliente. ` +
						`Mantenha a estrutura das seções. Seja específico, com frases prontas para gravar ou para a arte. Responda em português.\n\n` +
						`${profileText(client)}\n\nFormato: ${formatName(s.format)}\nTítulo/tema: ${s.title}\n\nRoteiro atual:\n${plain(s.body_md) || '(vazio)'}`
				)
			: ''
	);
	const claudeUrl = $derived(claudeLink(claudePrompt));
	async function copyPrompt() {
		await navigator.clipboard.writeText(claudePrompt);
		say('pedido copiado: cole no Claude');
	}

	function say(m: string) {
		note = m;
		setTimeout(() => (note = ''), 2500);
	}

	// ---------- Imagens ----------
	async function reloadImages() {
		images = (await api<{ images: Img[] }>(`/scripts/${id}`)).images;
	}
	async function upload(files: Iterable<File>) {
		for (const f of files) {
			if (!f.type.startsWith('image/')) continue;
			if (f.size > 5 * 1024 * 1024) {
				say(`“${f.name}” tem mais de 5 MB`);
				continue;
			}
			uploading++;
			try {
				const fd = new FormData();
				fd.append('file', f, f.name || 'imagem.png');
				await api(`/scripts/${id}/images`, { method: 'POST', body: fd });
			} catch (e) {
				say((e as Error).message);
			} finally {
				uploading--;
			}
		}
		await reloadImages();
		onchange();
	}
	// colar uma imagem em qualquer lugar do painel (⌘V ou "colar" no iPhone)
	function onPaste(e: ClipboardEvent) {
		const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
		if (!files.length) return;
		e.preventDefault();
		upload(files);
	}
	async function pasteButton() {
		try {
			const items = await navigator.clipboard.read();
			const files: File[] = [];
			for (const it of items) {
				const type = it.types.find((t) => t.startsWith('image/'));
				if (type) files.push(new File([await it.getType(type)], `colada.${type.split('/')[1]}`, { type }));
			}
			if (!files.length) return say('Não há imagem copiada.');
			upload(files);
		} catch {
			say('O navegador não deixou ler a área de transferência. Use ⌘V aqui no painel.');
		}
	}
	async function caption(im: Img, v: string) {
		im.caption = v;
		await api(`/script-images/${im.id}`, { method: 'PATCH', body: JSON.stringify({ caption: v }) });
	}
	async function moveImg(i: number, d: number) {
		const j = i + d;
		if (j < 0 || j >= images.length) return;
		const arr = [...images];
		[arr[i], arr[j]] = [arr[j], arr[i]];
		images = arr;
		await Promise.all(arr.map((im, k) => api(`/script-images/${im.id}`, { method: 'PATCH', body: JSON.stringify({ position: k + 1 }) })));
	}
	let confirmImg = $state<string | null>(null);
	async function delImg(im: Img) {
		if (confirmImg !== im.id) {
			confirmImg = im.id;
			setTimeout(() => (confirmImg = null), 3000);
			return;
		}
		images = images.filter((x) => x.id !== im.id);
		await api(`/script-images/${im.id}`, { method: 'DELETE' });
	}
	function cite(n: number) {
		editorRef?.insert(` [imagem ${n}] `);
	}

	// ---------- PDF para o designer ----------
	async function pdf() {
		if (!s) return;
		pdfBusy = true;
		try {
			const x = await import('#lib/export.ts');
			const blob = await x.scriptToPDF({
				client: client.name,
				title: s.title,
				format: formatName(s.format),
				status: SCRIPT_STATUS.find((v) => v[0] === s!.status)?.[1] ?? s.status,
				body_md: s.body_md,
				images: images.map((i) => ({ url: i.url, caption: i.caption }))
			});
			const name = `${x.fileSlug(client.name + ' ' + s.title)}.pdf`;
			const r = await x.deliver(blob, name, true);
			if (r === 'gesture') pendingPdf = new File([blob], name, { type: 'application/pdf' });
			if (r === 'downloaded') say('PDF baixado');
		} catch (e) {
			say((e as Error).message);
		} finally {
			pdfBusy = false;
		}
	}

	async function toTask(dest: { board_id?: string; list_id?: string | null }) {
		const r = await api<{ id: string }>(`/scripts/${id}/task`, { method: 'POST', body: JSON.stringify(dest) });
		if (s) s.task_id = r.id;
		sending = false;
		onchange();
		onopentask(r.id);
	}

	async function remove() {
		if (!confirmDelete) {
			confirmDelete = true;
			setTimeout(() => (confirmDelete = false), 4000);
			return;
		}
		await api(`/scripts/${id}`, { method: 'DELETE' });
		onchange();
		onclose();
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} onpaste={onPaste} />
<div class="scrim" onclick={onclose} aria-hidden="true"></div>

<aside class="panel" aria-label="Roteiro">
	<header class="top">
		<span class="meta">{client.name}{s?.theme_title ? ` › ${s.theme_title}` : ''} <span class="saved">{saved}</span></span>
		<button class="btn close" onclick={onclose}>fechar</button>
	</header>

	{#if s}
		<div>
		<textarea
			class="title"
			rows="1"
			value={s.title}
			onchange={(e) => save({ title: e.currentTarget.value.trim() || s!.title })}
			onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
		></textarea>
		</div>

		<div class="row">
			<span class="fdot" style:background={formatColor(s.format)}></span>
			<select value={s.format} onchange={(e) => save({ format: e.currentTarget.value })} aria-label="Formato">
				{#each FORMATS as [v, n] (v)}<option value={v}>{n}</option>{/each}
			</select>
			<span class="seg">
				{#each SCRIPT_STATUS as [v, n] (v)}
					<button class:on={s.status === v} onclick={() => save({ status: v })}>{n}</button>
				{/each}
			</span>
		</div>

		<section class="steps" aria-label="Agenda">
			<p class="meta">Cada data vira um evento no calendário πύλη, com aviso 1 h antes.</p>
			{#each STEPS as [k, n] (k)}
				<div class="step" class:set={!!events[k]}>
					<span class="label">{n}</span>
					<input
						type="datetime-local"
						class="when"
						value={drafts[k] ?? (events[k] ? toLocal(events[k]) : '')}
						onfocus={(e) => !e.currentTarget.value && (drafts[k] = e.currentTarget.value = tomorrow9())}
						oninput={(e) => (drafts[k] = e.currentTarget.value)}
						onchange={(e) => (drafts[k] = e.currentTarget.value)}
						disabled={stepBusy === k}
						aria-label="Data: {n}"
					/>
					{#if stepBusy === k}<span class="meta">…</span>
					{:else if dirty(k) && drafts[k]}<button class="save" onclick={() => setStep(k, drafts[k])}>salvar</button>
					{:else if dirty(k)}<button class="link" onclick={() => delete drafts[k]}>desfazer</button>
					{:else if events[k]}<button class="link" onclick={() => removeStep(k)}>tirar</button>
					{:else}<span class="meta">—</span>{/if}
				</div>
			{/each}
		</section>

		<nav class="actions">
			<button onclick={copy}>{copied ? 'copiado ✓' : 'copiar texto'}</button>
			<button onclick={pdf} disabled={pdfBusy}>{pdfBusy ? 'gerando…' : 'PDF p/ designer'}</button>
			<a href={claudeUrl} target="_blank" rel="noopener">escrever com o Claude ↗</a>
			<button onclick={copyPrompt}>copiar pedido p/ Claude</button>
			{#if s.task_id}
				<button onclick={() => onopentask(s!.task_id!)}>ver lembrete</button>
			{:else}
				<button onclick={() => (sending = !sending)} class:on={sending}>criar lembrete</button>
			{/if}
		</nav>

		{#if pendingPdf}
			<div class="box dest">
				<span class="label">PDF pronto.</span>
				<button class="btn" onclick={() => { const f = pendingPdf!; pendingPdf = null; navigator.share({ files: [f], title: f.name }).catch(() => {}); }}>enviar PDF</button>
			</div>
		{/if}

		{#if sending}
			<div class="box dest">
				<p class="label">Cria uma tarefa só como lembrete, com o link para este roteiro. O texto continua só aqui: editar a tarefa não muda o roteiro.</p>
				<button class="btn" onclick={() => toTask({})}>no inbox</button>
				<p class="meta">ou direto num quadro:</p>
				<Destination label="criar aqui" onconfirm={toTask} oncancel={() => (sending = false)} />
			</div>
		{/if}

		{#if Editor}
			<Editor bind:this={editorRef} value={s.body_md} {people} onchange={onBody} onpeople={(p: { id: string; name: string }) => (people = [...people, p])} onopentask={onopentask} />
		{:else}
			<p class="meta">carregando editor…</p>
		{/if}

		<section class="imgs">
			<div class="ihead">
				<span class="label">imagens {#if images.length}<span class="meta">{images.length}</span>{/if}</span>
				<span class="iact">
					<label class="link">+ arquivo<input type="file" accept="image/*" multiple hidden onchange={(e) => (upload([...(e.currentTarget.files ?? [])]), (e.currentTarget.value = ''))} /></label>
					<button class="link" onclick={pasteButton}>colar imagem</button>
				</span>
			</div>
			<p class="meta">Cole (⌘V) ou envie imagens. Para citar no texto, toque em “citar”: entra <b>[imagem N]</b> onde está o cursor.{uploading ? ` Enviando ${uploading}…` : ''}</p>
			{#if images.length}
				<ol class="gallery">
					{#each images as im, i (im.id)}
						<li>
							<span class="n">Imagem {i + 1}</span>
							<a href={im.url} target="_blank" rel="noopener" class="ph"><img src={im.url} alt="Imagem {i + 1}" loading="lazy" /></a>
							<input class="cap" placeholder="legenda (ex.: slide 2)" value={im.caption} onchange={(e) => caption(im, e.currentTarget.value)} />
							<span class="ibtn">
								<button onclick={() => cite(i + 1)}>citar</button>
								<button onclick={() => moveImg(i, -1)} disabled={i === 0} aria-label="Antes">←</button>
								<button onclick={() => moveImg(i, 1)} disabled={i === images.length - 1} aria-label="Depois">→</button>
								<button class="del" onclick={() => delImg(im)}>{confirmImg === im.id ? 'ok?' : '×'}</button>
							</span>
						</li>
					{/each}
				</ol>
			{/if}
		</section>

		<footer>
			<span class="meta">editado {fmtLong(s.updated_at)}</span>
			<button class="btn danger" onclick={remove}>{confirmDelete ? 'toque de novo para apagar' : 'apagar roteiro'}</button>
		</footer>
	{:else}
		<p class="meta">carregando…</p>
	{/if}
	{#if note}<p class="flash" role="status">{note}</p>{/if}
</aside>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: var(--scrim);
		z-index: 10;
	}
	.panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: min(720px, 100vw);
		background: var(--white);
		border-left: var(--rule);
		z-index: 11;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0 var(--gutter) calc(var(--gutter) * 3);
		display: grid;
		align-content: start;
		gap: 16px;
	}
	.top {
		position: sticky;
		top: 0;
		z-index: 3;
		background: var(--white);
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 18px 0 12px;
		border-bottom: var(--rule);
	}
	.saved {
		margin-left: 8px;
	}
	.btn.close {
		background: var(--black);
		border-color: var(--black);
		color: var(--white);
		padding: 8px 18px;
		flex: none;
	}
	.title {
		font-size: var(--t-lg);
		line-height: 1.15;
		border: 0;
		resize: none;
		field-sizing: content;
		min-height: 1.2em;
		flex: none;
		padding: 0;
		outline: none;
		background: none;
		width: 100%;
	}
	.title:focus {
		box-shadow: 0 2px 0 var(--accent);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
	}
	select {
		border: var(--rule);
		border-radius: 0;
		background: var(--white);
		padding: 7px 8px;
		font-size: var(--t-sm);
	}
	.seg {
		display: flex;
		flex-wrap: wrap;
	}
	.fdot {
		width: 12px;
		height: 12px;
		flex: none;
		align-self: center;
	}
	.steps {
		display: grid;
		border-top: var(--rule);
		padding-top: 8px;
		gap: 2px;
	}
	.step {
		display: grid;
		grid-template-columns: 150px 1fr 72px;
		gap: 10px;
		align-items: center;
		padding: 4px 0;
		border-bottom: var(--rule-soft);
	}
	.step.set .label::before {
		content: '● ';
		color: var(--accent);
	}
	.when {
		border: 0;
		background: transparent;
		padding: 6px 0;
		min-width: 0;
		font-family: var(--mono);
		font-size: var(--t-sm);
	}
	.save {
		background: var(--accent);
		border: 0;
		color: #fff;
		padding: 6px 10px;
		font-size: var(--t-sm);
		cursor: pointer;
	}
	.step .link {
		background: none;
		border: 0;
		padding: 0;
		text-decoration: underline;
		cursor: pointer;
		font-size: var(--t-sm);
	}
	.seg button {
		border: var(--rule);
		margin-left: -1px;
		background: var(--white);
		padding: 6px 10px;
		font-size: var(--t-sm);
		cursor: pointer;
	}
	.seg button:first-child {
		margin-left: 0;
	}
	.seg button.on {
		background: var(--black);
		color: var(--white);
	}
	.actions {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		border-top: var(--rule);
		border-left: var(--rule);
	}
	.actions > * {
		border: 0;
		border-right: var(--rule);
		border-bottom: var(--rule);
		background: var(--white);
		padding: 11px 6px;
		text-align: center;
		font-size: var(--t-sm);
		cursor: pointer;
		text-decoration: none;
		color: var(--black);
	}
	.actions .on {
		background: var(--black);
		color: var(--white);
	}
	@media (hover: hover) {
		.actions > *:hover {
			background: var(--black);
			color: var(--white);
		}
	}
	.dest {
		padding: 12px;
		display: grid;
		gap: 8px;
		justify-items: start;
	}
	.imgs {
		border-top: var(--rule);
		padding-top: 12px;
		display: grid;
		gap: 8px;
	}
	.ihead {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.iact {
		display: flex;
		gap: 16px;
	}
	.link {
		background: none;
		border: 0;
		padding: 0;
		font-size: var(--t-sm);
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
		color: var(--black);
	}
	.gallery {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		border-top: var(--rule);
		border-left: var(--rule);
	}
	.gallery li {
		display: grid;
		gap: 6px;
		padding: 8px;
		border-right: var(--rule);
		border-bottom: var(--rule);
		align-content: start;
	}
	.n {
		font: 700 var(--t-xs) var(--mono);
		color: var(--accent);
	}
	.ph {
		display: grid;
		place-items: center;
		aspect-ratio: 1;
		background: var(--code-bg);
	}
	.ph img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain; /* imagem inteira, sem corte */
	}
	.cap {
		border: 0;
		border-bottom: 1px solid var(--grey-light);
		background: none;
		font-size: var(--t-xs);
		padding: 4px 0;
		outline: none;
		min-width: 0;
	}
	.ibtn {
		display: flex;
		gap: 4px;
	}
	.ibtn button {
		border: 1px solid var(--grey-light);
		background: none;
		padding: 3px 7px;
		font-size: var(--t-xs);
		cursor: pointer;
	}
	.ibtn button:first-child {
		flex: 1;
		border-color: var(--black);
	}
	.ibtn button:disabled {
		opacity: 0.3;
	}
	.ibtn .del:hover {
		color: var(--accent);
	}
	.flash {
		position: sticky;
		bottom: 16px;
		justify-self: center;
		background: var(--black);
		color: var(--white);
		padding: 10px 16px;
		font-size: var(--t-sm);
	}
	footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-top: var(--rule-soft);
		padding-top: 12px;
	}
	.btn.danger:hover {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	@media (max-width: 600px) {
		.panel {
			border-left: 0;
		}
		.actions {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>

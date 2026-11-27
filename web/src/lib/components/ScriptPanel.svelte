<script lang="ts" module>
	export const FORMATS = [
		['reels', 'Reels'],
		['carrossel', 'Carrossel'],
		['estatico', 'Post estático'],
		['stories', 'Stories'],
		['outro', 'Outro']
	] as const;
	export const formatName = (f: string) => FORMATS.find((x) => x[0] === f)?.[1] ?? f;
	export const SCRIPT_STATUS = [
		['rascunho', 'rascunho'],
		['revisao', 'em revisão'],
		['aprovado', 'aprovado'],
		['postado', 'postado']
	] as const;
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
	let s = $state<Script | null>(null);
	let people = $state<{ id: string; name: string }[]>([]);
	let Editor = $state<any>(null);
	let copied = $state(false);
	let sending = $state(false);
	let confirmDelete = $state(false);
	let saved = $state('');
	import('./Editor.svelte').then((m) => (Editor = m.default));

	$effect(() => {
		Promise.all([api<{ script: Script }>(`/scripts/${id}`), api<{ people: { id: string; name: string }[] }>('/people')]).then(([a, b]) => {
			s = a.script;
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

	const claudeUrl = $derived(
		s
			? claudeLink(
					`Você é roteirista de conteúdo para Instagram. Escreva (ou melhore, se já houver texto) o roteiro abaixo na voz do cliente. ` +
						`Mantenha a estrutura das seções. Seja específico, com frases prontas para gravar ou para a arte. Responda em português.\n\n` +
						`${profileText(client)}\n\nFormato: ${formatName(s.format)}\nTítulo/tema: ${s.title}\n\nRoteiro atual:\n${plain(s.body_md) || '(vazio)'}`
				)
			: ''
	);

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

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />
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
			<select value={s.format} onchange={(e) => save({ format: e.currentTarget.value })} aria-label="Formato">
				{#each FORMATS as [v, n] (v)}<option value={v}>{n}</option>{/each}
			</select>
			<span class="seg">
				{#each SCRIPT_STATUS as [v, n] (v)}
					<button class:on={s.status === v} onclick={() => save({ status: v })}>{n}</button>
				{/each}
			</span>
		</div>

		<nav class="actions">
			<button onclick={copy}>{copied ? 'copiado ✓' : 'copiar texto'}</button>
			<a href={claudeUrl} target="_blank" rel="noopener">escrever com o Claude ↗</a>
			{#if s.task_id}
				<button onclick={() => onopentask(s!.task_id!)}>ver tarefa</button>
			{:else}
				<button onclick={() => (sending = !sending)} class:on={sending}>virar tarefa</button>
			{/if}
		</nav>

		{#if sending}
			<div class="box dest">
				<p class="label">Criar tarefa com este roteiro na descrição:</p>
				<button class="btn" onclick={() => toTask({})}>no inbox</button>
				<p class="meta">ou direto num quadro:</p>
				<Destination label="criar aqui" onconfirm={toTask} oncancel={() => (sending = false)} />
			</div>
		{/if}

		{#if Editor}
			<Editor value={s.body_md} {people} onchange={onBody} onpeople={(p: { id: string; name: string }) => (people = [...people, p])} onopentask={onopentask} />
		{:else}
			<p class="meta">carregando editor…</p>
		{/if}

		<footer>
			<span class="meta">editado {fmtLong(s.updated_at)}</span>
			<button class="btn danger" onclick={remove}>{confirmDelete ? 'toque de novo para apagar' : 'apagar roteiro'}</button>
		</footer>
	{:else}
		<p class="meta">carregando…</p>
	{/if}
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
		grid-template-columns: repeat(3, 1fr);
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
	}
</style>

<script lang="ts">
	import { api } from '#lib/api.ts';
	import {
		CARD_COLORS,
		LABEL_COLORS,
		PRIORITY_LABEL,
		fmtLong,
		fromInput,
		isLate,
		toInput,
		type Label,
		type Priority,
		type Task
	} from '#lib/model.ts';

	let { id, onclose, onchange }: { id: string; onclose: () => void; onchange: () => void } = $props();

	type Placement = { id: string; board_name: string; list_name: string | null };
	type History = { id: number; at: number; field: string; old_value: string | null; new_value: string | null };

	let task = $state<Task | null>(null);
	let placements = $state<Placement[]>([]);
	let history = $state<History[]>([]);
	let labels = $state<Label[]>([]);
	let error = $state('');
	let confirmDelete = $state(false);
	let copied = $state(false);
	let newLabel = $state('');
	let newLabelColor = $state(LABEL_COLORS[0]);
	let showHistory = $state(false);

	async function load() {
		try {
			const [t, l] = await Promise.all([
				api<{ task: Task; placements: Placement[]; history: History[] }>(`/tasks/${id}`),
				api<{ labels: Label[] }>('/labels')
			]);
			task = t.task;
			placements = t.placements;
			history = t.history;
			labels = l.labels;
		} catch (e) {
			error = (e as Error).message;
		}
	}

	$effect(() => {
		id;
		load();
	});

	async function save(patch: Partial<Task>) {
		if (!task) return;
		Object.assign(task, patch);
		try {
			await api(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
			onchange();
			const t = await api<{ history: History[] }>(`/tasks/${id}`);
			history = t.history;
		} catch (e) {
			error = (e as Error).message;
		}
	}

	let descTimer: ReturnType<typeof setTimeout>;
	function onDesc(v: string) {
		if (!task) return;
		task.description_md = v;
		clearTimeout(descTimer);
		descTimer = setTimeout(() => save({ description_md: v }), 700);
	}

	async function toggleDone() {
		if (!task) return;
		await api(`/tasks/${id}/${task.done_at ? 'undone' : 'done'}`, { method: 'POST' });
		await load();
		onchange();
	}

	function toggleLabel(lid: string) {
		if (!task) return;
		const next = task.labels.includes(lid) ? task.labels.filter((x) => x !== lid) : [...task.labels, lid];
		save({ labels: next });
	}

	async function createLabel(e: SubmitEvent) {
		e.preventDefault();
		if (!newLabel.trim() || !task) return;
		const { id: lid } = await api<{ id: string }>('/labels', {
			method: 'POST',
			body: JSON.stringify({ name: newLabel, color: newLabelColor })
		});
		labels = [...labels, { id: lid, name: newLabel.trim(), color: newLabelColor }];
		newLabel = '';
		toggleLabel(lid);
	}

	async function remove() {
		if (!confirmDelete) {
			confirmDelete = true;
			setTimeout(() => (confirmDelete = false), 4000);
			return;
		}
		await api(`/tasks/${id}`, { method: 'DELETE' });
		onchange();
		onclose();
	}

	async function copyDesc() {
		if (!task) return;
		await navigator.clipboard.writeText(task.description_md);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	const FIELD_NAME: Record<string, string> = {
		title: 'título',
		description_md: 'descrição',
		start_at: 'início',
		due_at: 'prazo',
		priority: 'prioridade',
		color: 'cor',
		done_at: 'concluída'
	};
	function histValue(field: string, v: string | null) {
		if (v == null || v === '') return '—';
		if ((field === 'start_at' || field === 'due_at' || field === 'done_at') && /^\d+$/.test(v)) return fmtLong(Number(v));
		if (field === 'priority') return PRIORITY_LABEL[v as Exclude<Priority, null>] ?? v;
		if (field === 'description_md') return v.length > 40 ? v.slice(0, 40) + '…' : v;
		return v;
	}

	function onkey(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={onkey} />

<div class="scrim" onclick={onclose} aria-hidden="true"></div>

<aside class="panel" aria-label="Tarefa">
	<header class="top">
		<span class="meta">
			{#if placements.length}
				{placements.map((p) => `${p.board_name}${p.list_name ? ' › ' + p.list_name : ''}`).join('  ·  ')}
			{:else}
				inbox
			{/if}
		</span>
		<button class="x" onclick={onclose} aria-label="Fechar">fechar</button>
	</header>

	{#if error}<p class="err">{error}</p>{/if}

	{#if task}
		<div class="titlerow">
			<button class="btn" class:primary={!task.done_at} onclick={toggleDone}>
				{task.done_at ? 'reabrir' : 'concluir'}
			</button>
			<textarea
				class="title"
				rows="1"
				value={task.title}
				onchange={(e) => save({ title: e.currentTarget.value.trim() || task!.title })}
				onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
			></textarea>
		</div>
		{#if task.done_at}<p class="meta">concluída em {fmtLong(task.done_at)}</p>{/if}

		<dl>
			<dt>prioridade</dt>
			<dd class="seg">
				<button class:on={!task.priority} onclick={() => save({ priority: null })}>—</button>
				{#each ['bom', 'preocupante', 'critico'] as const as p (p)}
					<button class="p-{p}" class:on={task.priority === p} onclick={() => save({ priority: p })}
						>{PRIORITY_LABEL[p]}</button
					>
				{/each}
			</dd>

			<dt>início</dt>
			<dd>
				<input
					class="field"
					type="datetime-local"
					value={toInput(task.start_at)}
					onchange={(e) => save({ start_at: fromInput(e.currentTarget.value) })}
				/>
			</dd>

			<dt>prazo</dt>
			<dd>
				<input
					class="field"
					class:late={isLate(task)}
					type="datetime-local"
					value={toInput(task.due_at)}
					onchange={(e) => save({ due_at: fromInput(e.currentTarget.value) })}
				/>
			</dd>

			<dt>cor</dt>
			<dd class="swatches">
				{#each CARD_COLORS as c (c.name)}
					<button
						class="sw"
						class:on={task.color === c.value}
						style:background={c.value ?? '#fff'}
						onclick={() => save({ color: c.value })}
						aria-label={c.name}
						title={c.name}
					></button>
				{/each}
			</dd>

			<dt>labels</dt>
			<dd>
				<div class="chips">
					{#each labels as l (l.id)}
						<button class="chip" class:on={task.labels.includes(l.id)} style:--c={l.color} onclick={() => toggleLabel(l.id)}
							>{l.name}</button
						>
					{/each}
				</div>
				<form class="newlabel" onsubmit={createLabel}>
					<input class="field" placeholder="nova label" bind:value={newLabel} />
					{#each LABEL_COLORS as c (c)}
						<button
							type="button"
							class="dot"
							class:on={newLabelColor === c}
							style:background={c}
							onclick={() => (newLabelColor = c)}
							aria-label="cor {c}"
						></button>
					{/each}
					<button class="btn" disabled={!newLabel.trim()}>criar</button>
				</form>
			</dd>
		</dl>

		<section class="desc">
			<div class="deschead">
				<span class="label">descrição</span>
				<button class="link" onclick={copyDesc} disabled={!task.description_md}>{copied ? 'copiado ✓' : 'copiar'}</button>
			</div>
			<textarea
				class="area"
				rows="10"
				placeholder="Escreva em markdown. O editor completo (negrito, listas, @menções…) chega na fase 3."
				value={task.description_md}
				oninput={(e) => onDesc(e.currentTarget.value)}
			></textarea>
		</section>

		<section class="hist">
			<button class="link" onclick={() => (showHistory = !showHistory)}>
				histórico ({history.length}) {showHistory ? '−' : '+'}
			</button>
			{#if showHistory}
				<ol>
					{#each history as h (h.id)}
						<li class="meta">
							<span>{fmtLong(h.at)}</span>
							<span>{FIELD_NAME[h.field] ?? h.field}: {histValue(h.field, h.old_value)} → {histValue(h.field, h.new_value)}</span>
						</li>
					{:else}
						<li class="meta">sem alterações ainda</li>
					{/each}
				</ol>
			{/if}
		</section>

		<footer>
			<button class="btn danger" onclick={remove}>{confirmDelete ? 'clique de novo para excluir' : 'excluir tarefa'}</button>
		</footer>
	{:else if !error}
		<p class="meta">carregando…</p>
	{/if}
</aside>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: rgb(255 255 255 / 0.6);
		z-index: 10;
	}
	.panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: min(560px, 100vw);
		background: var(--white);
		border-left: var(--rule);
		z-index: 11;
		overflow-y: auto;
		padding: 0 var(--gutter) calc(var(--gutter) * 2);
		display: grid;
		align-content: start;
		gap: 18px;
	}
	.top {
		position: sticky;
		top: 0;
		background: var(--white);
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
		padding: 18px 0 12px;
		border-bottom: var(--rule);
	}
	.x,
	.link {
		background: none;
		border: 0;
		padding: 0;
		font-size: var(--t-sm);
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.x:hover,
	.link:hover {
		color: var(--accent);
	}
	.link:disabled {
		opacity: 0.4;
	}
	.titlerow {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 14px;
		align-items: start;
	}
	.title {
		font-size: var(--t-lg);
		line-height: 1.15;
		letter-spacing: -0.01em;
		border: 0;
		resize: none;
		field-sizing: content;
		padding: 0;
		outline: none;
		width: 100%;
	}
	.title:focus {
		box-shadow: 0 2px 0 var(--accent);
	}
	dl {
		display: grid;
		grid-template-columns: 96px 1fr;
		gap: 14px 12px;
		margin: 0;
		padding-top: 14px;
		border-top: var(--rule);
		align-items: center;
	}
	dt {
		font-size: var(--t-sm);
		color: var(--grey);
		align-self: start;
		padding-top: 6px;
	}
	dd {
		margin: 0;
		min-width: 0;
	}
	.field {
		padding: 6px 0;
	}
	.field.late {
		color: var(--accent);
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
	.seg .p-preocupante.on {
		background: var(--white);
		color: var(--accent);
		border-color: var(--accent);
		position: relative;
	}
	.seg .p-critico.on {
		background: var(--accent);
		border-color: var(--accent);
		position: relative;
	}
	.swatches {
		display: flex;
		gap: 6px;
	}
	.sw {
		width: 26px;
		height: 26px;
		border: 1px solid var(--grey);
		cursor: pointer;
		padding: 0;
	}
	.sw.on {
		outline: 2px solid var(--black);
		outline-offset: 2px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 8px;
	}
	.chip {
		font: 400 var(--t-xs) / 1 var(--mono);
		padding: 5px 7px;
		border: 1px solid var(--c);
		color: var(--c);
		background: var(--white);
		cursor: pointer;
	}
	.chip.on {
		background: var(--c);
		color: var(--white);
	}
	.newlabel {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.newlabel .field {
		flex: 1;
		min-width: 80px;
		font-size: var(--t-sm);
	}
	.dot {
		width: 14px;
		height: 14px;
		border: 0;
		padding: 0;
		cursor: pointer;
		flex: none;
	}
	.dot.on {
		outline: 2px solid var(--black);
		outline-offset: 2px;
	}
	.newlabel .btn {
		padding: 5px 10px;
	}
	.desc {
		border-top: var(--rule);
		padding-top: 14px;
		display: grid;
		gap: 8px;
	}
	.deschead {
		display: flex;
		justify-content: space-between;
	}
	.area {
		width: 100%;
		border: var(--rule);
		padding: 10px;
		resize: vertical;
		font: 400 var(--t-sm) / 1.5 var(--mono);
		border-radius: 0;
	}
	.area:focus {
		outline: none;
		border-color: var(--accent);
	}
	.hist {
		border-top: var(--rule-soft);
		padding-top: 12px;
	}
	ol {
		list-style: none;
		padding: 0;
		margin: 10px 0 0;
		display: grid;
		gap: 6px;
	}
	ol li {
		display: grid;
		grid-template-columns: 130px 1fr;
		gap: 8px;
	}
	footer {
		border-top: var(--rule-soft);
		padding-top: 14px;
	}
	.danger:hover {
		background: var(--accent);
		border-color: var(--accent);
	}
	.err {
		color: var(--accent);
	}
	@media (max-width: 600px) {
		.panel {
			border-left: 0;
		}
		dl {
			grid-template-columns: 1fr;
			gap: 4px;
		}
		dt {
			padding-top: 10px;
		}
	}
</style>

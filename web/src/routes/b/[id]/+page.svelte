<script lang="ts" module>
	// Quadros já abertos ficam na memória: trocar de quadro mostra na hora e atualiza por trás
	const cache = new Map<string, any>();
</script>

<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { dndzone, dragHandle, dragHandleZone, type DndEvent } from 'svelte-dnd-action';
	import { api } from '#lib/api.ts';
	import { hscroll } from '#lib/hscroll.ts';
	import { between, isLate, plural, type CardFields, type Label, type List, type Task } from '#lib/model.ts';
	import TaskCard from '#lib/components/TaskCard.svelte';
	import TaskPanel from '#lib/components/TaskPanel.svelte';
	import BoardChecklists from '#lib/components/BoardChecklists.svelte';
	import ExportDialog from '#lib/components/ExportDialog.svelte';

	type Item = Task & { id: string; task_id: string }; // id = placement_id (chave do arrastar)
	type Column = List & { items: Item[] };

	const FIELD_LABELS: Record<keyof CardFields, string> = {
		priority: 'prioridade',
		labels: 'labels',
		due: 'prazo',
		start: 'início',
		description: 'descrição',
		cover: 'capa',
		checklist: 'checklist',
		people: 'membros'
	};

	let board = $state<{ id: string; name: string; card_fields: CardFields } | null>(null);
	let columns = $state<Column[]>([]);
	let loose = $state<Item[]>([]); // tarefas do board sem coluna
	let labels = $state<Label[]>([]);
	let people = $state<{ id: string; name: string }[]>([]);
	// Faixa com todos os quadros, para trocar rápido
	let showExport = $state(false);
	let nameDraft = $state('');
	$effect(() => {
		nameDraft = board?.name ?? '';
	});
	let allBoards = $state<{ id: string; name: string }[]>([]);
	api<{ boards: { id: string; name: string }[] }>('/destinations').then((d) => {
		allBoards = d.boards;
		// pré-carrega os outros quadros quando o navegador estiver livre
		const idle = (window as any).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 600));
		idle(() => {
			for (const b of d.boards) if (!cache.has(b.id)) api(`/boards/${b.id}`).then((x) => cache.set(b.id, x)).catch(() => {});
		});
	});
	let templates = $state<{ id: string; name: string }[]>([]);
	let templateId = $state('');
	let view = $state<'quadro' | 'checklists'>('quadro');
	api<{ templates: { id: string; name: string }[] }>('/templates').then((t) => (templates = t.templates));
	let error = $state('');
	let openTask = $state<string | null>(null);
	let showSettings = $state(false);
	let addingIn = $state<string | null>(null);
	let newTitle = $state('');
	let newColumn = $state('');
	let menuFor = $state<string | null>(null);
	let confirmArchive = $state(false);

	// Zoom out do quadro (como no Trello): colunas estreitas, só títulos. Lembrado neste aparelho.
	// O quadro ocupa a tela até embaixo: dá para rolar para o lado pelo espaço vazio
	let scrollerEl = $state<HTMLElement>();
	let fillH = $state(0);
	function measure() {
		if (!scrollerEl) return;
		const top = scrollerEl.getBoundingClientRect().top + window.scrollY;
		fillH = Math.max(280, window.innerHeight - top);
	}
	$effect(() => {
		scrollerEl;
		showSettings;
		compact;
		measure();
	});

	let compact = $state(localStorage.getItem('pyle.compact') === '1');
	function toggleCompact() {
		compact = !compact;
		localStorage.setItem('pyle.compact', compact ? '1' : '0');
	}

	const bid = $derived(page.params.id!);

	type BoardData = {
		board: { id: string; name: string; card_fields: CardFields };
		lists: List[];
		tasks: Task[];
		labels: Label[];
		people: { id: string; name: string }[];
	};

	function apply(d: BoardData) {
		people = d.people;
		board = d.board;
		labels = d.labels;
		const items = d.tasks.map((t) => ({ ...t, id: t.placement_id!, task_id: t.id }));
		columns = d.lists.map((l) => ({ ...l, items: items.filter((t) => t.list_id === l.id) }));
		loose = items.filter((t) => !t.list_id);
	}

	async function load() {
		const id = bid;
		const cached = cache.get(id);
		if (cached) apply(structuredClone(cached));
		try {
			const d = await api<BoardData>(`/boards/${id}`);
			cache.set(id, d);
			if (id === bid) apply(structuredClone(d));
		} catch (e) {
			error = (e as Error).message;
		}
	}

	$effect(() => {
		bid;
		load();
	});

	// ---------- Arrastar tarefas ----------
	const FLIP = 150;

	function considerTasks(col: Column, e: CustomEvent<DndEvent<Item>>) {
		col.items = e.detail.items;
	}

	async function finalizeTasks(col: Column, e: CustomEvent<DndEvent<Item>>) {
		col.items = e.detail.items;
		const i = col.items.findIndex((t) => t.id === e.detail.info.id);
		if (i === -1) return; // esta é a coluna de origem
		const item = col.items[i];
		const position = between(col.items[i - 1]?.position, col.items[i + 1]?.position);
		item.position = position;
		item.list_id = col.id;
		const r = await api<{ done_at: number | null }>(`/placements/${item.id}`, {
			method: 'PATCH',
			body: JSON.stringify({ list_id: col.id, position })
		});
		item.done_at = r.done_at;
	}

	// ---------- Arrastar colunas ----------
	function considerCols(e: CustomEvent<DndEvent<Column>>) {
		columns = e.detail.items;
	}

	async function finalizeCols(e: CustomEvent<DndEvent<Column>>) {
		columns = e.detail.items;
		const i = columns.findIndex((c) => c.id === e.detail.info.id);
		const position = between(columns[i - 1]?.position, columns[i + 1]?.position);
		columns[i].position = position;
		await api(`/lists/${columns[i].id}`, { method: 'PATCH', body: JSON.stringify({ position }) });
	}

	// ---------- Ações ----------
	async function addTask(col: Column, e: SubmitEvent) {
		e.preventDefault();
		const title = newTitle.trim();
		if (!title && !templateId) return;
		newTitle = '';
		await api('/tasks', {
			method: 'POST',
			body: JSON.stringify({ title, board_id: bid, list_id: col.id, at: 'top', template_id: templateId || undefined })
		});
		await load();
	}

	async function toggle(item: Item) {
		await api(`/tasks/${item.task_id}/${item.done_at ? 'undone' : 'done'}`, { method: 'POST' });
		await load();
	}

	async function addColumn(e: SubmitEvent) {
		e.preventDefault();
		if (!newColumn.trim()) return;
		await api(`/boards/${bid}/lists`, { method: 'POST', body: JSON.stringify({ name: newColumn }) });
		newColumn = '';
		await load();
	}

	async function renameColumn(col: Column, name: string) {
		name = name.trim();
		if (!name || name === col.name) return;
		col.name = name;
		await api(`/lists/${col.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
	}

	async function makeFinal(col: Column) {
		await api(`/lists/${col.id}`, { method: 'PATCH', body: JSON.stringify({ is_final: true }) });
		menuFor = null;
		await load();
	}

	let confirmCol = $state<string | null>(null);
	async function deleteColumn(col: Column) {
		if (confirmCol !== col.id) {
			confirmCol = col.id;
			return;
		}
		await api(`/lists/${col.id}`, { method: 'DELETE' });
		confirmCol = null;
		menuFor = null;
		await load();
	}

	async function renameBoard(name: string) {
		if (!board || !name.trim() || name.trim() === board.name) return;
		board.name = name.trim();
		await api(`/boards/${bid}`, { method: 'PATCH', body: JSON.stringify({ name: board.name }) });
	}

	async function setField(k: keyof CardFields, v: boolean) {
		if (!board) return;
		board.card_fields[k] = v;
		await api(`/boards/${bid}`, { method: 'PATCH', body: JSON.stringify({ card_fields: board.card_fields }) });
	}

	async function archiveBoard() {
		if (!confirmArchive) {
			confirmArchive = true;
			setTimeout(() => (confirmArchive = false), 4000);
			return;
		}
		await api(`/boards/${bid}`, { method: 'DELETE' });
		goto(resolve('/'));
	}

	const counts = (items: Item[]) => {
		const open = items.filter((t) => !t.done_at);
		const late = open.filter(isLate).length;
		return { total: items.length, ok: open.length - late, late };
	};
	const totals = $derived(counts([...columns.flatMap((c) => c.items), ...loose]));
</script>

<svelte:window onresize={measure} />

{#if error}
	<p class="err">{error}</p>
{:else if board}
	<section class="grid head">
		<nav class="titles" aria-label="Quadros" use:hscroll>
			{#each allBoards.length ? allBoards : [board] as b (b.id)}
				{#if b.id === bid}
					<!-- o texto invisível dá a largura exata; o campo fica por cima -->
					<span class="namewrap title-lg">
						<span class="sizer" aria-hidden="true">{nameDraft || ' '}</span>
					<input
						class="title-lg name"
						value={board.name}
						aria-label="Nome do quadro (clique para renomear)"
						aria-current="page"
						oninput={(e) => (nameDraft = e.currentTarget.value)}
						onchange={(e) => renameBoard(e.currentTarget.value)}
						onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
					/>
					</span>
				{:else}
					<a class="title-lg other" href={resolve('/b/[id]', { id: b.id })}>{b.name}</a>
				{/if}
			{/each}
		</nav>
		<div class="stats meta">
			<span>{plural(totals.total, 'tarefa')}</span>
			<span>{totals.ok} no prazo</span>
			<span class:late={totals.late > 0}>{plural(totals.late, 'atrasada')}</span>
			<button class="link" onclick={() => (view = view === 'quadro' ? 'checklists' : 'quadro')} aria-pressed={view === 'checklists'}
				>{view === 'quadro' ? 'checklists' : 'quadro'}</button
			>
			<button class="link" onclick={() => (showExport = true)}>exportar</button>
			<button class="link" onclick={toggleCompact} aria-pressed={compact}>{compact ? 'zoom +' : 'zoom −'}</button>
			<button class="link" onclick={() => (showSettings = !showSettings)} aria-expanded={showSettings}>exibir</button>
		</div>
	</section>

	{#if showSettings}
		<section class="settings">
			<span class="label">mostrar nos cartões:</span>
			{#each Object.entries(FIELD_LABELS) as [k, name] (k)}
				<label class="opt">
					<input
						type="checkbox"
						checked={board.card_fields[k as keyof CardFields]}
						onchange={(e) => setField(k as keyof CardFields, e.currentTarget.checked)}
					/>
					{name}
				</label>
			{/each}
			<button class="link danger" onclick={archiveBoard}>{confirmArchive ? 'clique de novo para arquivar' : 'arquivar quadro'}</button>
		</section>
	{/if}

	{#if view === 'checklists'}
		<BoardChecklists boardId={bid} {people} onopen={(tid) => (openTask = tid)} />
	{:else}
	<div class="scroller" class:compact bind:this={scrollerEl} style:min-height="{fillH}px" use:hscroll>
		<div
			class="columns"
			use:dragHandleZone={{ items: columns, flipDurationMs: FLIP, type: 'column', dropTargetStyle: {} }}
			onconsider={considerCols}
			onfinalize={finalizeCols}
		>
			{#each columns as col (col.id)}
				{@const c = counts(col.items)}
				<section class="col" class:final={!!col.is_final} aria-label={col.name}>
					<header class="colhead">
						<span class="grip" use:dragHandle aria-label="Arrastar coluna {col.name}">⠿</span>
						<input
							class="colname"
							value={col.name}
							aria-label="Nome do card"
							onchange={(e) => renameColumn(col, e.currentTarget.value)}
							onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
						/>
						<button class="more" onclick={() => (menuFor = menuFor === col.id ? null : col.id)} aria-label="Opções">···</button>
					</header>
					<p class="meta counts">
						<span>{plural(c.total, 'tarefa')}</span>
						<span>{c.ok} no prazo</span>
						<span class:late={c.late > 0}>{plural(c.late, 'atrasada')}</span>
						{#if col.is_final}<span>· final</span>{/if}
					</p>

					{#if menuFor === col.id}
						<div class="menu">
							{#if !col.is_final}<button class="link" onclick={() => makeFinal(col)}>marcar como card final</button>{/if}
							<button class="link danger" onclick={() => deleteColumn(col)}
								>{confirmCol === col.id ? 'confirmar: apagar card (tarefas ficam no quadro)' : 'apagar card'}</button
							>
						</div>
					{/if}

					{#if addingIn === col.id}
						<form class="add" onsubmit={(e) => addTask(col, e)}>
							<!-- svelte-ignore a11y_autofocus -->
							<input class="field" placeholder={templateId ? 'título (vazio = usa o do modelo)' : 'título da tarefa'} bind:value={newTitle} autofocus
								onkeydown={(e) => e.key === 'Escape' && (addingIn = null)} />
							<div class="addrow">
								<button class="btn primary" disabled={!newTitle.trim() && !templateId}>adicionar</button>
								{#if templates.length}
									<select class="tpl" bind:value={templateId} aria-label="Modelo">
										<option value="">sem modelo</option>
										{#each templates as t (t.id)}<option value={t.id}>modelo: {t.name}</option>{/each}
									</select>
								{/if}
								<button type="button" class="link" onclick={() => (addingIn = null)}>cancelar</button>
							</div>
						</form>
					{:else}
						<button class="addbtn" onclick={() => ((addingIn = col.id), (newTitle = ''), (templateId = ''))}>+ tarefa</button>
					{/if}

					<div
						class="tasks"
						use:dndzone={{ items: col.items, flipDurationMs: FLIP, type: 'task', dropTargetStyle: {}, delayTouchStart: 180 }}
						onconsider={(e) => considerTasks(col, e)}
						onfinalize={(e) => finalizeTasks(col, e)}
					>
						{#each col.items as item (item.id)}
							<div class="slot">
								<TaskCard
									task={item}
									{labels}
									{people}
									fields={board.card_fields}
									onopen={() => (openTask = item.task_id)}
									ontoggle={() => toggle(item)}
								/>
							</div>
						{/each}
					</div>

				</section>
			{/each}
		</div>

		<form class="col newcol" onsubmit={addColumn}>
			<input class="field" placeholder="+ novo card" bind:value={newColumn} aria-label="Nome do novo card" />
			{#if newColumn.trim()}<button class="btn">criar</button>{/if}
		</form>
	</div>

	{/if}

	{#if view === 'quadro' && loose.length}
		<section class="loose">
			<p class="label">No quadro, sem card ({loose.length})</p>
			<div class="looselist">
				{#each loose as item (item.id)}
					<TaskCard task={item} {labels} {people} fields={board.card_fields} onopen={() => (openTask = item.task_id)} ontoggle={() => toggle(item)} />
				{/each}
			</div>
		</section>
	{/if}
{:else}
	<p class="meta">carregando…</p>
{/if}

{#if showExport}
	<ExportDialog boardId={bid} onclose={() => (showExport = false)} onimported={load} />
{/if}

{#if openTask}
	<TaskPanel id={openTask} onclose={() => (openTask = null)} onchange={load} />
{/if}

<style>
	.head {
		align-items: end;
		padding-bottom: 12px;
		border-bottom: var(--rule);
		margin-bottom: 14px;
	}
	.titles {
		grid-column: 1 / span 7;
		display: flex;
		align-items: baseline;
		gap: 0 0.7em;
		overflow-x: auto;
		white-space: nowrap;
		scrollbar-width: none;
		min-width: 0;
	}
	.titles::-webkit-scrollbar {
		display: none;
	}
	.other {
		color: var(--inactive);
		text-decoration: none;
		flex: none;
	}
	.other:hover {
		color: var(--grey);
	}
	.namewrap {
		position: relative;
		flex: none;
		display: inline-block;
	}
	.sizer {
		visibility: hidden;
		white-space: pre;
	}
	.name {
		position: absolute;
		inset: 0;
		width: 100%;
		color: var(--black);
		font: inherit;
		letter-spacing: inherit;
		border: 0;
		padding: 0;
		background: none;
		outline: none;
		min-width: 0;
	}
	.name:focus {
		box-shadow: 0 2px 0 var(--accent);
	}
	.stats {
		grid-column: 8 / span 5;
		justify-self: end;
		display: flex;
		flex-wrap: wrap;
		gap: 4px 16px;
		align-items: baseline;
	}
	.late {
		color: var(--accent);
	}
	.link {
		background: none;
		border: 0;
		padding: 0;
		font: inherit;
		color: var(--black);
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.link:hover,
	.danger:hover {
		color: var(--accent);
	}
	.settings {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 18px;
		align-items: center;
		padding: 10px 0 14px;
		border-bottom: var(--rule-soft);
		margin-bottom: 14px;
		font-size: var(--t-sm);
	}
	.opt {
		display: flex;
		gap: 6px;
		align-items: center;
		cursor: pointer;
	}
	.opt input {
		accent-color: var(--accent);
	}
	.settings .danger {
		margin-left: auto;
	}

	.scroller {
		display: flex;
		align-items: stretch;
		gap: 12px;
		overflow-x: auto;
		padding-bottom: 16px;
		margin: 0 calc(var(--gutter) * -1);
		padding-left: var(--gutter);
		padding-right: var(--gutter);
		scroll-snap-type: x proximity;
		scroll-padding-left: var(--gutter);
	}
	.columns {
		display: flex;
		align-items: stretch;
		gap: 12px;
	}
	.col {
		flex: none;
		width: 288px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		scroll-snap-align: start;
		outline: none;
	}
	.colhead {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 6px;
		align-items: center;
		border-top: 2px solid var(--black);
		padding-top: 8px;
	}
	.final .colhead {
		border-top-color: var(--accent);
	}
	.grip {
		cursor: grab;
		color: var(--grey);
		font-size: 14px;
		user-select: none;
	}
	.colname {
		font-size: var(--t-md);
		font-weight: 500;
		border: 0;
		padding: 2px 0;
		background: none;
		outline: none;
		min-width: 0;
	}
	.colname:focus {
		box-shadow: 0 1px 0 var(--accent);
	}
	.more {
		background: none;
		border: 0;
		cursor: pointer;
		padding: 0 4px;
		color: var(--grey);
	}
	.more:hover {
		color: var(--black);
	}
	.counts {
		display: flex;
		gap: 10px;
	}
	.menu {
		display: grid;
		gap: 6px;
		padding: 8px 0;
		font-size: var(--t-sm);
		justify-items: start;
	}
	.tasks {
		flex: 1; /* a área de soltar vai até o fim da tela */
		display: grid;
		gap: 6px;
		min-height: 48px;
		align-content: start;
	}
	.addbtn {
		background: none;
		border: 0;
		text-align: left;
		padding: 6px 0;
		color: var(--grey);
		cursor: pointer;
		font-size: var(--t-sm);
	}
	.addbtn:hover {
		color: var(--black);
	}
	.add {
		display: grid;
		gap: 8px;
	}
	.tpl {
		border: 0;
		border-bottom: 1px solid var(--grey-light);
		background: none;
		font-size: var(--t-xs);
		max-width: 130px;
		border-radius: 0;
	}
	.addrow {
		display: flex;
		gap: 14px;
		align-items: center;
		font-size: var(--t-sm);
	}
	.newcol {
		align-self: flex-start;
		border-top: 2px solid var(--grey-light);
		padding-top: 4px;
	}
	.newcol .btn {
		justify-self: start;
	}
	.loose {
		margin-top: 24px;
		border-top: var(--rule);
		padding-top: 12px;
	}
	.looselist {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 8px;
		margin-top: 10px;
	}
	/* Toque longo para arrastar (rolar continua livre) */
	.slot {
		-webkit-touch-callout: none;
		-webkit-user-select: none;
		user-select: none;
	}

	/* ---------- Zoom out ---------- */
	.compact,
	.compact .columns {
		gap: 8px;
	}
	.compact .col {
		width: 176px;
		gap: 4px;
	}
	.compact .colname {
		font-size: var(--t-sm);
		text-overflow: ellipsis;
	}
	.compact .counts span:not(:first-child),
	.compact .addbtn,
	.compact .add {
		display: none;
	}
	.compact .tasks {
		gap: 4px;
		min-height: 32px;
	}
	.compact :global(.card) {
		padding: 6px 8px;
		gap: 6px;
	}
	.compact :global(.card .title) {
		font-size: var(--t-sm);
	}
	.compact :global(.card .cover),
	.compact :global(.card .prog),
	.compact :global(.card .labels),
	.compact :global(.card .excerpt),
	.compact :global(.card .foot) {
		display: none;
	}
	.compact :global(.card .check) {
		width: 14px;
		height: 14px;
	}

	.err {
		color: var(--accent);
	}
	@media (max-width: 720px) {
		.titles,
		.stats {
			grid-column: 1 / -1;
			justify-self: start;
		}
		.col {
			width: 82vw;
		}
		.compact .col {
			width: 37vw;
		}
		.compact .more {
			padding: 0;
		}
	}
</style>

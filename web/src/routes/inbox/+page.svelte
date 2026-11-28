<script lang="ts">
	import PageBg from '#lib/components/PageBg.svelte';
	import { api } from '#lib/api.ts';
	import { fmtShort, type Task } from '#lib/model.ts';
	import Doodle from '#lib/components/Doodle.svelte';
	import TaskPanel from '#lib/components/TaskPanel.svelte';

	type Dest = { id: string; name: string; lists: { id: string; name: string }[] };

	let tasks = $state<Task[]>([]);
	let dests = $state<Dest[]>([]);
	let selected = $state<string[]>([]);
	let title = $state('');
	let boardId = $state('');
	let listId = $state('');
	let openTask = $state<string | null>(null);
	let busy = $state(false);
	let error = $state('');
	let flash = $state('');

	async function load() {
		try {
			const [i, d] = await Promise.all([api<{ tasks: Task[] }>('/inbox'), api<{ boards: Dest[] }>('/destinations')]);
			tasks = i.tasks;
			dests = d.boards;
			selected = selected.filter((id) => tasks.some((t) => t.id === id));
		} catch (e) {
			error = (e as Error).message;
		}
	}
	load();

	const board = $derived(dests.find((b) => b.id === boardId));
	const allSelected = $derived(tasks.length > 0 && selected.length === tasks.length);

	async function add(e: SubmitEvent) {
		e.preventDefault();
		const t = title.trim();
		if (!t) return;
		title = '';
		await api('/tasks', { method: 'POST', body: JSON.stringify({ title: t }) });
		await load();
	}

	function toggleAll() {
		selected = allSelected ? [] : tasks.map((t) => t.id);
	}

	async function assign() {
		if (!selected.length || !boardId) return;
		busy = true;
		try {
			await api('/inbox/assign', {
				method: 'POST',
				body: JSON.stringify({ task_ids: selected, board_id: boardId, list_id: listId || null })
			});
			const n = selected.length;
			const where = board!.name + (listId ? ' › ' + board!.lists.find((l) => l.id === listId)!.name : '');
			flash = `${n} ${n === 1 ? 'tarefa enviada' : 'tarefas enviadas'} para ${where}`;
			setTimeout(() => (flash = ''), 3000);
			selected = [];
			await load();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<PageBg kind="menta" />

<section class="grid head">
	<h1 class="title-lg">Inbox</h1>
	<p class="meta right">{tasks.length} sem destino</p>
</section>

<form class="quick" onsubmit={add}>
	<input class="field big" placeholder="Escreva uma tarefa e aperte Enter" bind:value={title} aria-label="Nova tarefa" />
</form>

{#if error}<p class="err">{error}</p>{/if}

{#if tasks.length}
	<div class="bar" class:active={selected.length > 0}>
		<label class="opt">
			<input type="checkbox" checked={allSelected} onchange={toggleAll} />
			<span class="meta">{selected.length ? `${selected.length} selecionada(s)` : 'selecionar todas'}</span>
		</label>
		<div class="send">
			<select bind:value={boardId} onchange={() => (listId = '')} aria-label="Quadro">
				<option value="">quadro…</option>
				{#each dests as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
			</select>
			<select bind:value={listId} disabled={!board} aria-label="Card">
				<option value="">só o quadro</option>
				{#each board?.lists ?? [] as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
			</select>
			<button class="btn primary" disabled={!selected.length || !boardId || busy} onclick={assign}>enviar</button>
		</div>
	</div>

	<ul class="list">
		{#each tasks as t (t.id)}
			<li class:sel={selected.includes(t.id)}>
				<input type="checkbox" bind:group={selected} value={t.id} aria-label="Selecionar {t.title}" />
				<button class="t" onclick={() => (openTask = t.id)}>{t.title}</button>
				<span class="meta">{fmtShort(t.due_at) || fmtShort(t.created_at)}</span>
			</li>
		{/each}
	</ul>
{:else if !error}
	<div class="empty">
		<Doodle name="inbox" size={56} />
		<p class="label">Inbox vazio. Tarefas escritas aqui ficam esperando até você decidir para onde vão.</p>
	</div>
{/if}

{#if flash}<p class="flash" role="status">{flash}</p>{/if}

{#if openTask}
	<TaskPanel id={openTask} onclose={() => (openTask = null)} onchange={load} />
{/if}

<style>
	.head {
		align-items: end;
		padding-bottom: 12px;
		border-bottom: var(--rule);
	}
	.head h1 {
		grid-column: 1 / span 8;
	}
	.right {
		grid-column: 9 / span 4;
		justify-self: end;
	}
	.quick {
		margin: 8px 0 24px;
	}
	.big {
		font-size: var(--t-lg);
		padding: 16px 0;
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 10px;
		align-items: center;
		padding: 10px 0;
		border-bottom: var(--rule);
		position: sticky;
		top: 0;
		background: var(--white);
		z-index: 2;
	}
	.bar.active {
		border-bottom-color: var(--accent);
	}
	.opt {
		display: flex;
		gap: 8px;
		align-items: center;
		cursor: pointer;
	}
	input[type='checkbox'] {
		accent-color: var(--accent);
		width: 16px;
		height: 16px;
	}
	.send {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	select {
		border: var(--rule);
		border-radius: 0;
		background: var(--white);
		padding: 9px 10px;
		font-size: var(--t-sm);
		max-width: 220px;
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.list li {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 14px;
		align-items: center;
		padding: 12px 0;
		border-bottom: var(--rule-soft);
	}
	.list li.sel {
		background: linear-gradient(90deg, var(--select-bg), transparent 70%);
	}
	.t {
		background: none;
		border: 0;
		padding: 0;
		text-align: left;
		cursor: pointer;
		font-size: var(--t-md);
	}
	.t:hover {
		text-decoration: underline;
		text-decoration-color: var(--accent);
		text-underline-offset: 3px;
	}
	.empty {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 20px;
		align-items: center;
		color: var(--grey);
		max-width: 560px;
	}
	.flash {
		position: fixed;
		left: 50%;
		bottom: 24px;
		transform: translateX(-50%);
		background: var(--black);
		color: var(--white);
		padding: 10px 16px;
		font-size: var(--t-sm);
	}
	.err {
		color: var(--accent);
	}
	/* sobre o degradê de fundo: a entrada, a barra e a lista ficam em blocos lisos */
	.quick,
	.bar,
	.list,
	.empty {
		background: var(--white);
		padding-inline: 14px;
	}
	.empty {
		padding-block: 14px;
	}
	.head .meta {
		color: var(--black); /* sobre o degradê o cinza some */
	}
</style>

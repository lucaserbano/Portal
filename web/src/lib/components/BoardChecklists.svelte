<script lang="ts">
	// Todos os checklists do quadro num lugar só, separados por card e tarefa
	import { api } from '#lib/api.ts';
	import { pct } from './Checklist.svelte';

	type Row = {
		id: string;
		task_id: string;
		task_title: string;
		task_done: number | null;
		list_id: string | null;
		list_name: string | null;
		text: string;
		weight: number | null;
		done: number;
		person_id: string | null;
	};

	let { boardId, people, onopen }: { boardId: string; people: { id: string; name: string }[]; onopen: (taskId: string) => void } = $props();

	let rows = $state<Row[]>([]);
	let loaded = $state(false);
	let hideDone = $state(false);

	async function load() {
		rows = (await api<{ items: Row[] }>(`/boards/${boardId}/checklists`)).items;
		loaded = true;
	}
	$effect(() => {
		boardId;
		load();
	});

	// card → tarefa → itens (mantém a ordem do quadro)
	const groups = $derived.by(() => {
		const out: { list: string; tasks: { id: string; title: string; done: boolean; items: Row[] }[] }[] = [];
		for (const r of rows) {
			const list = r.list_name ?? 'sem card';
			let g = out.find((x) => x.list === list);
			if (!g) out.push((g = { list, tasks: [] }));
			let t = g.tasks.find((x) => x.id === r.task_id);
			if (!t) g.tasks.push((t = { id: r.task_id, title: r.task_title, done: !!r.task_done, items: [] }));
			t.items.push(r);
		}
		return out;
	});

	async function toggle(r: Row) {
		r.done = r.done ? 0 : 1;
		await api(`/checklist/${r.id}`, { method: 'PATCH', body: JSON.stringify({ done: r.done }) });
	}
	const who = (id: string | null) => people.find((p) => p.id === id)?.name;
	const totals = $derived({ done: rows.filter((r) => r.done).length, total: rows.length });
</script>

<div class="top">
	<p class="meta">{totals.done}/{totals.total} itens feitos</p>
	<label class="opt"><input type="checkbox" bind:checked={hideDone} /> esconder feitos</label>
</div>

{#if loaded && !rows.length}
	<p class="label empty">Nenhuma tarefa deste quadro tem checklist ainda.</p>
{/if}

<div class="cols">
	{#each groups as g (g.list)}
		<section class="group">
			<h2 class="gname">{g.list}</h2>
			{#each g.tasks as t (t.id)}
				{@const p = pct(t.items)}
				<article class="task">
					<header>
						<button class="tt" class:done={t.done} onclick={() => onopen(t.id)}>{t.title}</button>
						<span class="meta" class:full={p === 100}>{t.items.filter((i) => i.done).length}/{t.items.length}</span>
					</header>
					<div class="track"><span style:width="{p}%"></span></div>
					<ul>
						{#each t.items.filter((i) => !hideDone || !i.done) as r (r.id)}
							<li class:done={!!r.done}>
								<label>
									<input type="checkbox" checked={!!r.done} onchange={() => toggle(r)} />
									<span>{r.text}</span>
								</label>
								<span class="meta">{who(r.person_id) ?? ''}{r.weight === 2 || r.weight === 3 ? ` ×${r.weight}` : ''}</span>
							</li>
						{/each}
					</ul>
				</article>
			{/each}
		</section>
	{/each}
</div>

<style>
	.top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 14px;
		font-size: var(--t-sm);
	}
	.opt {
		display: flex;
		gap: 6px;
		align-items: center;
		cursor: pointer;
	}
	input[type='checkbox'] {
		accent-color: var(--accent);
	}
	.empty {
		color: var(--grey);
	}
	.cols {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: var(--gutter);
		align-items: start;
	}
	.group {
		border-top: 2px solid var(--black);
		padding-top: 8px;
		display: grid;
		gap: 12px;
	}
	.gname {
		font-size: var(--t-md);
		font-weight: 500;
	}
	.task {
		border: var(--rule);
		padding: 10px 12px;
		display: grid;
		gap: 8px;
	}
	header {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		align-items: baseline;
	}
	.tt {
		background: none;
		border: 0;
		padding: 0;
		text-align: left;
		cursor: pointer;
		font-size: var(--t-md);
	}
	.tt:hover {
		text-decoration: underline;
		text-decoration-color: var(--accent);
	}
	.tt.done {
		text-decoration: line-through;
		color: var(--grey);
	}
	.full {
		color: var(--accent);
	}
	.track {
		height: 3px;
		background: var(--grey-light);
	}
	.track span {
		display: block;
		height: 100%;
		background: var(--accent);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}
	li {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		font-size: var(--t-sm);
	}
	li label {
		display: flex;
		gap: 8px;
		align-items: baseline;
		cursor: pointer;
	}
	li.done span:not(.meta) {
		text-decoration: line-through;
		color: var(--grey);
	}
</style>

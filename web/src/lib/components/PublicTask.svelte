<script lang="ts" module>
	export type PubTask = {
		title: string;
		stage: string | null;
		due_at: number | null;
		done_at: number | null;
		updated_at: number;
		progress: { done: number; total: number; pct: number } | null;
		checklist: { text: string; done: boolean }[];
		description: string | null;
	};
</script>

<script lang="ts">
	// Andamento de uma tarefa, como o cliente vê
	let { task, big = false }: { task: PubTask; big?: boolean } = $props();
	const fmt = (t: number, time = true) =>
		new Date(t * 1000).toLocaleString('pt-BR', { day: 'numeric', month: 'long', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) });
	const done = $derived(task.checklist.filter((i) => i.done));
	const todo = $derived(task.checklist.filter((i) => !i.done));
	const pct = $derived(task.done_at ? 100 : (task.progress?.pct ?? 0));
</script>

<article class="pt" class:big>
	<header>
		{#if big}<h1 class="title-xl">{task.title}</h1>{:else}<h2 class="title-lg">{task.title}</h2>{/if}
		<p class="meta">
			{#if task.stage}<span class="stage" class:fin={!!task.done_at}>{task.stage}</span>{/if}
			{#if task.done_at}<span>concluída em {fmt(task.done_at, false)}</span>
			{:else if task.due_at}<span>previsão: {fmt(task.due_at)}</span>{/if}
		</p>
	</header>

	{#if task.progress || task.done_at}
		<div class="prog">
			<div class="bar" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100"><span style:width="{pct}%"></span></div>
			<span class="pct">{pct}%</span>
		</div>
	{/if}

	{#if task.description}<p class="desc">{task.description}</p>{/if}

	{#if task.checklist.length}
		<div class="cols">
			<section>
				<h3 class="label">feito <span class="meta">{done.length}</span></h3>
				<ul>
					{#each done as i, k (k)}<li class="ok"><span class="mk">✓</span>{i.text}</li>{:else}<li class="meta">nada ainda</li>{/each}
				</ul>
			</section>
			<section>
				<h3 class="label">falta <span class="meta">{todo.length}</span></h3>
				<ul>
					{#each todo as i, k (k)}<li><span class="mk">○</span>{i.text}</li>{:else}<li class="meta">nada: tudo pronto</li>{/each}
				</ul>
			</section>
		</div>
	{/if}
	<p class="meta upd">atualizado em {fmt(task.updated_at)}</p>
</article>

<style>
	.pt {
		display: grid;
		gap: 18px;
		border-top: 2px solid var(--black);
		padding-top: 16px;
	}
	.pt.big {
		border-top: 0;
		padding-top: 0;
	}
	header {
		display: grid;
		gap: 10px;
	}
	.title-xl {
		font-size: clamp(36px, 9vw, 80px);
		overflow-wrap: anywhere;
	}
	header .meta {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
		align-items: center;
	}
	.stage {
		border: 1px solid var(--black);
		color: var(--black);
		padding: 3px 7px;
	}
	.stage.fin {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	.prog {
		display: flex;
		gap: 12px;
		align-items: center;
	}
	.bar {
		flex: 1;
		height: 8px;
		background: var(--grey-light);
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--accent);
	}
	.pct {
		font: 400 var(--t-lg) / 1 var(--sans);
		min-width: 3.2em;
		text-align: right;
	}
	.desc {
		white-space: pre-wrap;
		font-size: var(--t-md);
		max-width: 65ch;
	}
	.cols {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--gutter);
	}
	h3 {
		border-bottom: var(--rule);
		padding-bottom: 6px;
		margin: 0 0 6px;
		font-weight: 500;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
	}
	li {
		display: grid;
		grid-template-columns: 22px 1fr;
		padding: 7px 0;
		border-bottom: var(--rule-soft);
		font-size: var(--t-md);
	}
	li.ok {
		color: var(--grey);
	}
	.ok .mk {
		color: var(--accent);
	}
	.upd {
		color: var(--grey);
	}
	@media (max-width: 600px) {
		.cols {
			grid-template-columns: 1fr;
		}
	}
</style>

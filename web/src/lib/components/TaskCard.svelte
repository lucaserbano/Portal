<script lang="ts">
	import { PRIORITY_LABEL, cardVars, fmtShort, isLate, labelVars, plainText, type CardFields, type Label, type Task } from '#lib/model.ts';

	let {
		task,
		labels,
		people = [],
		fields,
		onopen,
		ontoggle
	}: {
		task: Task;
		labels: Label[];
		people?: { id: string; name: string }[];
		fields: CardFields;
		onopen: () => void;
		ontoggle: () => void;
	} = $props();

	const late = $derived(isLate(task));
	const taskLabels = $derived(labels.filter((l) => task.labels.includes(l.id)));
	const members = $derived(people.filter((p) => task.people?.includes(p.id)));
	const initials = (n: string) => n.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
	const excerpt = $derived(plainText(task.description_md).slice(0, 90));
</script>

<article class="card" class:done={!!task.done_at} class:hascover={fields.cover && !!task.cover_url} style={cardVars(task.color)}>
	{#if fields.cover && task.cover_url}<img class="cover" src={task.cover_url} alt="" loading="lazy" draggable="false" />{/if}
	<button
		class="check"
		class:on={!!task.done_at}
		onclick={ontoggle}
		aria-label={task.done_at ? 'Reabrir tarefa' : 'Concluir tarefa'}
		title={task.done_at ? 'Reabrir' : 'Concluir'}
	>
		{#if task.done_at}
			<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 8.5 L6.5 12 L13 4.5" /></svg>
		{/if}
	</button>

	<button class="body" onclick={onopen}>
		{#if fields.labels && taskLabels.length}
			<span class="labels">
				{#each taskLabels as l (l.id)}<span class="lb" style={labelVars(l.color)}>{l.name}</span>{/each}
			</span>
		{/if}

		<span class="title">{task.title}</span>

		{#if fields.description && excerpt}<span class="excerpt">{excerpt}</span>{/if}

		{#if fields.checklist && task.progress}
			<span class="prog" title="{task.progress.done} de {task.progress.total} itens">
				<span class="track"><span style:width="{task.progress.pct}%"></span></span>
				<span class="meta" class:full={task.progress.pct === 100}>{task.progress.done}/{task.progress.total}</span>
			</span>
		{/if}

		{#if (fields.priority && task.priority) || (fields.due && task.due_at) || (fields.start && task.start_at) || (task.placements ?? 1) > 1 || (fields.people && members.length)}
			<span class="foot">
				{#if fields.priority && task.priority}
					<span class="prio {task.priority}">{PRIORITY_LABEL[task.priority]}</span>
				{/if}
				{#if fields.start && task.start_at}<span class="meta">↦ {fmtShort(task.start_at)}</span>{/if}
				{#if fields.due && task.due_at}
					<span class="meta" class:late>{late ? 'atrasada, ' : ''}{fmtShort(task.due_at)}</span>
				{/if}
				{#if (task.placements ?? 1) > 1}<span class="meta mirror" title="Cartão espelho">⧉</span>{/if}
				{#if fields.people && members.length}
					<span class="people">{#each members as m (m.id)}<span class="av" title={m.name}>{initials(m.name)}</span>{/each}</span>
				{/if}
			</span>
		{/if}
	</button>
</article>

<style>
	.card {
		background: var(--card-l, var(--white)) !important;
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 10px;
		align-items: start;
		padding: 10px 12px;
		border: var(--rule);
		background: var(--white);
	}
	:global([data-theme='dark']) .card {
		background: var(--card-d, var(--white)) !important;
	}
	.cover {
		grid-column: 1 / -1;
		width: calc(100% + 24px);
		margin: -10px -12px 0;
		height: 120px;
		object-fit: cover;
		border-bottom: var(--rule);
		pointer-events: none;
	}
	.prog {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.track {
		flex: 1;
		height: 3px;
		background: var(--grey-light);
	}
	.track span {
		display: block;
		height: 100%;
		background: var(--accent);
	}
	.full {
		color: var(--accent);
	}
	.mirror {
		color: var(--accent);
	}
	.people {
		display: flex;
		margin-left: auto;
	}
	.av {
		width: 22px;
		height: 22px;
		border: 1px solid var(--black);
		background: var(--white);
		display: grid;
		place-items: center;
		font: 400 9px / 1 var(--mono);
		margin-left: -4px;
	}
	.check {
		width: 18px;
		height: 18px;
		margin-top: 1px;
		border: var(--rule);
		background: var(--white);
		display: grid;
		place-items: center;
		padding: 0;
		cursor: pointer;
	}
	.check:hover {
		border-color: var(--accent);
	}
	.check.on {
		background: var(--black);
		color: var(--white);
	}
	.body {
		display: grid;
		gap: 6px;
		text-align: left;
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
		min-width: 0;
	}
	.title {
		font-size: var(--t-md);
		line-height: 1.3;
		overflow-wrap: anywhere;
	}
	.done .title {
		text-decoration: line-through;
		color: var(--grey);
	}
	.excerpt {
		font-size: var(--t-sm);
		color: var(--grey);
	}
	.labels {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.lb {
		font: 400 var(--t-xs) / 1 var(--mono);
		padding: 3px 5px;
		border: 1px solid var(--c);
		color: var(--c);
		background: var(--white);
	}
	.foot {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		align-items: center;
	}
	.prio {
		font: 400 var(--t-xs) / 1 var(--mono);
		padding: 3px 5px;
		border: 1px solid var(--grey);
		color: var(--grey);
	}
	.prio.preocupante {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--white);
	}
	.prio.critico {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--white);
	}
	.late {
		color: var(--accent);
	}
</style>

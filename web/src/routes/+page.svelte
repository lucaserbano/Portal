<script lang="ts">
	import { resolve } from '$app/paths';
	import { api } from '#lib/api.ts';
	import Doodle from '#lib/components/Doodle.svelte';

	type Board = { id: string; name: string; lists: number; open_tasks: number; late_tasks: number };

	const data = api<{ boards: Board[]; inbox: number }>('/boards');

	const today = new Date().toLocaleDateString('pt-BR', {
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	});
</script>

<section class="grid head">
	<h1 class="title-lg">Quadros</h1>
	<p class="meta date">{today}</p>
</section>

{#await data}
	<p class="meta">carregando…</p>
{:then { boards, inbox }}
	<section class="grid boards">
		<a class="box inbox" href={resolve('/inbox')}>
			<Doodle name="inbox" />
			<span class="name">Inbox</span>
			<span class="meta">{inbox} {inbox === 1 ? 'tarefa' : 'tarefas'} sem destino</span>
		</a>
		{#each boards as b (b.id)}
			<a class="box board" href={resolve('/b/[id]', { id: b.id })}>
				<span class="name">{b.name}</span>
				<span class="meta counts">
					<span>{b.lists} cards</span>
					<span>{b.open_tasks} abertas</span>
					<span class:late={b.late_tasks > 0}>{b.late_tasks} atrasadas</span>
				</span>
			</a>
		{/each}
	</section>
{:catch err}
	<p class="err" role="alert">{err.message}</p>
{/await}

<style>
	.head {
		align-items: end;
		padding-bottom: 14px;
		border-bottom: var(--rule);
		margin-bottom: var(--gutter);
	}
	.head h1 {
		grid-column: 1 / span 8;
	}
	.date {
		grid-column: 9 / span 4;
		justify-self: end;
	}
	.board {
		min-height: 150px;
	}
	.box {
		grid-column: span 4;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 24px;
		padding: 16px;
		text-decoration: none;
		transition: background 0.12s;
	}
	.box:hover {
		background: var(--black);
		color: var(--white);
	}
	.box:hover .meta {
		color: var(--white);
	}
	.inbox {
		grid-column: span 12;
		flex-direction: row;
		align-items: center;
		justify-content: flex-start;
		min-height: 0;
		gap: 16px;
	}
	.inbox .meta {
		margin-left: auto;
	}
	.name {
		font-size: var(--t-lg);
		letter-spacing: -0.01em;
	}
	.counts {
		display: flex;
		gap: 16px;
		flex-wrap: wrap;
	}
	.late {
		color: var(--accent);
	}
	.box:hover .late {
		color: var(--accent);
	}
	.err {
		color: var(--accent);
	}
	@media (max-width: 1000px) {
		.box {
			grid-column: span 6;
		}
	}
	@media (max-width: 600px) {
		.box,
		.inbox {
			grid-column: span 12;
		}
		.date {
			grid-column: 1 / -1;
			justify-self: start;
		}
	}
</style>

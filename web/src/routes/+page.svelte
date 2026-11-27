<script lang="ts">
	import { resolve } from '$app/paths';
	import { api } from '#lib/api.ts';
	import Doodle from '#lib/components/Doodle.svelte';
	import { plural } from '#lib/model.ts';

	type Board = { id: string; name: string; lists: number; open_tasks: number; late_tasks: number };

	let data = $state(api<{ boards: Board[]; inbox: number }>('/boards'));
	let newBoard = $state('');

	async function createBoard(e: SubmitEvent) {
		e.preventDefault();
		if (!newBoard.trim()) return;
		await api('/boards', { method: 'POST', body: JSON.stringify({ name: newBoard }) });
		newBoard = '';
		data = api<{ boards: Board[]; inbox: number }>('/boards');
	}

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
					<span class="open">{plural(b.open_tasks, 'aberta')}</span>
					<span class:late={b.late_tasks > 0}>{plural(b.late_tasks, 'atrasada')}</span>
				</span>
			</a>
		{/each}
		<form class="box newboard" onsubmit={createBoard}>
			<input class="field" placeholder="+ novo quadro" bind:value={newBoard} aria-label="Nome do novo quadro" />
			{#if newBoard.trim()}<button class="btn">criar</button>{/if}
		</form>
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
	.open {
		font-weight: 700;
	}
	.late {
		color: var(--accent);
	}
	.box:hover .late {
		color: var(--accent);
	}
	.newboard {
		min-height: 150px;
		border-style: dashed;
		border-color: var(--grey);
		justify-content: flex-start;
	}
	.newboard:hover {
		background: var(--white);
		color: var(--black);
	}
	.newboard .btn {
		align-self: flex-start;
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

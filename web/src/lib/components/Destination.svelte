<script lang="ts">
	// Escolher quadro + card (para mover, copiar, espelhar)
	import { api } from '#lib/api.ts';

	type Dest = { id: string; name: string; lists: { id: string; name: string }[] };
	let {
		label,
		onconfirm,
		oncancel
	}: { label: string; onconfirm: (d: { board_id: string; list_id: string | null }) => void; oncancel: () => void } = $props();

	let dests = $state<Dest[]>([]);
	let boardId = $state('');
	let listId = $state('');
	api<{ boards: Dest[] }>('/destinations').then((d) => (dests = d.boards));
	const board = $derived(dests.find((b) => b.id === boardId));
</script>

<div class="dest">
	<select bind:value={boardId} onchange={() => (listId = board?.lists[0]?.id ?? '')} aria-label="Quadro">
		<option value="">quadro…</option>
		{#each dests as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
	</select>
	<select bind:value={listId} disabled={!board} aria-label="Card">
		<option value="">só o quadro</option>
		{#each board?.lists ?? [] as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
	</select>
	<button class="btn primary" disabled={!boardId} onclick={() => onconfirm({ board_id: boardId, list_id: listId || null })}>{label}</button>
	<button class="link" onclick={oncancel}>cancelar</button>
</div>

<style>
	.dest {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}
	select {
		border: var(--rule);
		border-radius: 0;
		background: var(--white);
		padding: 8px;
		font-size: var(--t-sm);
		max-width: 200px;
	}
	.link {
		background: none;
		border: 0;
		padding: 0;
		font-size: var(--t-sm);
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
</style>

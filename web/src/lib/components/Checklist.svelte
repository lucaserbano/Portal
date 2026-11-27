<script lang="ts" module>
	export type CheckItem = {
		id: string;
		text: string;
		weight: number | null;
		done: number;
		person_id: string | null;
		position: number;
	};

	/** Cada item vale 1; os mais trabalhosos valem 2 ou 3 */
	export const itemWeight = (w: number | null) => (w === 2 || w === 3 ? w : 1);

	export function pct(items: Pick<CheckItem, 'weight' | 'done'>[]) {
		if (!items.length) return 0;
		const total = items.reduce((s, i) => s + itemWeight(i.weight), 0);
		const done = items.reduce((s, i) => s + (i.done ? itemWeight(i.weight) : 0), 0);
		return Math.round((done / total) * 100);
	}
</script>

<script lang="ts">
	import { flip } from 'svelte/animate';
	import { fade } from 'svelte/transition';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { api } from '#lib/api.ts';
	import { between } from '#lib/model.ts';

	let {
		taskId,
		items,
		people,
		onchange
	}: {
		taskId: string;
		items: CheckItem[];
		people: { id: string; name: string }[];
		onchange: () => void;
	} = $props();

	// Itens recém-criados ficam na tela enquanto o servidor não confirma
	let pending = $state<CheckItem[]>([]);
	let list = $state<CheckItem[]>([]);
	$effect(() => {
		const fromServer = items.map((i) => ({ ...i }));
		list = [...fromServer, ...pending.filter((p) => !fromServer.some((i) => i.id === p.id))];
	});

	let text = $state('');
	let inputEl = $state<HTMLInputElement>();
	const progress = $derived(pct(list));
	const doneCount = $derived(list.filter((i) => i.done).length);

	async function patch(item: CheckItem, p: Partial<CheckItem>) {
		Object.assign(item, p);
		if (item.id.startsWith('tmp')) return;
		await api(`/checklist/${item.id}`, { method: 'PATCH', body: JSON.stringify(p) });
		onchange();
	}

	async function add(e: SubmitEvent) {
		e.preventDefault();
		const t = text.trim();
		if (!t) return;
		const temp: CheckItem = { id: `tmp${Date.now()}`, text: t, weight: null, done: 0, person_id: null, position: Infinity };
		pending = [...pending, temp];
		list = [...list, temp];
		text = '';
		inputEl?.focus(); // o teclado continua aberto para o próximo item
		try {
			const r = await api<{ id: string }>(`/tasks/${taskId}/checklist`, { method: 'POST', body: JSON.stringify({ text: t }) });
			pending = pending.map((p) => (p.id === temp.id ? { ...p, id: r.id } : p));
			onchange();
		} catch {
			pending = pending.filter((p) => p.id !== temp.id);
			list = list.filter((i) => i.id !== temp.id);
		}
	}

	async function remove(item: CheckItem) {
		list = list.filter((i) => i.id !== item.id);
		pending = pending.filter((p) => p.id !== item.id);
		if (item.id.startsWith('tmp')) return;
		await api(`/checklist/${item.id}`, { method: 'DELETE' });
		onchange();
	}

	// toque no peso: normal → ×2 → ×3 → normal
	const nextWeight = (w: number | null) => (w === 2 ? 3 : w === 3 ? null : 2);

	function consider(e: CustomEvent<DndEvent<CheckItem>>) {
		list = e.detail.items;
	}
	async function finalize(e: CustomEvent<DndEvent<CheckItem>>) {
		list = e.detail.items;
		const i = list.findIndex((x) => x.id === e.detail.info.id);
		if (i < 0) return;
		const position = between(list[i - 1]?.position, list[i + 1]?.position);
		await patch(list[i], { position });
	}
</script>

<div class="head">
	<span class="label">checklist</span>
	{#if list.length}<span class="meta">{doneCount}/{list.length}</span>{/if}
</div>

{#if list.length}
	<div class="bar" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100">
		<span style:width="{progress}%"></span>
	</div>

	<ul use:dndzone={{ items: list, flipDurationMs: 160, type: `check-${taskId}`, dropTargetStyle: {}, delayTouchStart: 180 }} onconsider={consider} onfinalize={finalize}>
		{#each list as item (item.id)}
			<li class:done={!!item.done} animate:flip={{ duration: 160 }} in:fade={{ duration: 140 }}>
				<input type="checkbox" checked={!!item.done} onchange={(e) => patch(item, { done: e.currentTarget.checked ? 1 : 0 })} aria-label="Feito" />
				<input
					class="text"
					value={item.text}
					aria-label="Item"
					onchange={(e) => e.currentTarget.value.trim() && patch(item, { text: e.currentTarget.value.trim() })}
					onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
				/>
				<button
					class="w"
					class:on={item.weight === 2 || item.weight === 3}
					onclick={() => patch(item, { weight: nextWeight(item.weight) })}
					title="Peso: toque para marcar como mais trabalhoso (×2, ×3)"
					aria-label="Peso {item.weight ?? 1}"
				>×{item.weight === 2 || item.weight === 3 ? item.weight : 1}</button>
				<select value={item.person_id ?? ''} onchange={(e) => patch(item, { person_id: e.currentTarget.value || null })} aria-label="Responsável">
					<option value="">@</option>
					{#each people as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
				</select>
				<button class="del" onclick={() => remove(item)} aria-label="Remover item">×</button>
			</li>
		{/each}
	</ul>
{/if}

<form class="add" onsubmit={add}>
	<input class="field" placeholder="+ item do checklist" bind:value={text} bind:this={inputEl} enterkeyhint="done" />
	<button class="btn" class:hidden={!text.trim()} tabindex={text.trim() ? 0 : -1}>adicionar</button>
</form>

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.bar {
		height: 4px;
		background: var(--grey-light);
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--accent);
		transition: width 0.25s;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		outline: none;
	}
	li {
		display: grid;
		grid-template-columns: auto 1fr auto auto auto;
		gap: 8px;
		align-items: center;
		padding: 6px 0;
		border-bottom: var(--rule-soft);
		background: var(--white);
	}
	li.done .text {
		text-decoration: line-through;
		color: var(--grey);
	}
	input[type='checkbox'] {
		accent-color: var(--accent);
		width: 16px;
		height: 16px;
	}
	.text {
		border: 0;
		padding: 4px 0;
		outline: none;
		min-width: 0;
		background: none;
	}
	.text:focus {
		box-shadow: 0 1px 0 var(--accent);
	}
	.w {
		border: 0;
		background: none;
		padding: 4px 2px;
		font: 400 var(--t-xs) var(--mono);
		color: var(--inactive);
		cursor: pointer;
		min-width: 24px;
	}
	.w.on {
		color: var(--black);
	}
	select {
		border: 0;
		border-bottom: 1px solid var(--grey-light);
		background: none;
		font-size: var(--t-xs);
		max-width: 100px;
		padding: 3px 0;
		border-radius: 0;
	}
	.del {
		border: 0;
		background: none;
		color: var(--grey);
		cursor: pointer;
		font-size: 16px;
	}
	.del:hover {
		color: var(--accent);
	}
	.add {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.add .field {
		flex: 1;
		font-size: var(--t-sm);
	}
	.add .btn {
		padding: 5px 10px;
		transition: opacity 0.15s;
	}
	.add .btn.hidden {
		opacity: 0;
		pointer-events: none;
	}
	@media (max-width: 600px) {
		li {
			gap: 6px;
		}
		select {
			max-width: 64px;
			text-overflow: ellipsis;
		}
	}
</style>

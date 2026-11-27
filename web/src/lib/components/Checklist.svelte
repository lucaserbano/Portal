<script lang="ts" module>
	export type CheckItem = {
		id: string;
		text: string;
		weight: number | null;
		done: number;
		person_id: string | null;
		position: number;
	};

	/** Peso efetivo: itens sem peso dividem igualmente o que falta para 100% */
	export function effective(items: Pick<CheckItem, 'weight'>[]) {
		const fixed = items.reduce((s, i) => s + (i.weight ?? 0), 0);
		const free = items.filter((i) => i.weight == null).length;
		const share = free ? Math.max(0, 100 - fixed) / free : 0;
		return { fixed, share };
	}

	export function pct(items: Pick<CheckItem, 'weight' | 'done'>[]) {
		if (!items.length) return 0;
		const { fixed, share } = effective(items);
		const total = fixed + share * items.filter((i) => i.weight == null).length;
		const done = items.reduce((s, i) => s + (i.done ? (i.weight ?? share) : 0), 0);
		return total ? Math.round((done / total) * 100) : 0;
	}
</script>

<script lang="ts">
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

	let list = $state<CheckItem[]>([]);
	$effect(() => {
		list = items.map((i) => ({ ...i }));
	});

	let text = $state('');
	let weight = $state('');

	const eff = $derived(effective(list));
	const progress = $derived(pct(list));
	const over = $derived(eff.fixed > 100);

	async function patch(item: CheckItem, p: Partial<CheckItem>) {
		Object.assign(item, p);
		await api(`/checklist/${item.id}`, { method: 'PATCH', body: JSON.stringify(p) });
		onchange();
	}

	async function add(e: SubmitEvent) {
		e.preventDefault();
		if (!text.trim()) return;
		const w = weight.trim() === '' ? null : Math.max(0, Math.min(100, Number(weight)));
		await api(`/tasks/${taskId}/checklist`, { method: 'POST', body: JSON.stringify({ text, weight: w }) });
		text = '';
		weight = '';
		onchange();
	}

	async function remove(item: CheckItem) {
		list = list.filter((i) => i.id !== item.id);
		await api(`/checklist/${item.id}`, { method: 'DELETE' });
		onchange();
	}

	function setWeight(item: CheckItem, v: string) {
		const w = v.trim() === '' ? null : Math.max(0, Math.min(100, Number(v)));
		if (w !== item.weight) patch(item, { weight: w });
	}

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
	{#if list.length}
		<span class="meta">{list.filter((i) => i.done).length}/{list.length} · <b class:full={progress === 100}>{progress}%</b></span>
	{/if}
</div>

{#if list.length}
	<div class="bar" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100">
		<span style:width="{progress}%"></span>
	</div>
	{#if over}<p class="warn">Os pesos somam {eff.fixed}% (mais de 100%). O progresso é proporcional.</p>{/if}

	<ul use:dndzone={{ items: list, flipDurationMs: 120, type: `check-${taskId}`, dropTargetStyle: {}, delayTouchStart: 180 }} onconsider={consider} onfinalize={finalize}>
		{#each list as item (item.id)}
			<li class:done={!!item.done}>
				<input type="checkbox" checked={!!item.done} onchange={(e) => patch(item, { done: e.currentTarget.checked ? 1 : 0 })} aria-label="Feito" />
				<input
					class="text"
					value={item.text}
					aria-label="Item"
					onchange={(e) => e.currentTarget.value.trim() && patch(item, { text: e.currentTarget.value.trim() })}
					onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
				/>
				<label class="w" title="Quanto este item vale no trabalho da tarefa. Vazio = divide o restante.">
					<input
						type="number"
						min="0"
						max="100"
						inputmode="numeric"
						placeholder={eff.share ? String(Math.round(eff.share)) : '0'}
						value={item.weight ?? ''}
						onchange={(e) => setWeight(item, e.currentTarget.value)}
						aria-label="Peso em %"
					/>%
				</label>
				<select value={item.person_id ?? ''} onchange={(e) => patch(item, { person_id: e.currentTarget.value || null })} aria-label="Responsável">
					<option value="">—</option>
					{#each people as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
				</select>
				<button class="del" onclick={() => remove(item)} aria-label="Remover item">×</button>
			</li>
		{/each}
	</ul>
{/if}

<form class="add" onsubmit={add}>
	<input class="field" placeholder="+ item do checklist" bind:value={text} />
	<label class="w"><input type="number" min="0" max="100" inputmode="numeric" placeholder="peso" bind:value={weight} aria-label="Peso em %" />%</label>
	{#if text.trim()}<button class="btn">adicionar</button>{/if}
</form>

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	b {
		font-weight: 400;
		color: var(--black);
	}
	b.full {
		color: var(--accent);
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
	.warn {
		font-size: var(--t-xs);
		color: var(--accent);
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
		display: flex;
		align-items: center;
		font: 400 var(--t-xs) var(--mono);
		color: var(--grey);
	}
	.w input {
		width: 40px;
		border: 0;
		border-bottom: 1px solid var(--grey-light);
		text-align: right;
		font: inherit;
		padding: 3px 2px;
		background: none;
		appearance: textfield;
	}
	.w input::-webkit-inner-spin-button {
		display: none;
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
	}
	@media (max-width: 600px) {
		li {
			grid-template-columns: auto 1fr auto auto;
		}
		li select {
			grid-column: 2 / 4;
			max-width: none;
		}
	}
</style>

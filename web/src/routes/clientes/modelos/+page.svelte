<script lang="ts">
	import { resolve } from '$app/paths';
	import { api } from '#lib/api.ts';
	import { FORMATS, formatName } from '#lib/components/ScriptPanel.svelte';

	type Tpl = { id: string; name: string; format: string; body_md: string };
	let list = $state<Tpl[]>([]);
	let current = $state<string | null>(null);
	let Editor = $state<any>(null);
	let saved = $state('');
	import('#lib/components/Editor.svelte').then((m) => (Editor = m.default));

	async function load() {
		list = (await api<{ templates: Tpl[] }>('/script-templates')).templates;
		if (!current && list.length) current = list[0].id;
	}
	load();
	const tpl = $derived(list.find((t) => t.id === current));

	async function save(t: Tpl, p: Partial<Tpl>) {
		Object.assign(t, p);
		saved = 'salvando…';
		await api(`/script-templates/${t.id}`, { method: 'PATCH', body: JSON.stringify(p) });
		saved = 'salvo';
		setTimeout(() => saved === 'salvo' && (saved = ''), 1500);
	}
	let timer: ReturnType<typeof setTimeout>;
	function onBody(md: string) {
		const t = tpl;
		if (!t) return;
		t.body_md = md;
		clearTimeout(timer);
		saved = 'salvando…';
		timer = setTimeout(() => save(t, { body_md: md }), 800);
	}
	async function add() {
		const { id } = await api<{ id: string }>('/script-templates', { method: 'POST', body: JSON.stringify({ name: 'Modelo novo', format: 'reels', body_md: '**Gancho**\n\n**Desenvolvimento**\n\n**CTA**' }) });
		current = id;
		await load();
	}
	let confirmDel = $state(false);
	async function del(t: Tpl) {
		if (!confirmDel) {
			confirmDel = true;
			setTimeout(() => (confirmDel = false), 3000);
			return;
		}
		await api(`/script-templates/${t.id}`, { method: 'DELETE' });
		current = null;
		await load();
	}
</script>

<p class="back meta"><a href={resolve('/clientes')}>← clientes</a></p>
<section class="head">
	<h1 class="title-lg">Modelos de roteiro</h1>
	<p class="meta">A estrutura que entra no roteiro novo. Vale para todos os clientes. {saved}</p>
</section>

<div class="wrap">
	<nav class="side">
		{#each list as t (t.id)}
			<button class:on={t.id === current} onclick={() => (current = t.id)}>
				<span>{t.name}</span><span class="meta">{formatName(t.format)}</span>
			</button>
		{/each}
		<button class="new" onclick={add}>+ modelo</button>
	</nav>

	{#if tpl}
		<section class="edit">
			{#key tpl.id}
				<div class="row">
					<input class="field nm" value={tpl.name} onchange={(e) => save(tpl, { name: e.currentTarget.value })} aria-label="Nome do modelo" />
					<select value={tpl.format} onchange={(e) => save(tpl, { format: e.currentTarget.value })} aria-label="Formato">
						{#each FORMATS as [v, n] (v)}<option value={v}>{n}</option>{/each}
					</select>
				</div>
				{#if Editor}
					<Editor value={tpl.body_md} people={[]} onchange={onBody} onpeople={() => {}} onopentask={() => {}} />
				{/if}
				<button class="btn danger" onclick={() => del(tpl)}>{confirmDel ? 'toque de novo para apagar' : 'apagar modelo'}</button>
			{/key}
		</section>
	{/if}
</div>

<style>
	.back {
		margin-bottom: 10px;
	}
	.back a {
		text-decoration: none;
	}
	.head {
		display: grid;
		gap: 6px;
		padding-bottom: 14px;
		border-bottom: var(--rule);
		margin-bottom: 18px;
	}
	.wrap {
		display: grid;
		grid-template-columns: 260px 1fr;
		gap: var(--gutter);
		align-items: start;
	}
	.side {
		display: grid;
		border-top: var(--rule);
	}
	.side button {
		display: grid;
		gap: 2px;
		text-align: left;
		background: var(--white);
		border: 0;
		border-bottom: var(--rule-soft);
		padding: 10px 8px;
		cursor: pointer;
		font-size: var(--t-sm);
	}
	.side button.on {
		background: var(--black);
		color: var(--white);
	}
	.side .new {
		color: var(--grey);
	}
	.edit {
		display: grid;
		gap: 12px;
		max-width: 760px;
	}
	.row {
		display: flex;
		gap: 10px;
		align-items: center;
	}
	.nm {
		flex: 1;
		font-size: var(--t-md);
	}
	select {
		border: var(--rule);
		border-radius: 0;
		background: var(--white);
		padding: 8px;
		font-size: var(--t-sm);
	}
	.btn.danger {
		justify-self: start;
	}
	.btn.danger:hover {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	@media (max-width: 720px) {
		.wrap {
			grid-template-columns: 1fr;
		}
	}
</style>

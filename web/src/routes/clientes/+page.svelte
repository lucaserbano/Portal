<script lang="ts">
	import SectionPhoto from '#lib/components/SectionPhoto.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { api } from '#lib/api.ts';
	import { plural } from '#lib/model.ts';

	type C = { id: string; name: string; handle: string; niche: string; open_themes: number; open_scripts: number };
	let list = $state<C[] | null>(null);
	let error = $state('');
	let adding = $state(false);
	let name = $state('');

	api<{ clients: C[] }>('/clients')
		.then((d) => (list = d.clients))
		.catch((e) => (error = e.message));

	async function create(e: SubmitEvent) {
		e.preventDefault();
		if (!name.trim()) return;
		const { id } = await api<{ id: string }>('/clients', { method: 'POST', body: JSON.stringify({ name }) });
		goto(resolve('/clientes/[id]', { id }) + '?novo=1');
	}
</script>

<section class="grid head">
	<h1 class="title-xl ttl">Clientes</h1>
	<div class="acts">
		<button class="btn dark" onclick={() => (adding = !adding)}>+ cliente</button>
		<a class="btn" href={resolve('/clientes/modelos')}>modelos de roteiro</a>
	</div>
</section>

{#if adding}
	<form class="box panel" onsubmit={create}>
		<!-- svelte-ignore a11y_autofocus -->
		<input class="field" placeholder="nome do cliente" bind:value={name} autofocus />
		<button class="btn dark" disabled={!name.trim()}>criar</button>
	</form>
{/if}

{#if error}<p class="err">{error}</p>{/if}

{#if list}
	{#if list.length}
		<ul class="clients">
			{#each list as c (c.id)}
				<li>
					<a class="card" href={resolve('/clientes/[id]', { id: c.id })}>
						<span class="t">{c.name}</span>
						{#if c.handle}<span class="meta">{c.handle}</span>{/if}
						{#if c.niche}<span class="niche">{c.niche}</span>{/if}
						<span class="meta foot">{plural(c.open_themes, 'tema')} na fila · {plural(c.open_scripts, 'roteiro')} em aberto</span>
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<div class="emptyph">
			<p class="label grey">Nenhum cliente ainda. Cada cliente guarda o perfil (tom de voz, pilares, o que evitar), um banco de temas e os roteiros.</p>
			<SectionPhoto seed="clientes" height={220} />
		</div>
	{/if}
{:else if !error}
	<p class="meta">carregando…</p>
{/if}

<style>
	.head {
		align-items: end;
		padding-bottom: 14px;
		border-bottom: var(--rule);
		margin-bottom: 18px;
	}
	.ttl {
		grid-column: 1 / span 7;
	}
	.acts {
		grid-column: 8 / -1;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		justify-content: flex-end;
	}
	a.btn {
		text-decoration: none;
	}
	.btn.dark {
		background: var(--black);
		border-color: var(--black);
		color: var(--white);
	}
	.panel {
		padding: 14px;
		display: flex;
		gap: 10px;
		align-items: center;
		margin-bottom: 18px;
	}
	.clients {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		border-top: var(--rule);
		border-left: var(--rule);
	}
	.card {
		display: grid;
		align-content: start;
		gap: 6px;
		padding: 16px;
		min-height: 150px;
		height: 100%;
		border-right: var(--rule);
		border-bottom: var(--rule);
		text-decoration: none;
	}
	.card:hover {
		background: var(--black);
		color: var(--white);
	}
	.t {
		font-size: var(--t-lg);
		line-height: 1.1;
	}
	.niche {
		font-size: var(--t-sm);
		color: var(--grey);
	}
	.foot {
		margin-top: 10px;
	}
	.grey {
		color: var(--grey);
		max-width: 60ch;
	}
	.err {
		color: var(--accent);
	}
	@media (max-width: 720px) {
		.ttl,
		.acts {
			grid-column: 1 / -1;
			justify-content: flex-start;
		}
		.title-xl {
			font-size: clamp(40px, 12vw, 64px);
		}
	}
</style>

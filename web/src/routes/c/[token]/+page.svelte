<script lang="ts">
	// Página pública: o cliente acompanha as tarefas dele
	import { page } from '$app/state';
	import PublicTask, { type PubTask } from '#lib/components/PublicTask.svelte';
	import { applyBrand, type Brand } from '#lib/brand.ts';
	const API = import.meta.env.VITE_API_URL as string;
	let data = $state<{ client: string; brand: Brand | null; tasks: PubTask[] } | null>(null);
	let error = $state('');
	fetch(`${API}/public/c/${encodeURIComponent(page.params.token!)}`)
		.then(async (r) => {
			const d = await r.json();
			if (!r.ok) throw new Error(d.error ?? 'Link inválido.');
			data = d;
			applyBrand(d.brand);
			document.title = d.client;
		})
		.catch((e) => (error = e.message === 'Failed to fetch' ? 'Sem conexão. Tente recarregar.' : e.message));
	const open = $derived(data?.tasks.filter((t) => !t.done_at) ?? []);
	const closed = $derived(data?.tasks.filter((t) => t.done_at) ?? []);
</script>

<main class="pub">
	{#if data}
		<header>
			{#if data.brand?.logo}<img class="logo" src={data.brand.logo} alt={data.client} />{/if}
			<p class="meta">acompanhamento</p>
			<h1 class="title-xl">{data.client}</h1>
			<p class="label grey">{open.length} em andamento · {closed.length} concluídas</p>
		</header>
		{#each open as t, k (k)}<PublicTask task={t} />{/each}
		{#if closed.length}
			<h2 class="label sec">concluídas</h2>
			{#each closed as t, k (k)}<PublicTask task={t} />{/each}
		{/if}
		{#if !data.tasks.length}<p class="label grey">Nenhuma tarefa por aqui ainda.</p>{/if}
	{:else if error}<h1 class="title-lg">{error}</h1>{:else}<p class="meta">carregando…</p>{/if}
	<footer class="meta">πύλη</footer>
</main>

<style>
	.pub {
		max-width: 900px;
		margin: 0 auto;
		padding: calc(var(--gutter) * 2) var(--gutter) calc(var(--gutter) * 3);
		display: grid;
		gap: 40px;
	}
	header {
		display: grid;
		gap: 10px;
		border-bottom: var(--rule);
		padding-bottom: 18px;
	}
	.title-xl {
		font-size: clamp(40px, 10vw, 96px);
		overflow-wrap: anywhere;
	}
	.grey {
		color: var(--grey);
	}
	.sec {
		color: var(--grey);
		margin-bottom: -20px;
	}
	.logo {
		display: block;
		max-width: 100%;
		max-height: 140px;
		object-fit: contain;
		object-position: left center;
	}
	footer {
		border-top: var(--rule-soft);
		padding-top: 10px;
	}
</style>

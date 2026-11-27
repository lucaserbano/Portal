<script lang="ts">
	// Página pública: o cliente acompanha UMA tarefa
	import { page } from '$app/state';
	import PublicTask, { type PubTask } from '#lib/components/PublicTask.svelte';
	const API = import.meta.env.VITE_API_URL as string;
	let task = $state<PubTask | null>(null);
	let error = $state('');
	fetch(`${API}/public/t/${encodeURIComponent(page.params.token!)}`)
		.then(async (r) => {
			const d = await r.json();
			if (!r.ok) throw new Error(d.error ?? 'Link inválido.');
			task = d.task;
			document.title = d.task.title;
		})
		.catch((e) => (error = e.message === 'Failed to fetch' ? 'Sem conexão. Tente recarregar.' : e.message));
</script>

<main class="pub">
	{#if task}<PublicTask {task} big />{:else if error}<h1 class="title-lg">{error}</h1>{:else}<p class="meta">carregando…</p>{/if}
	<footer class="meta">acompanhamento · πύλη</footer>
</main>

<style>
	.pub {
		max-width: 900px;
		margin: 0 auto;
		padding: calc(var(--gutter) * 2) var(--gutter) calc(var(--gutter) * 3);
		display: grid;
		gap: 32px;
	}
	footer {
		border-top: var(--rule-soft);
		padding-top: 10px;
	}
</style>

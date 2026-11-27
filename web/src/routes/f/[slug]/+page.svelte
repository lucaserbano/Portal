<script lang="ts">
	// Página pública do formulário: o cliente abre sem login
	import { page } from '$app/state';
	import FormFields, { type Field } from '#lib/components/FormFields.svelte';
	import { applyBrand, type Brand } from '#lib/brand.ts';

	const API = import.meta.env.VITE_API_URL as string;
	type PublicForm = { title: string; description: string; fields: Field[]; open: boolean; thanks: string };

	let form = $state<PublicForm | null>(null);
	let brand = $state<Brand | null>(null);
	let values = $state<Record<string, string | string[]>>({});
	let website = $state(''); // campo-isca para robôs
	let error = $state('');
	let notFound = $state(false);
	let sending = $state(false);
	let thanks = $state('');

	fetch(`${API}/public/forms/${encodeURIComponent(page.params.slug!)}`)
		.then(async (r) => {
			if (!r.ok) return (notFound = true);
			const d = await r.json();
			form = d.form;
			brand = d.brand;
			applyBrand(brand);
			document.title = form!.title;
		})
		.catch(() => (error = 'Sem conexão. Tente recarregar a página.'));

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!form) return;
		const missing = form.fields.find((f) => f.required && f.type === 'checks' && !((values[f.id] as string[]) ?? []).length);
		if (missing) return (error = `Responda: ${missing.label}`);
		sending = true;
		error = '';
		try {
			const r = await fetch(`${API}/public/forms/${encodeURIComponent(page.params.slug!)}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ answers: values, website })
			});
			const d = await r.json().catch(() => ({}));
			if (!r.ok) throw new Error(d.error ?? 'Não foi possível enviar.');
			thanks = d.thanks || 'Resposta enviada. Obrigado!';
			scrollTo({ top: 0 });
		} catch (err) {
			error = (err as Error).message;
		} finally {
			sending = false;
		}
	}
</script>

<main class="pub">
	{#if brand?.logo}<img class="logo" src={brand.logo} alt="" />{/if}
	{#if notFound}
		<h1 class="title-lg">Formulário não encontrado.</h1>
		<p class="label grey">Confira o link com quem enviou.</p>
	{:else if !form}
		<p class="meta">{error || 'carregando…'}</p>
	{:else if thanks}
		<h1 class="title-xl done">{thanks}</h1>
		<p class="label grey">{form.title}</p>
		<button class="link" onclick={() => ((thanks = ''), (values = {}))}>enviar outra resposta</button>
	{:else}
		<header>
			<h1 class="title-xl">{form.title}</h1>
			{#if form.description}<p class="desc">{form.description}</p>{/if}
			{#if form.fields.some((f) => f.required)}<p class="meta"><b class="req">*</b> obrigatória</p>{/if}
		</header>
		{#if !form.open}
			<p class="closed">Este formulário não está recebendo respostas no momento.</p>
		{:else}
			<form onsubmit={submit}>
				<FormFields fields={form.fields} bind:values />
				<input class="trap" tabindex="-1" autocomplete="off" bind:value={website} aria-hidden="true" name="website" />
				{#if error}<p class="err" role="alert">{error}</p>{/if}
				<button class="btn send" disabled={sending}>{sending ? 'enviando…' : 'enviar'}</button>
			</form>
		{/if}
	{/if}
	<footer class="meta">πύλη</footer>
</main>

<style>
	.pub {
		max-width: 680px;
		margin: 0 auto;
		padding: calc(var(--gutter) * 2) var(--gutter) calc(var(--gutter) * 3);
		display: grid;
		gap: 28px;
	}
	header {
		display: grid;
		gap: 14px;
		border-bottom: var(--rule);
		padding-bottom: 20px;
	}
	.title-xl {
		font-size: clamp(36px, 9vw, 72px);
		overflow-wrap: anywhere;
	}
	.done {
		color: var(--black);
	}
	.desc {
		white-space: pre-wrap;
		font-size: var(--t-md);
	}
	.grey {
		color: var(--grey);
	}
	.req {
		color: var(--accent);
		font-weight: 400;
	}
	form {
		display: grid;
		gap: 30px;
	}
	.send {
		justify-self: start;
		background: var(--black);
		border-color: var(--black);
		color: var(--white);
		padding: 14px 36px;
		font-size: var(--t-md);
	}
	@media (hover: hover) {
		.send:hover {
			background: var(--accent);
			border-color: var(--accent);
		}
	}
	.trap {
		position: absolute;
		left: -9999px;
		width: 1px;
		height: 1px;
		opacity: 0;
	}
	.closed,
	.err {
		color: var(--accent);
	}
	.link {
		justify-self: start;
		background: none;
		border: 0;
		padding: 0;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
		font-size: var(--t-sm);
	}
	.logo {
		display: block;
		max-width: 100%;
		max-height: 140px;
		object-fit: contain;
		object-position: left center;
	}
	footer {
		margin-top: 30px;
		border-top: var(--rule-soft);
		padding-top: 10px;
	}
</style>

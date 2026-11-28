<script lang="ts">
	import PageBg from '#lib/components/PageBg.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { api } from '#lib/api.ts';
	import { fmtShort, plural } from '#lib/model.ts';

	type FormRow = { id: string; slug: string; title: string; open: number; total: number; unread: number; last_at: number | null };

	let list = $state<FormRow[] | null>(null);
	let error = $state('');
	let mode = $state<null | 'new' | 'google'>(null);
	let title = $state('');
	let gurl = $state('');
	let busy = $state(false);

	api<{ forms: FormRow[] }>('/forms')
		.then((d) => (list = d.forms))
		.catch((e) => (error = e.message));

	async function create(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		try {
			const { id } = await api<{ id: string }>('/forms', { method: 'POST', body: JSON.stringify({ title }) });
			goto(resolve('/formularios/[id]', { id }));
		} catch (err) {
			error = (err as Error).message;
			busy = false;
		}
	}

	async function importGoogle(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		error = '';
		try {
			const { id, skipped } = await api<{ id: string; skipped: string[] }>('/forms/import-google', {
				method: 'POST',
				body: JSON.stringify({ url: gurl })
			});
			const q = skipped.length ? `?puladas=${encodeURIComponent(skipped.join(' | '))}` : '';
			goto(resolve('/formularios/[id]', { id }) + q);
		} catch (err) {
			error = (err as Error).message;
			busy = false;
		}
	}
</script>

<PageBg kind="noite" />

<section class="grid head">
	<h1 class="title-xl ttl">Formulários</h1>
	<div class="acts">
		<button class="btn primary-b" onclick={() => (mode = mode === 'new' ? null : 'new')}>+ novo formulário</button>
		<button class="btn" onclick={() => (mode = mode === 'google' ? null : 'google')}>importar do Google Forms</button>
	</div>
</section>

{#if mode === 'new'}
	<form class="box panel" onsubmit={create}>
		<!-- svelte-ignore a11y_autofocus -->
		<input class="field" placeholder="nome do formulário (ex.: Briefing de cliente)" bind:value={title} autofocus />
		<button class="btn primary-b" disabled={busy}>criar</button>
	</form>
{:else if mode === 'google'}
	<form class="box panel col" onsubmit={importGoogle}>
		<p class="label">
			Cole o link de resposta do Google Forms (o mesmo que você manda para as pessoas: <span class="meta">docs.google.com/forms/…/viewform</span> ou
			<span class="meta">forms.gle/…</span>). O formulário precisa estar aberto a qualquer pessoa com o link. As perguntas viram um formulário aqui; as respostas antigas
			você traz depois, pelo arquivo .csv, na aba “ajustes”.
		</p>
		<div class="row">
			<!-- svelte-ignore a11y_autofocus -->
			<input class="field" placeholder="https://forms.gle/…" bind:value={gurl} inputmode="url" autofocus />
			<button class="btn primary-b" disabled={busy || !gurl.trim()}>{busy ? 'lendo…' : 'importar'}</button>
		</div>
	</form>
{/if}

{#if error}<p class="err">{error}</p>{/if}

{#if list}
	{#if list.length}
		<ul class="forms">
			{#each list as f (f.id)}
				<li>
					<a href={resolve('/formularios/[id]', { id: f.id })} class="card">
						<span class="t">{f.title}</span>
						<span class="meta">
							{plural(f.total, 'resposta')}{#if f.unread}, <b class="new">{f.unread} {f.unread === 1 ? 'nova' : 'novas'}</b>{/if}
						</span>
						<span class="meta">{f.open ? 'recebendo respostas' : 'fechado'}{f.last_at ? `, última ${fmtShort(f.last_at)}` : ''}</span>
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="label grey">Nenhum formulário ainda. Crie um ou importe do Google Forms.</p>
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
	.btn.primary-b {
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
	.panel.col {
		display: grid;
	}
	.row {
		display: flex;
		gap: 10px;
		align-items: center;
	}
	.forms {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		border-top: var(--rule);
		border-left: var(--rule);
	}
	.card {
		background: var(--white); /* liso sobre o fundo da página */
		display: grid;
		gap: 6px;
		padding: 16px;
		min-height: 130px;
		align-content: start;
		border-right: var(--rule);
		border-bottom: var(--rule);
		text-decoration: none;
		height: 100%;
	}
	.card:hover {
		background: var(--black);
		color: var(--white);
	}
	.t {
		font-size: var(--t-lg);
		line-height: 1.1;
		margin-bottom: 8px;
	}
	.new {
		color: var(--accent);
		font-weight: 700;
	}
	.grey {
		color: var(--grey);
	}
	.err {
		color: var(--accent);
		margin-bottom: 12px;
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

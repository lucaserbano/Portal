<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { api, auth } from '#lib/api.ts';
	import Doodle from '#lib/components/Doodle.svelte';

	let password = $state('');
	// uma foto "vibe" (muda a cada dia); privada: vem com link assinado da API
	let photo = $state<{ url: string; w: number; h: number } | null>(null);
	fetch(`${import.meta.env.VITE_API_URL}/public/login-image`)
		.then((r) => r.json())
		.then((d) => (photo = d.photo))
		.catch(() => {});
	let error = $state('');
	let busy = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		error = '';
		try {
			const { token } = await api<{ token: string }>('/auth/login', {
				method: 'POST',
				body: JSON.stringify({ password })
			});
			auth.set(token);
			goto(resolve('/'));
		} catch (err) {
			error = (err as Error).message;
			password = '';
		} finally {
			busy = false;
		}
	}
</script>

<div class="page login">
	<div class="top grid">
		<span class="label">πύλη — portal</span>
		<span class="meta right">acesso restrito</span>
	</div>

	<form class="grid mid" onsubmit={submit}>
		<div class="door">
			{#if photo}<img class="ph" src={photo.url} alt="" width={photo.w} height={photo.h} />{:else}<Doodle name="door" size={64} />{/if}
		</div>
		<div class="fieldset">
			<!-- usuário invisível: ajuda o gerenciador de senhas do navegador a reconhecer o login -->
			<input class="sr-only" type="text" name="username" autocomplete="username" value="pyle" tabindex="-1" aria-hidden="true" readonly />
			<label class="label" for="pw">senha</label>
			<input id="pw" class="field" type="password" name="password" autocomplete="current-password" bind:value={password} required />
			{#if error}<p class="err" role="alert">{error}</p>{/if}
			<button class="btn primary" disabled={busy || !password}>{busy ? 'entrando…' : 'entrar'}</button>
		</div>
	</form>

	<h1 class="title-xl wordmark">πύλη</h1>
</div>

<style>
	.login {
		height: 100dvh;
		min-height: 560px;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
	}
	.top {
		padding: 18px 0 14px;
	}
	.top .label {
		grid-column: 1 / span 6;
	}
	.right {
		grid-column: 7 / span 6;
		justify-self: end;
	}
	.mid {
		min-height: 0;
		align-items: stretch;
	}
	.door {
		grid-column: 1 / span 6;
		min-height: 0;
		height: 100%;
	}
	/* a foto ocupa toda a altura entre o topo e a palavra, inteira (sem corte) */
	.ph {
		display: block;
		height: 100%;
		width: auto;
		max-width: 100%;
		object-fit: contain;
		object-position: left center;
	}
	.fieldset {
		grid-column: 8 / span 4;
		align-self: center;
		display: grid;
		align-content: start;
		gap: 16px;
		justify-items: start;
	}
	.fieldset .field {
		width: 100%;
	}
	.fieldset .btn {
		padding: 10px 22px;
	}
	.err {
		color: var(--accent);
		font-size: var(--t-sm);
	}
	.wordmark {
		font-size: clamp(80px, 18vw, 240px);
		padding: 10px 0 var(--gutter);
	}
	@media (max-width: 720px) {
		.login {
			height: auto;
			min-height: 100dvh;
			grid-template-rows: auto auto auto;
		}
		.door,
		.fieldset {
			grid-column: 1 / -1;
		}
		.door {
			height: auto;
		}
		.ph {
			width: 100%;
			height: auto;
			max-height: 55vh;
		}
		.fieldset {
			margin: 24px 0;
		}
	}
</style>

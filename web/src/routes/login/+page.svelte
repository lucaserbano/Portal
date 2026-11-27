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

	<form class="grid" onsubmit={submit}>
		<div class="door">
			{#if photo}<img class="ph" src={photo.url} alt="" width={photo.w} height={photo.h} />{:else}<Doodle name="door" size={64} />{/if}
		</div>
		<div class="fieldset">
			<label class="label" for="pw">senha</label>
			<input
				id="pw"
				class="field"
				type="password"
				autocomplete="current-password"
				bind:value={password}
				required
			/>
			{#if error}<p class="err" role="alert">{error}</p>{/if}
			<button class="btn primary" disabled={busy || !password}>{busy ? 'entrando…' : 'entrar'}</button>
		</div>
	</form>

	<h1 class="title-xl wordmark">πύλη</h1>
</div>

<style>
	.login {
		min-height: 100dvh;
		display: grid;
		grid-template-rows: auto 1fr auto;
	}
	.top {
		padding: 18px 0 14px;
		border-bottom: var(--rule);
	}
	.top .label {
		grid-column: 1 / span 6;
	}
	.right {
		grid-column: 7 / span 6;
		justify-self: end;
	}
	form {
		align-content: center;
	}
	.door {
		grid-column: 1 / span 6;
		align-self: end;
	}
	.ph {
		display: block;
		max-width: 100%;
		max-height: 52vh;
		width: auto;
		height: auto; /* inteira */
	}
	.fieldset {
		grid-column: 7 / span 4;
		display: grid;
		gap: 16px;
		justify-items: start;
	}
	.err {
		color: var(--accent);
		font-size: var(--t-sm);
	}
	.wordmark {
		font-size: clamp(80px, 18vw, 240px);
		padding-bottom: var(--gutter);
		border-top: var(--rule);
		padding-top: 12px;
	}
	@media (max-width: 720px) {
		.door {
			grid-column: 1 / -1;
		}
		.fieldset {
			grid-column: 1 / -1;
		}
	}
</style>

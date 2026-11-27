<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { api, auth } from '#lib/api.ts';

	let username = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);
	// a foto da sala de luz em tela cheia (privada: link assinado da API)
	let photo = $state<{ url: string } | null>(null);
	let loaded = $state(false);
	fetch(`${import.meta.env.VITE_API_URL}/public/login-image`)
		.then((r) => r.json())
		.then((d) => (photo = d.photo))
		.catch(() => {});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		error = '';
		try {
			const { token } = await api<{ token: string }>('/auth/login', {
				method: 'POST',
				body: JSON.stringify({ username, password })
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

<div class="login">
	{#if photo}<img class="bg" class:on={loaded} src={photo.url} alt="" onload={() => (loaded = true)} />{/if}
	<div class="shade"></div>

	<div class="page content">
		<div class="top">
			<span>πύλη — portal</span>
			<span class="meta">acesso restrito</span>
		</div>

		<form onsubmit={submit}>
			<label for="user">login</label>
			<input id="user" type="text" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" bind:value={username} required />
			<label for="pw">senha</label>
			<input id="pw" type="password" name="password" autocomplete="current-password" bind:value={password} required />
			{#if error}<p class="err" role="alert">{error}</p>{/if}
			<button disabled={busy || !password || !username}>{busy ? 'entrando…' : 'entrar'}</button>
		</form>

		<h1 class="wordmark">πύλη</h1>
	</div>
</div>

<style>
	/* sempre sobre a foto: cores fixas (não mudam com o modo noturno) */
	.login {
		position: relative;
		min-height: 100dvh;
		background: #000;
		color: #fff;
		overflow: hidden;
	}
	.bg {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover; /* ocupa a tela toda */
		object-position: center 60%;
		opacity: 0;
		transition: opacity 0.6s ease-out;
	}
	.bg.on {
		opacity: 1;
	}
	/* sombra suave para o texto ficar legível em cima da foto */
	.shade {
		position: fixed;
		inset: 0;
		background: linear-gradient(90deg, rgb(0 0 0 / 0.55) 0%, rgb(0 0 0 / 0.25) 45%, rgb(0 0 0 / 0) 70%),
			linear-gradient(0deg, rgb(0 0 0 / 0.5) 0%, rgb(0 0 0 / 0) 35%);
	}
	.content {
		position: relative;
		min-height: 100dvh;
		display: grid;
		grid-template-rows: auto 1fr auto;
	}
	.top {
		display: flex;
		justify-content: space-between;
		padding: 18px 0 14px;
		font-size: var(--t-sm);
	}
	.top .meta {
		color: rgb(255 255 255 / 0.7);
	}
	form {
		align-self: center;
		width: min(340px, 100%);
		display: grid;
		gap: 6px;
	}
	label {
		font-size: var(--t-sm);
		color: rgb(255 255 255 / 0.8);
		margin-top: 12px;
	}
	input {
		width: 100%;
		padding: 10px 0;
		border: 0;
		border-bottom: 1px solid rgb(255 255 255 / 0.85);
		border-radius: 0;
		background: transparent;
		color: #fff;
		font-size: 16px;
		outline: none;
	}
	input:focus {
		border-bottom: 2px solid #ff006f;
		padding-bottom: 9px;
	}
	input:-webkit-autofill,
	input:-webkit-autofill:focus {
		-webkit-text-fill-color: #fff;
		-webkit-box-shadow: 0 0 0 1000px transparent inset;
		caret-color: #fff;
	}
	button {
		justify-self: start;
		margin-top: 22px;
		padding: 11px 26px;
		border: 0;
		background: #ff006f;
		color: #fff;
		font-size: var(--t-sm);
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.55;
		cursor: default;
	}
	button:not(:disabled):hover {
		background: #fff;
		color: #000;
	}
	.err {
		color: #fff;
		background: #ff006f;
		padding: 6px 10px;
		font-size: var(--t-sm);
		justify-self: start;
		margin-top: 10px;
	}
	.wordmark {
		font-size: clamp(80px, 18vw, 240px);
		line-height: 0.9;
		letter-spacing: -0.03em;
		padding-bottom: var(--gutter);
		font-weight: 400;
	}
</style>

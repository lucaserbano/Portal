<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { api, auth } from '#lib/api.ts';
	import type { LayoutProps } from './$types';
	import Intro from '#lib/components/Intro.svelte';

	let { children }: LayoutProps = $props();

	const nav = [
		{ href: '/', label: 'quadros' },
		{ href: '/inbox', label: 'inbox' },
		{ href: '/agenda', label: 'agenda' },
		{ href: '/formularios', label: 'formulários' },
		{ href: '/clientes', label: 'clientes' }
	] as const;

	const isLogin = $derived(page.route.id === '/login');
	// formulário público (/f/slug): sem login e sem o menu do portal
	const isPublic = $derived(/^\/(f|t|c)\//.test(page.route.id ?? ''));

	$effect(() => {
		if (!isLogin && !isPublic && !auth.token) goto(resolve('/login'));
	});

	function active(href: string) {
		const id = page.route.id ?? '';
		return href === '/' ? id === '/' || id.startsWith('/b/') : id.startsWith(href);
	}

	// Abertura: toda vez que se chega à página principal (login, recarregar, voltar para "quadros")
	let showIntro = $state(false);
	let introKey = $state(0);
	let lastRoute = '';
	$effect(() => {
		const id = page.route.id ?? '';
		if (id === '/' && lastRoute !== '/' && auth.token) {
			showIntro = true;
			introKey++;
		}
		lastRoute = id;
	});

	let theme = $state(document.documentElement.dataset.theme ?? 'light');
	function toggleTheme() {
		theme = theme === 'dark' ? 'light' : 'dark';
		document.documentElement.dataset.theme = theme;
		localStorage.setItem('pyle.theme', theme);
	}
	$effect(() => {
		document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#000000' : '#ffffff');
	});

	async function logout() {
		await api('/auth/logout', { method: 'POST' }).catch(() => {});
		auth.clear();
		goto(resolve('/login'));
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if isLogin || isPublic}
	{@render children()}
{:else if auth.token}
	<header class="page top">
		<div class="bar grid">
			<a class="brand" href={resolve('/')}>πύλη</a>
			<nav aria-label="Principal">
				{#each nav as item (item.href)}
					<a href={resolve(item.href)} class:on={active(item.href)} aria-current={active(item.href) ? 'page' : undefined}
						>{item.label}</a
					>
				{/each}
			</nav>
			<span class="right">
				<a class="out" href={resolve('/ajustes')} class:on={active('/ajustes')}>ajustes</a>
				<button class="out" onclick={toggleTheme} aria-label="Alternar modo noturno">{theme === 'dark' ? 'dia' : 'noite'}</button>
				<button class="out" onclick={logout}>sair</button>
			</span>
		</div>
	</header>
	<main class="page">
		{@render children()}
	</main>
	{#if showIntro}
		{#key introKey}<Intro ondone={() => (showIntro = false)} />{/key}
	{/if}
{/if}

<style>
	.top {
		padding-bottom: 0;
	}
	.bar {
		align-items: baseline;
		padding: 18px 0 14px;
		border-bottom: var(--rule);
		margin-bottom: calc(var(--gutter) * 1.5);
	}
	.brand {
		grid-column: 1 / span 2;
		font-size: 20px;
		letter-spacing: 0.02em;
		text-decoration: none;
	}
	nav {
		grid-column: 3 / span 8;
		display: flex;
		flex-wrap: wrap;
		gap: 4px 28px;
		font-size: var(--t-sm);
	}
	nav a {
		text-decoration: none;
	}
	nav a:hover,
	nav a.on {
		text-decoration: underline;
		text-decoration-color: var(--accent);
		text-decoration-thickness: 2px;
		text-underline-offset: 5px;
	}
	.right {
		grid-column: 11 / span 2;
		justify-self: end;
		display: flex;
		gap: 18px;
	}
	.out {
		background: none;
		border: 0;
		padding: 0;
		font-size: var(--t-sm);
		cursor: pointer;
	}
	.out:hover,
	.out.on {
		color: var(--accent);
	}
	a.out {
		text-decoration: none;
	}
	@media (max-width: 720px) {
		.brand {
			grid-column: 1 / span 6;
		}
		.right {
			grid-column: 7 / span 6;
		}
		nav {
			grid-row: 2;
			grid-column: 1 / -1;
			gap: 4px 20px;
		}
	}
</style>

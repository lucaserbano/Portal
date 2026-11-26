<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { api, auth } from '#lib/api.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const nav = [
		{ href: '/', label: 'quadros' },
		{ href: '/inbox', label: 'inbox' },
		{ href: '/agenda', label: 'agenda' },
		{ href: '/formularios', label: 'formulários' },
		{ href: '/clientes', label: 'clientes' }
	] as const;

	const isLogin = $derived(page.route.id === '/login');

	$effect(() => {
		if (!isLogin && !auth.token) goto(resolve('/login'));
	});

	function active(href: string) {
		const id = page.route.id ?? '';
		return href === '/' ? id === '/' || id.startsWith('/b/') : id.startsWith(href);
	}

	async function logout() {
		await api('/auth/logout', { method: 'POST' }).catch(() => {});
		auth.clear();
		goto(resolve('/login'));
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if isLogin}
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
			<button class="out" onclick={logout}>sair</button>
		</div>
	</header>
	<main class="page">
		{@render children()}
	</main>
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
	.out {
		grid-column: 11 / span 2;
		justify-self: end;
		background: none;
		border: 0;
		padding: 0;
		font-size: var(--t-sm);
		cursor: pointer;
	}
	.out:hover {
		color: var(--accent);
	}
	@media (max-width: 720px) {
		.brand {
			grid-column: 1 / span 6;
		}
		.out {
			grid-column: 7 / span 6;
		}
		nav {
			grid-row: 2;
			grid-column: 1 / -1;
			gap: 4px 20px;
		}
	}
</style>

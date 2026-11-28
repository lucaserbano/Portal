<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { api, auth } from '#lib/api.ts';
	import type { LayoutProps } from './$types';
	import Intro from '#lib/components/Intro.svelte';
	import Symbol from '#lib/components/Symbol.svelte';
	import { theme, setTheme } from '#lib/theme.svelte.ts';

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

	// lista de quadros do menu "quadros"
	let boardsOpen = $state(false);
	let boardList = $state<{ id: string; name: string }[]>([]);
	async function toggleBoards() {
		boardsOpen = !boardsOpen;
		if (boardsOpen) boardList = (await api<{ boards: { id: string; name: string }[] }>('/boards')).boards;
	}
	function closeMenus(e: MouseEvent) {
		if (boardsOpen && !(e.target as HTMLElement).closest('.qwrap')) boardsOpen = false;
	}

	const toggleTheme = () => setTheme(theme.v === 'dark' ? 'light' : 'dark');
	$effect(() => {
		document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.v === 'dark' ? '#000000' : '#ffffff');
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

<svelte:window onclick={closeMenus} onkeydown={(e) => e.key === 'Escape' && (boardsOpen = false)} />

{#if isLogin || isPublic}
	{@render children()}
{:else if auth.token}
	<header class="page top">
		<div class="bar grid">
			<a class="brand" href={resolve('/')} aria-label="πύλη, quadros"><Symbol size={22} /><span lang="el">πύλη</span></a>
			<nav aria-label="Principal">
				{#each nav as item (item.href)}
					{#if item.href === '/'}
						<!-- "quadros" abre a lista para ir direto a um quadro -->
						<span class="qwrap">
							<button class="qbtn" class:on={active('/')} aria-expanded={boardsOpen} aria-haspopup="menu" onclick={toggleBoards}
								>quadros <span class="caret">{boardsOpen ? '▴' : '▾'}</span></button
							>
							{#if boardsOpen}
								<div class="qmenu" role="menu">
									{#each boardList as b (b.id)}
										<a role="menuitem" href={resolve('/b/[id]', { id: b.id })} class:cur={page.params.id === b.id} onclick={() => (boardsOpen = false)}>{b.name}</a>
									{/each}
									<a role="menuitem" class="sub" href={resolve('/inbox')} onclick={() => (boardsOpen = false)}>Inbox</a>
									<a role="menuitem" class="sub" href={resolve('/')} onclick={() => (boardsOpen = false)}>todos os quadros</a>
								</div>
							{/if}
						</span>
					{:else}
						<a href={resolve(item.href)} class:on={active(item.href)} aria-current={active(item.href) ? 'page' : undefined}>{item.label}</a>
					{/if}
				{/each}
			</nav>
			<span class="right">
				<a class="out" href={resolve('/galeria')} class:on={active('/galeria')}>galeria</a>
				<a class="out" href={resolve('/ajustes')} class:on={active('/ajustes')}>ajustes</a>
				<button class="out" onclick={toggleTheme} aria-label="Alternar modo noturno">{theme.v === 'dark' ? 'dia' : 'noite'}</button>
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
		/* no app do iPhone a página vai até debaixo da barra de status, onde o iOS põe um degradê:
		   o menu começa abaixo dessa área */
		padding: max(18px, calc(env(safe-area-inset-top, 0px) + 14px)) 0 14px;
		border-bottom: var(--rule);
		margin-bottom: calc(var(--gutter) * 1.5);
	}
	.brand {
		grid-column: 1 / span 2;
		display: inline-flex;
		align-items: center;
		gap: 9px;
		align-self: center;
		font-size: 22px;
		font-weight: 900;
		letter-spacing: -0.03em;
		line-height: 1;
		text-decoration: none;
	}
	nav {
		grid-column: 3 / span 6;
		display: flex;
		flex-wrap: wrap;
		gap: 4px 28px;
		font-size: var(--t-sm);
	}
	nav a {
		text-decoration: none;
	}
	.qwrap {
		position: relative;
	}
	.qbtn {
		background: none;
		border: 0;
		padding: 0;
		font: inherit;
		color: inherit;
		cursor: pointer;
	}
	.qbtn.on,
	.qbtn:hover {
		text-decoration: underline;
		text-decoration-color: var(--accent);
		text-decoration-thickness: 2px;
		text-underline-offset: 5px;
	}
	.caret {
		font-size: 10px;
		color: var(--grey);
	}
	.qmenu {
		position: absolute;
		top: calc(100% + 10px);
		left: -12px;
		z-index: 30;
		min-width: 220px;
		background: var(--white);
		border: var(--rule);
		display: grid;
	}
	.qmenu a {
		padding: 11px 14px;
		border-bottom: var(--rule-soft);
		font-size: var(--t-md);
	}
	.qmenu a:hover,
	.qmenu a.cur {
		background: var(--black);
		color: var(--white);
		text-decoration: none;
	}
	.qmenu a.sub {
		font-size: var(--t-sm);
		color: var(--grey);
	}
	.qmenu a.sub:last-child {
		border-bottom: 0;
	}
	nav a:hover,
	nav a.on {
		text-decoration: underline;
		text-decoration-color: var(--accent);
		text-decoration-thickness: 2px;
		text-underline-offset: 5px;
	}
	.right {
		grid-column: 9 / span 4;
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
			gap: 4px 18px;
		}
	}
</style>

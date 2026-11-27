<script lang="ts">
	import SectionPhoto from '#lib/components/SectionPhoto.svelte';
	import { api } from '#lib/api.ts';
	import { widgetScript } from '#lib/scriptable.ts';

	const API = import.meta.env.VITE_API_URL as string;
	const SITE = location.origin + (import.meta.env.BASE_URL ?? '/');
	let active = $state<boolean | null>(null);
	let script = $state('');
	let copied = $state('');
	let confirmOff = $state(false);
	api<{ active: boolean }>('/widget/status').then((d) => (active = d.active));

	async function generate() {
		const r = await api<{ url: string }>('/widget/token', { method: 'POST' });
		script = widgetScript(r.url, SITE);
		active = true;
	}
	async function off() {
		if (!confirmOff) {
			confirmOff = true;
			setTimeout(() => (confirmOff = false), 3000);
			return;
		}
		await api('/widget/token', { method: 'DELETE' });
		active = false;
		script = '';
	}
	async function copy(text: string, what: string) {
		await navigator.clipboard.writeText(text);
		copied = what;
		setTimeout(() => (copied = ''), 1800);
	}
	const mcpUrl = `${API}/mcp`;
</script>

<section class="head">
	<h1 class="title-xl">Ajustes</h1>
</section>

<div class="ajph"><SectionPhoto seed="ajustes" height={160} /></div>

<div class="cols">
	<section class="block">
		<h2 class="title-lg">Widget do iPhone</h2>
		<p class="label">Mostra na tela inicial: tarefas atrasadas, as de hoje, as dos próximos 3 dias e os eventos de hoje. Tocar abre o portal.</p>

		{#if script}
			<ol class="steps">
				<li>Instale o app <b>Scriptable</b> (grátis) na App Store.</li>
				<li>
					Copie o script:
					<button class="btn dark" onclick={() => copy(script, 'script')}>{copied === 'script' ? 'copiado ✓' : 'copiar script'}</button>
				</li>
				<li>No Scriptable, toque em <b>+</b>, cole o script e dê o nome <b>πύλη</b>. Toque em ▶ para ver a prévia.</li>
				<li>Na tela inicial, segure num espaço vazio → <b>Editar</b> → <b>Adicionar Widget</b> → <b>Scriptable</b> → escolha o tamanho → <b>Adicionar</b>.</li>
				<li>Segure o widget → <b>Editar Widget</b> → em <b>Script</b>, escolha <b>πύλη</b>.</li>
			</ol>
			<p class="meta">O script tem uma chave só de leitura: ela não altera nada no portal. Gerar outra desliga a anterior.</p>
			<details>
				<summary class="meta">ver o script</summary>
				<pre>{script}</pre>
			</details>
		{:else}
			<p class="meta">{active ? 'Há um widget ligado. Para instalar em outro aparelho, gere um script novo (o antigo para de funcionar).' : 'Nenhum widget ligado.'}</p>
			<button class="btn dark" onclick={generate}>{active ? 'gerar script novo' : 'gerar script do widget'}</button>
		{/if}
		{#if active}<button class="link danger" onclick={off}>{confirmOff ? 'toque de novo para desligar' : 'desligar o widget'}</button>{/if}
	</section>

	<section class="block">
		<h2 class="title-lg">Claude no πύλη</h2>
		<p class="label">
			Com o conector, o app do Claude (no site, no Mac ou no iPhone) lê e cria coisas aqui: tarefas (inclusive a partir de um documento que você anexar), checklists,
			temas e roteiros na voz do cliente, eventos na agenda e respostas de formulários. Grátis, sem chave de API.
		</p>
		<ol class="steps">
			<li>
				Copie o endereço do conector:
				<span class="url meta">{mcpUrl}</span>
				<button class="btn dark" onclick={() => copy(mcpUrl, 'mcp')}>{copied === 'mcp' ? 'copiado ✓' : 'copiar endereço'}</button>
			</li>
			<li>No <b>claude.ai</b> (pelo computador): <b>Configurações</b> → <b>Conectores</b> → <b>Adicionar conector personalizado</b>.</li>
			<li>Nome: <b>πύλη</b>. URL: cole o endereço. Toque em <b>Adicionar</b> e depois em <b>Conectar</b>.</li>
			<li>Abre uma página preta do πύλη: digite a <b>senha do portal</b> e toque em <b>permitir</b>.</li>
			<li>Pronto. Numa conversa, ative o πύλη no menu de ferramentas e peça, por exemplo: “crie as tarefas deste briefing no quadro Social Media”.</li>
		</ol>
		<p class="meta">O conector vale também no app do iPhone, depois de adicionado pelo site. Para desconectar, remova-o nas configurações do Claude.</p>
	</section>
</div>

<style>
	.head {
		padding-bottom: 14px;
		border-bottom: var(--rule);
		margin-bottom: 22px;
	}
	.cols {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: calc(var(--gutter) * 2);
		align-items: start;
	}
	.block {
		display: grid;
		gap: 14px;
		border-top: 2px solid var(--black);
		padding-top: 12px;
		min-width: 0;
	}
	.steps {
		margin: 0;
		padding-left: 22px;
		display: grid;
		gap: 12px;
		font-size: var(--t-sm);
	}
	.steps li {
		display: grid;
		gap: 6px;
		justify-items: start;
	}
	.steps b {
		font-weight: 600;
	}
	.btn.dark {
		background: var(--black);
		border-color: var(--black);
		color: var(--white);
		justify-self: start;
	}
	.url {
		overflow-wrap: anywhere;
	}
	.link {
		justify-self: start;
		background: none;
		border: 0;
		padding: 0;
		font-size: var(--t-sm);
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
		color: var(--black);
	}
	.link.danger:hover {
		color: var(--accent);
	}
	pre {
		font: 11px/1.4 var(--mono);
		background: var(--code-bg);
		padding: 12px;
		overflow: auto;
		max-height: 320px;
	}
	@media (max-width: 800px) {
		.cols {
			grid-template-columns: 1fr;
		}
		.title-xl {
			font-size: clamp(40px, 12vw, 64px);
		}
	}
</style>

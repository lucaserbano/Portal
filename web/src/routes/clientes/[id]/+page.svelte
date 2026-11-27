<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { api } from '#lib/api.ts';
	import { fmtShort, plural } from '#lib/model.ts';
	import ScriptPanel, { FORMATS, STATUS, claudeLink, formatColor, formatName, profileText, statusName, type ClientProfile } from '#lib/components/ScriptPanel.svelte';
	import TaskPanel from '#lib/components/TaskPanel.svelte';
	import Destination from '#lib/components/Destination.svelte';

	type BrandKey = 'brand_text' | 'brand_bg' | 'brand_section' | 'brand_question' | 'brand_accent';
	type Client = ClientProfile & { id: string; notes: string; brand_logo: string | null } & Record<BrandKey, string | null>;
	type Theme = { id: string; title: string; notes: string; pillar: string; format: string; status: string; task_id: string | null; created_at: number };
	type Script = { id: string; theme_id: string | null; title: string; format: string; status: string; task_id: string | null; updated_at: number; excerpt: string; images: number };
	type Tpl = { id: string; name: string; format: string };

	const cid = $derived(page.params.id!);
	let client = $state<Client | null>(null);
	let themes = $state<Theme[]>([]);
	let scripts = $state<Script[]>([]);
	let templates = $state<Tpl[]>([]);
	let error = $state('');
	let tab = $state<'temas' | 'roteiros' | 'perfil'>(page.url.searchParams.get('novo') ? 'perfil' : page.url.searchParams.get('roteiro') ? 'roteiros' : 'temas');
	let openScript = $state<string | null>(page.url.searchParams.get('roteiro')); // link do lembrete abre o roteiro
	let openTask = $state<string | null>(null);
	let flash = $state('');

	async function load() {
		try {
			const d = await api<{ client: Client; themes: Theme[]; scripts: Script[] }>(`/clients/${cid}`);
			client = d.client;
			themes = d.themes;
			scripts = d.scripts;
		} catch (e) {
			error = (e as Error).message;
		}
	}
	load();
	api<{ templates: Tpl[] }>('/script-templates').then((d) => (templates = d.templates));

	function say(m: string) {
		flash = m;
		setTimeout(() => (flash = ''), 2500);
	}

	// ---------- Perfil ----------
	async function saveClient(p: Partial<Client>) {
		if (!client) return;
		Object.assign(client, p);
		await api(`/clients/${cid}`, { method: 'PATCH', body: JSON.stringify(p) });
		say('salvo');
	}
	let confirmArchive = $state(false);
	async function archive() {
		if (!confirmArchive) {
			confirmArchive = true;
			setTimeout(() => (confirmArchive = false), 4000);
			return;
		}
		await api(`/clients/${cid}`, { method: 'DELETE' });
		goto(resolve('/clientes'));
	}
	const PROFILE: [keyof Client, string, string][] = [
		['handle', '@ no Instagram', '@cliente'],
		['niche', 'nicho / o que faz', 'ex.: clínica de estética em Curitiba'],
		['audience', 'público', 'quem segue e quem queremos atingir'],
		['voice', 'tom de voz', 'ex.: próximo, leve, sem jargão técnico, frases curtas'],
		['pillars', 'linhas editoriais', 'uma por linha: educativo, bastidores, prova social…'],
		['dos', 'fazer / palavras que usa', 'expressões, emojis, assuntos bem-vindos'],
		['donts', 'evitar', 'assuntos, palavras ou formatos proibidos'],
		['refs', 'referências', 'links de perfis ou posts, um por linha'],
		['notes', 'observações', '']
	];
	// linhas editoriais: as do perfil + as que já aparecem nos temas ("Vendas, Educação" conta nas duas)
	const linesOf = (p: string) => p.split(',').map((x) => x.trim()).filter(Boolean);
	const pillars = $derived(
		[...new Set([...(client?.pillars.split('\n') ?? []).map((x) => x.trim()).filter(Boolean), ...themes.flatMap((t) => linesOf(t.pillar))])].sort((a, b) =>
			a.localeCompare(b, 'pt-BR')
		)
	);
	const hasLine = (t: Theme, l: string) => linesOf(t.pillar).includes(l);

	// ---------- Temas ----------
	let newTitle = $state('');
	let newFormat = $state('reels');
	let newPillar = $state('');
	let typingPillar = $state<string | null>(null); // onde está digitando uma linha nova
	let bulk = $state(false);
	let bulkText = $state('');
	let themeFilter = $state<string>('abertos'); // status
	let pillarFilter = $state(''); // linha editorial ('' = todas)
	let formatFilter = $state(''); // formato ('' = todos)
	let openTheme = $state<string | null>(null);
	let taskFor = $state<string | null>(null);

	const isOpen = (st: string) => st !== 'postado' && st !== 'descartado';
	const byStatus = (st: string, k: string) => (k === 'todos' ? true : k === 'abertos' ? isOpen(st) : st === k);
	// os filtros se somam: status + linha editorial + formato
	const themesPF = $derived(themes.filter((t) => (!pillarFilter || hasLine(t, pillarFilter)) && (!formatFilter || t.format === formatFilter)));
	const shownThemes = $derived(themesPF.filter((t) => byStatus(t.status, themeFilter)));
	const countBy = (k: string) => themesPF.filter((t) => byStatus(t.status, k)).length;
	const STATUS_FILTERS = [['abertos', 'em aberto'], ...STATUS, ['todos', 'todos']] as const;

	async function addTheme(e: SubmitEvent) {
		e.preventDefault();
		if (!newTitle.trim()) return;
		const title = newTitle;
		newTitle = '';
		await api(`/clients/${cid}/themes`, { method: 'POST', body: JSON.stringify({ title, format: newFormat, pillar: newPillar.trim() }) });
		await load();
	}

	// "Título | formato | pilar | ideia" (uma linha por tema; só o título é obrigatório)
	const guessFormat = (s: string) => {
		const x = s.toLowerCase();
		if (/carrossel|carousel/.test(x)) return 'carrossel';
		if (/est[aá]tico|post|imagem/.test(x)) return 'estatico';
		if (/stor/.test(x)) return 'stories';
		if (/reel|v[ií]deo/.test(x)) return 'reels';
		return '';
	};
	const bulkItems = $derived(
		bulkText
			.split('\n')
			.map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
			.filter(Boolean)
			.map((l) => {
				const [title, f = '', pillar = '', ...rest] = l.split('|').map((x) => x.trim());
				return { title: title.replace(/\*\*/g, ''), format: guessFormat(f) || 'reels', pillar, notes: rest.join(' | ') };
			})
	);
	async function addBulk() {
		if (!bulkItems.length) return;
		await api(`/clients/${cid}/themes`, { method: 'POST', body: JSON.stringify({ items: bulkItems }) });
		say(`${plural(bulkItems.length, 'tema')} adicionados`);
		bulkText = '';
		bulk = false;
		await load();
	}

	async function patchTheme(t: Theme, p: Partial<Theme>) {
		Object.assign(t, p);
		await api(`/themes/${t.id}`, { method: 'PATCH', body: JSON.stringify(p) });
	}
	let confirmTheme = $state<string | null>(null);
	async function delTheme(t: Theme) {
		if (confirmTheme !== t.id) {
			confirmTheme = t.id;
			setTimeout(() => (confirmTheme = null), 3000);
			return;
		}
		themes = themes.filter((x) => x.id !== t.id);
		await api(`/themes/${t.id}`, { method: 'DELETE' });
	}
	async function themeTask(t: Theme, dest: { board_id?: string; list_id?: string | null }) {
		const r = await api<{ id: string }>(`/themes/${t.id}/task`, { method: 'POST', body: JSON.stringify(dest) });
		t.task_id = r.id;
		taskFor = null;
		openTask = r.id;
	}

	// ---------- Roteiros ----------
	let tplId = $state('');
	let scriptFilter = $state<string>('abertos');
	const shownScripts = $derived(scripts.filter((s) => byStatus(s.status, scriptFilter)));
	async function newScript(theme?: Theme) {
		const { id } = await api<{ id: string }>(`/clients/${cid}/scripts`, {
			method: 'POST',
			body: JSON.stringify({ theme_id: theme?.id, template_id: tplId || undefined, title: theme ? undefined : 'Novo roteiro' })
		});
		await load();
		openScript = id;
	}
	const themeTitle = (id: string | null) => themes.find((t) => t.id === id)?.title;

	// ---------- Marca (manual de marca): cores e logotipo das páginas que o cliente vê ----------
	const BRAND: [BrandKey, string, string][] = [
		['brand_text', 'textos', '#000000'],
		['brand_bg', 'plano de fundo', '#ffffff'],
		['brand_section', 'fundo das perguntas', '#ffffff'],
		['brand_question', 'texto das perguntas', '#000000'],
		['brand_accent', 'destaque', '#ff006f']
	];
	const normHex = (v: string) => {
		const m = v.trim().replace(/^#?/, '#');
		return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(m) ? m.toLowerCase() : '';
	};
	// o seletor nativo só entende #rrggbb
	const full = (v: string) => (v.length === 4 ? '#' + [...v.slice(1)].map((c) => c + c).join('') : v);
	async function setBrand(k: BrandKey, v: string) {
		const h = normHex(v);
		if (v.trim() && !h) return say('cor inválida: use o código HEX, ex. #1a2b3c');
		await saveClient({ [k]: h || null } as Partial<Client>);
	}
	let logoBusy = $state(false);
	async function uploadLogo(f: File | undefined) {
		if (!f) return;
		if (f.size > 5 * 1024 * 1024) return say('imagem maior que 5 MB');
		logoBusy = true;
		try {
			const fd = new FormData();
			fd.append('file', f, f.name || 'logo.png');
			const r = await api<{ url: string }>(`/clients/${cid}/logo`, { method: 'POST', body: fd });
			if (client) client.brand_logo = r.url;
			say('logotipo salvo');
		} catch (e) {
			say((e as Error).message);
		} finally {
			logoBusy = false;
		}
	}
	async function removeLogo() {
		await api(`/clients/${cid}/logo`, { method: 'DELETE' });
		if (client) client.brand_logo = null;
		say('logotipo removido');
	}

	// ---------- Página do cliente (link público com as tarefas visíveis) ----------
	type ShareTask = { id: string; title: string; client_visible: number; done_at: number | null; due_at: number | null };
	let share = $state<{ url: string | null; tasks: ShareTask[] } | null>(null);
	$effect(() => {
		if (tab === 'perfil' && !share) api<{ url: string | null; tasks: ShareTask[] }>(`/clients/${cid}/share`).then((d) => (share = d));
	});
	async function setPage(enable: boolean) {
		const r = await api<{ url: string | null }>(`/clients/${cid}/share`, { method: 'PATCH', body: JSON.stringify({ enable }) });
		if (share) share.url = r.url;
	}
	async function setVisible(t: ShareTask, v: boolean) {
		t.client_visible = v ? 1 : 0;
		await api(`/tasks/${t.id}/share`, { method: 'PATCH', body: JSON.stringify({ client_visible: v }) });
	}
	async function copyText(t: string, msg: string) {
		await navigator.clipboard.writeText(t);
		say(msg);
	}

	// ---------- Claude ----------
	const ideasPrompt = $derived(
		client
			? (
					`Você é estrategista de conteúdo para Instagram. Sugira 10 temas novos para o cliente abaixo, variando formatos e pilares.\n\n${profileText(client)}\n\n` +
						(themes.length ? `Temas que já existem (não repita):\n${themes.slice(0, 60).map((t) => `- ${t.title}`).join('\n')}\n\n` : '') +
						`Responda SÓ com a lista, um tema por linha, neste formato exato (vou colar no meu sistema):\n` +
						`Título do tema | formato (Reels, Carrossel, Post estático ou Stories) | pilar | ideia em uma frase`
				)
			: ''
	);
	const ideasUrl = $derived(claudeLink(ideasPrompt));
</script>

{#snippet pillarPick(key: string, value: string, set: (v: string) => void)}
	{#if typingPillar === key}
		<input
			class="field pick"
			placeholder="nova linha editorial"
			autofocus
			onkeydown={(e) => {
				if (e.key === 'Enter') (e.preventDefault(), e.currentTarget.blur());
				if (e.key === 'Escape') typingPillar = null;
			}}
			onblur={(e) => {
				const v = e.currentTarget.value.trim();
				if (v) set(v);
				typingPillar = null;
			}}
		/>
	{:else}
		<select
			class="pick"
			{value}
			aria-label="Linha editorial"
			onchange={(e) => {
				const v = e.currentTarget.value;
				if (v === '__new') {
					e.currentTarget.value = value;
					typingPillar = key;
				} else set(v);
			}}
		>
			<option value="">sem linha editorial</option>
			{#if value && !pillars.includes(value)}<option {value}>{value}</option>{/if}
			{#each pillars as p (p)}<option value={p}>{p}</option>{/each}
			<option value="__new">+ nova linha…</option>
		</select>
	{/if}
{/snippet}

<p class="back meta"><a href={resolve('/clientes')}>← clientes</a></p>

{#if error}
	<p class="err">{error}</p>
{:else if client}
	<section class="head">
		<input
			class="name"
			value={client.name}
			aria-label="Nome do cliente"
			onchange={(e) => e.currentTarget.value.trim() && saveClient({ name: e.currentTarget.value.trim() })}
			onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
		/>
		<p class="meta">{client.handle || 'sem @'}{client.niche ? ` · ${client.niche}` : ''}</p>
	</section>

	<nav class="tabs">
		<button class:on={tab === 'temas'} onclick={() => (tab = 'temas')}>temas <span class="meta">{themes.filter((t) => isOpen(t.status)).length}</span></button>
		<button class:on={tab === 'roteiros'} onclick={() => (tab = 'roteiros')}>roteiros <span class="meta">{scripts.length}</span></button>
		<button class:on={tab === 'perfil'} onclick={() => (tab = 'perfil')}>perfil</button>
	</nav>

	{#if tab === 'temas'}
		<form class="add" onsubmit={addTheme}>
			<input class="field" placeholder="+ tema novo" bind:value={newTitle} />
			<select bind:value={newFormat} aria-label="Formato">
				{#each FORMATS as [v, n] (v)}<option value={v}>{n}</option>{/each}
			</select>
			{@render pillarPick('novo', newPillar, (v) => (newPillar = v))}
			<button class="btn dark" disabled={!newTitle.trim()}>adicionar</button>
		</form>
		<div class="tools">
			<button class="link" onclick={() => (bulk = !bulk)}>{bulk ? 'fechar' : 'colar vários'}</button>
			<a class="link" href={ideasUrl} target="_blank" rel="noopener">pedir temas ao Claude ↗</a>
			<button class="link" onclick={() => copyText(ideasPrompt, 'pedido copiado: cole no Claude')}>copiar pedido</button>
		</div>

		{#if bulk}
			<div class="box bulk">
				<p class="label">
					Um tema por linha. Opcional: <span class="meta">Título | formato | pilar | ideia</span>. Dica: peça temas ao Claude pelo link acima e cole a resposta aqui.
				</p>
				<textarea class="field" rows="6" bind:value={bulkText} placeholder="Mitos sobre botox | Carrossel | educativo | 5 mitos e verdades"></textarea>
				<div class="row">
					<button class="btn dark" disabled={!bulkItems.length} onclick={addBulk}>adicionar {plural(bulkItems.length, 'tema')}</button>
				</div>
			</div>
		{/if}

		<div class="filters">
			{#each STATUS_FILTERS as [k, n] (k)}
				<button class:on={themeFilter === k} onclick={() => (themeFilter = k)}>{n} <span class="meta">{countBy(k)}</span></button>
			{/each}
		</div>
		<div class="filters fmt">
			{#each FORMATS as [v, n] (v)}
				<button class:on={formatFilter === v} onclick={() => (formatFilter = formatFilter === v ? '' : v)}
					><i class="fsq" style:background={formatColor(v)}></i>{n} <span class="meta">{themes.filter((t) => t.format === v).length}</span></button
				>
			{/each}
		</div>
		{#if pillars.length}
			<div class="filters lines">
				<span class="meta">linha editorial</span>
				<button class:on={!pillarFilter} onclick={() => (pillarFilter = '')}>todas</button>
				{#each pillars as p (p)}
					<button class:on={pillarFilter === p} onclick={() => (pillarFilter = pillarFilter === p ? '' : p)}>{p} <span class="meta">{themes.filter((t) => hasLine(t, p)).length}</span></button>
				{/each}
			</div>
		{/if}

		<ul class="themes">
			{#each shownThemes as t (t.id)}
				<li class="theme" class:open={openTheme === t.id} class:off={t.status === 'descartado' || t.status === 'postado'} style:--fc={formatColor(t.format)}>
					<button class="trow" onclick={() => (openTheme = openTheme === t.id ? null : t.id)}>
						<span class="tt">{t.title}</span>
						<span class="meta"><b class="fname">{formatName(t.format)}</b>{t.pillar ? ` · ${t.pillar}` : ''}</span>
						<span class="st meta st-{t.status}">{statusName(t.status)}</span>
					</button>
					{#if openTheme === t.id}
						<div class="tedit">
							<input class="field" value={t.title} onchange={(e) => e.currentTarget.value.trim() && patchTheme(t, { title: e.currentTarget.value.trim() })} aria-label="Título" />
							<textarea class="field" rows="2" placeholder="ideia / observações" value={t.notes} onchange={(e) => patchTheme(t, { notes: e.currentTarget.value })}></textarea>
							<div class="row">
								<select value={t.format} onchange={(e) => patchTheme(t, { format: e.currentTarget.value })} aria-label="Formato">
									{#each FORMATS as [v, n] (v)}<option value={v}>{n}</option>{/each}
								</select>
								{@render pillarPick(t.id, t.pillar, (v) => patchTheme(t, { pillar: v }))}
							</div>
							<div class="seg">
								{#each STATUS as [v, n] (v)}<button class:on={t.status === v} onclick={() => patchTheme(t, { status: v })}>{n}</button>{/each}
							</div>
							<div class="tact">
								<select bind:value={tplId} aria-label="Modelo do roteiro">
									<option value="">roteiro sem modelo</option>
									{#each templates as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
								</select>
								<button class="btn dark" onclick={() => newScript(t)}>criar roteiro</button>
								{#if t.task_id}
									<button class="btn" onclick={() => (openTask = t.task_id)}>ver tarefa</button>
								{:else}
									<button class="btn" onclick={() => (taskFor = taskFor === t.id ? null : t.id)}>virar tarefa</button>
								{/if}
								<button class="link danger" onclick={() => delTheme(t)}>{confirmTheme === t.id ? 'confirmar' : 'apagar'}</button>
							</div>
							{#if taskFor === t.id}
								<div class="box dest">
									<button class="btn" onclick={() => themeTask(t, {})}>no inbox</button>
									<span class="meta">ou</span>
									<Destination label="criar aqui" onconfirm={(d) => themeTask(t, d)} oncancel={() => (taskFor = null)} />
								</div>
							{/if}
						</div>
					{/if}
				</li>
			{:else}
				<li class="meta empty">nenhum tema aqui</li>
			{/each}
		</ul>
	{:else if tab === 'roteiros'}
		<div class="add">
			<select bind:value={tplId} aria-label="Modelo">
				<option value="">sem modelo</option>
				{#each templates as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
			</select>
			<button class="btn dark" onclick={() => newScript()}>+ roteiro</button>
			<a class="link" href={resolve('/clientes/modelos')}>editar modelos</a>
		</div>
		<div class="filters">
			{#each STATUS_FILTERS as [k, n] (k)}
				<button class:on={scriptFilter === k} onclick={() => (scriptFilter = k)}>{n} <span class="meta">{scripts.filter((x) => byStatus(x.status, k)).length}</span></button>
			{/each}
		</div>
		<ul class="scripts">
			{#each shownScripts as s (s.id)}
				<li>
					<button class="scard" onclick={() => (openScript = s.id)} style:--fc={formatColor(s.format)}>
						<span class="meta"><b class="fname">{formatName(s.format)}</b> · <span class="st-{s.status}">{statusName(s.status)}</span></span>
						<span class="tt">{s.title}</span>
						{#if themeTitle(s.theme_id) && themeTitle(s.theme_id) !== s.title}<span class="meta">tema: {themeTitle(s.theme_id)}</span>{/if}
						<span class="ex">{s.excerpt}</span>
						<span class="meta">editado {fmtShort(s.updated_at)}{s.images ? ` · ${s.images} ${s.images === 1 ? 'imagem' : 'imagens'}` : ''}</span>
					</button>
				</li>
			{:else}
				<li class="meta empty">nenhum roteiro aqui. Crie um aqui ou a partir de um tema.</li>
			{/each}
		</ul>
	{:else}
		<p class="label grey intro">O perfil vai junto nos pedidos ao Claude (temas e roteiros), para ele escrever na voz do cliente. Salva sozinho.</p>
		<dl class="profile">
			{#each PROFILE as [k, label, ph] (k)}
				<dt>{label}</dt>
				<dd>
					{#if k === 'handle'}
						<input class="field" value={client[k]} placeholder={ph} onchange={(e) => saveClient({ [k]: e.currentTarget.value })} />
					{:else}
						<textarea class="field" rows={k === 'pillars' || k === 'refs' ? 4 : 2} value={String(client[k] ?? '')} placeholder={ph}
							onchange={(e) => saveClient({ [k]: e.currentTarget.value })}></textarea>
					{/if}
				</dd>
			{/each}
			<dt>marca</dt>
			<dd class="brand">
				<p class="meta">Cores e logotipo do manual de marca, nos formulários e na página de acompanhamento. O que ficar vazio usa o padrão do πύλη.</p>
				{#each BRAND as [k, label, ph] (k)}
					<div class="crow">
						<input type="color" class="swatch" class:empty={!client[k]} value={full(client[k] ?? ph)} aria-label={label}
							onchange={(e) => setBrand(k, e.currentTarget.value)} />
						<input class="field hex" value={client[k] ?? ''} placeholder={ph} spellcheck="false" autocomplete="off"
							onchange={(e) => setBrand(k, e.currentTarget.value)} />
						<span class="label">{label}</span>
						{#if client[k]}<button class="link" onclick={() => setBrand(k, '')}>limpar</button>{/if}
					</div>
				{/each}
				<div class="logo">
					{#if client.brand_logo}<img src={client.brand_logo} alt="logotipo" />{/if}
					<div class="row">
						<label class="btn">{logoBusy ? 'enviando…' : client.brand_logo ? 'trocar logotipo' : 'enviar logotipo'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden onchange={(e) => (uploadLogo(e.currentTarget.files?.[0]), (e.currentTarget.value = ''))} /></label>
						{#if client.brand_logo}<button class="link danger" onclick={removeLogo}>remover</button>{/if}
					</div>
					<p class="meta">Aparece no topo da página do cliente e dos formulários com esta marca (escolha a marca nos ajustes do formulário).</p>
				</div>
			</dd>

			<dt>página do cliente</dt>
			<dd class="share">
				<p class="meta">Um link para o cliente acompanhar as tarefas dele: etapa, prazo, progresso e o que já foi feito. Ligue uma tarefa a este cliente no painel da tarefa → “cliente”.</p>
				{#if share}
					{#if share.url}
						<p class="meta url">{share.url}</p>
						<div class="row">
							<button class="btn dark" onclick={() => copyText(share!.url!, 'link copiado')}>copiar link</button>
							<a class="btn" href={share.url} target="_blank" rel="noopener">ver ↗</a>
							<button class="link danger" onclick={() => setPage(false)}>desligar</button>
						</div>
					{:else}
						<button class="btn dark" onclick={() => setPage(true)}>gerar link</button>
					{/if}
					{#if share.tasks.length}
						<ul class="stasks">
							{#each share.tasks as t (t.id)}
								<li>
									<label class="opt"><input type="checkbox" checked={!!t.client_visible} onchange={(e) => setVisible(t, e.currentTarget.checked)} /> <span class:done={!!t.done_at}>{t.title}</span></label>
									<button class="link" onclick={() => (openTask = t.id)}>abrir</button>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="meta">Nenhuma tarefa ligada a este cliente ainda.</p>
					{/if}
				{/if}
			</dd>

			<dt></dt>
			<dd><button class="btn danger" onclick={archive}>{confirmArchive ? 'toque de novo para arquivar' : 'arquivar cliente'}</button></dd>
		</dl>
	{/if}
{:else}
	<p class="meta">carregando…</p>
{/if}

{#if flash}<p class="flash" role="status">{flash}</p>{/if}

{#if openScript && client}
	<ScriptPanel id={openScript} {client} onclose={() => (openScript = null)} onchange={load} onopentask={(tid) => ((openScript = null), (openTask = tid))} />
{/if}
{#if openTask}
	<TaskPanel id={openTask} onclose={() => (openTask = null)} onchange={load} />
{/if}

<style>
	.back {
		margin-bottom: 10px;
	}
	.back a {
		text-decoration: none;
	}
	.head {
		display: grid;
		gap: 6px;
		padding-bottom: 14px;
		border-bottom: var(--rule);
	}
	.name {
		font-size: var(--t-xl);
		line-height: 1;
		letter-spacing: -0.03em;
		border: 0;
		outline: none;
		background: none;
		padding: 0;
		width: 100%;
	}
	.name:focus {
		box-shadow: 0 2px 0 var(--accent);
	}
	.tabs {
		display: flex;
		gap: 22px;
		margin: 16px 0 18px;
		border-bottom: var(--rule-soft);
	}
	.tabs button {
		background: none;
		border: 0;
		padding: 8px 0;
		font-size: var(--t-md);
		cursor: pointer;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
	}
	.tabs button.on {
		border-bottom-color: var(--accent);
	}
	.add {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
		max-width: 860px;
	}
	.add .field {
		flex: 1;
		min-width: 180px;
	}
	select {
		border: var(--rule);
		border-radius: 0;
		background: var(--white);
		padding: 8px;
		font-size: var(--t-sm);
	}
	.btn.dark {
		background: var(--black);
		border-color: var(--black);
		color: var(--white);
	}
	.tools {
		display: flex;
		gap: 18px;
		margin: 10px 0 14px;
	}
	.link {
		background: none;
		border: 0;
		padding: 0;
		font-size: var(--t-sm);
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
		color: var(--black);
	}
	.link.danger:hover {
		color: var(--accent);
	}
	.bulk {
		padding: 12px;
		display: grid;
		gap: 10px;
		max-width: 860px;
		margin-bottom: 14px;
	}
	.bulk textarea {
		resize: vertical;
		font-size: var(--t-sm);
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 16px;
		margin: 6px 0 10px;
		font-size: var(--t-sm);
	}
	.filters button {
		background: none;
		border: 0;
		padding: 4px 0;
		cursor: pointer;
		color: var(--grey);
	}
	.filters button.on {
		color: var(--black);
		text-decoration: underline;
		text-decoration-color: var(--accent);
		text-decoration-thickness: 2px;
		text-underline-offset: 4px;
	}
	.themes,
	.scripts {
		list-style: none;
		margin: 0;
		padding: 0;
		max-width: 860px;
	}
	.themes {
		border-top: var(--rule);
	}
	.theme {
		border-bottom: var(--rule-soft);
		border-left: 4px solid var(--fc, var(--grey));
	}
	.theme .trow,
	.theme .tedit {
		padding-left: 12px;
	}
	.fname {
		font-weight: 600;
		color: var(--fc, inherit);
	}
	.fsq {
		display: inline-block;
		width: 10px;
		height: 10px;
		margin-right: 6px;
		vertical-align: -1px;
	}
	.filters .meta {
		color: inherit;
		opacity: 0.7;
	}
	.lines {
		align-items: baseline;
	}
	.pick {
		max-width: 220px;
	}
	input.pick {
		width: 200px;
		padding: 6px 0;
	}
	.theme.open {
		border-bottom: var(--rule);
		background: var(--white);
	}
	.theme.off .tt {
		color: var(--grey);
	}
	.trow {
		width: 100%;
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 4px 14px;
		align-items: baseline;
		background: none;
		border: 0;
		padding: 11px 0;
		text-align: left;
		cursor: pointer;
	}
	.tt {
		font-size: var(--t-md);
		overflow-wrap: anywhere;
	}
	.st {
		min-width: 74px;
		text-align: right;
	}
	.st-aprovado {
		color: var(--black);
	}
	.st-ideia {
		color: var(--grey);
	}
	.st-roteirizado {
		color: var(--accent);
	}
	.st-design {
		color: var(--accent);
		font-weight: 600;
	}
	.tedit {
		display: grid;
		gap: 10px;
		padding: 4px 0 16px;
	}
	.tedit textarea {
		resize: vertical;
		font-size: var(--t-sm);
	}
	.row {
		display: flex;
		gap: 10px;
		align-items: center;
		flex-wrap: wrap;
	}
	.seg {
		display: flex;
		flex-wrap: wrap;
	}
	.seg button {
		border: var(--rule);
		margin-left: -1px;
		background: var(--white);
		padding: 6px 10px;
		font-size: var(--t-sm);
		cursor: pointer;
	}
	.seg button:first-child {
		margin-left: 0;
	}
	.seg button.on {
		background: var(--black);
		color: var(--white);
	}
	.tact {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		align-items: center;
	}
	.tact .link {
		margin-left: auto;
	}
	.dest {
		padding: 10px;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}
	.scripts {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		border-top: var(--rule);
		border-left: var(--rule);
	}
	.scard {
		width: 100%;
		height: 100%;
		display: grid;
		align-content: start;
		gap: 6px;
		padding: 14px;
		background: var(--white);
		border: 0;
		border-right: var(--rule);
		border-bottom: var(--rule);
		text-align: left;
		cursor: pointer;
		min-height: 150px;
		box-shadow: inset 0 4px 0 var(--fc, transparent);
	}
	.scard .tt {
		font-size: var(--t-lg);
		line-height: 1.1;
	}
	.ex {
		font-size: var(--t-sm);
		color: var(--grey);
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	@media (hover: hover) {
		.scard:hover {
			background: var(--black);
			color: var(--white);
		}
	}
	.empty {
		padding: 14px 0;
	}
	.scripts .empty {
		padding: 14px;
		border-right: var(--rule);
		border-bottom: var(--rule);
	}
	.intro {
		max-width: 60ch;
		margin-bottom: 16px;
	}
	.grey {
		color: var(--grey);
	}
	.profile {
		display: grid;
		grid-template-columns: 200px 1fr;
		gap: 14px 16px;
		max-width: 860px;
		margin: 0;
	}
	.profile dt {
		font-size: var(--t-sm);
		color: var(--grey);
		padding-top: 6px;
	}
	.profile dd {
		margin: 0;
		min-width: 0;
	}
	.profile textarea {
		resize: vertical;
		padding: 6px 0;
	}
	.profile .field {
		padding: 6px 0;
	}
	.share,
	.brand {
		display: grid;
		gap: 8px;
	}
	.crow {
		display: grid;
		grid-template-columns: 34px 110px 1fr auto;
		gap: 10px;
		align-items: center;
	}
	.swatch {
		width: 34px;
		height: 34px;
		padding: 0;
		border: var(--rule);
		background: none;
		cursor: pointer;
	}
	.swatch::-webkit-color-swatch-wrapper {
		padding: 0;
	}
	.swatch::-webkit-color-swatch {
		border: 0;
	}
	.swatch.empty {
		opacity: 0.25;
	}
	.hex {
		font-family: var(--mono);
		text-transform: lowercase;
	}
	.logo {
		display: grid;
		gap: 8px;
		margin-top: 6px;
	}
	.logo img {
		max-width: 100%;
		max-height: 120px;
		object-fit: contain;
		object-position: left center;
		justify-self: start;
		border: var(--rule-soft);
	}
	.url {
		overflow-wrap: anywhere;
	}
	a.btn {
		text-decoration: none;
	}
	.stasks {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: var(--rule-soft);
	}
	.stasks li {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		padding: 7px 0;
		border-bottom: var(--rule-soft);
	}
	.stasks .done {
		text-decoration: line-through;
		color: var(--grey);
	}
	.btn.danger:hover {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	.err {
		color: var(--accent);
	}
	.flash {
		position: fixed;
		bottom: 20px;
		left: 50%;
		transform: translateX(-50%);
		background: var(--black);
		color: var(--white);
		padding: 10px 16px;
		font-size: var(--t-sm);
		z-index: 20;
	}
	@media (max-width: 720px) {
		.name {
			font-size: clamp(34px, 10vw, 56px);
		}
		.profile {
			grid-template-columns: 1fr;
			gap: 2px;
		}
		.profile dd {
			margin-bottom: 10px;
		}
		.trow {
			grid-template-columns: 1fr auto;
		}
		.trow .tt {
			grid-column: 1 / -1;
		}
		.st {
			min-width: 0;
		}
	}
</style>

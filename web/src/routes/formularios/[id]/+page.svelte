<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { api } from '#lib/api.ts';
	import { fmtLong } from '#lib/model.ts';
	import { TYPE_NAMES, type Field, type FieldType } from '#lib/components/FormFields.svelte';
	import TaskPanel from '#lib/components/TaskPanel.svelte';

	type Form = {
		id: string;
		slug: string;
		title: string;
		description: string;
		fields: Field[];
		open: number;
		notify: number;
		thanks: string;
		title_field: string | null;
		due_field: string | null;
		client_id: string | null;
	};
	type Answer = { id: string; label: string; value: string | string[] };
	type Resp = { id: string; answers: Answer[]; source: string; read_at: number | null; task_id: string | null; task_title: string | null; created_at: number };

	const fid = $derived(page.params.id!);
	let form = $state<Form | null>(null);
	let publicUrl = $state('');
	let emailReady = $state(false);
	let responses = $state<Resp[]>([]);
	let tab = $state<'perguntas' | 'respostas' | 'ajustes'>('perguntas');
	let clients = $state<{ id: string; name: string }[]>([]);
	api<{ clients: { id: string; name: string }[] }>('/clients').then((d) => (clients = d.clients));
	let error = $state('');
	let saved = $state<'' | 'salvando…' | 'salvo'>('');
	let flash = $state('');
	let openTask = $state<string | null>(null);
	let adding = $state(false);
	let onlyNew = $state(false);
	const skipped = page.url.searchParams.get('puladas');

	async function load() {
		try {
			const [f, r] = await Promise.all([
				api<{ form: Form; public_url: string; email_ready: boolean }>(`/forms/${fid}`),
				api<{ responses: Resp[] }>(`/forms/${fid}/responses`)
			]);
			form = f.form;
			publicUrl = f.public_url;
			emailReady = f.email_ready;
			responses = r.responses;
			lastSaved = JSON.stringify(form.fields);
			if (r.responses.some((x) => !x.read_at) && tab === 'perguntas' && !loadedOnce) tab = 'respostas';
			loadedOnce = true;
		} catch (e) {
			error = (e as Error).message;
		}
	}
	let loadedOnce = false;
	load();

	function say(m: string) {
		flash = m;
		setTimeout(() => (flash = ''), 2500);
	}

	// ---------- Salvar ----------
	async function patch(p: Partial<Form>) {
		saved = 'salvando…';
		try {
			await api(`/forms/${fid}`, { method: 'PATCH', body: JSON.stringify(p) });
			saved = 'salvo';
			setTimeout(() => saved === 'salvo' && (saved = ''), 1500);
		} catch (e) {
			saved = '';
			say((e as Error).message);
		}
	}
	// perguntas: salva sozinho 700 ms depois da última mudança
	let lastSaved = '';
	let timer: ReturnType<typeof setTimeout>;
	$effect(() => {
		if (!form) return;
		const snap = JSON.stringify(form.fields);
		if (snap === lastSaved) return;
		clearTimeout(timer);
		saved = 'salvando…';
		timer = setTimeout(() => {
			lastSaved = snap;
			patch({ fields: JSON.parse(snap) });
		}, 700);
	});

	// ---------- Perguntas ----------
	const NEW_TYPES: FieldType[] = ['short', 'long', 'choice', 'checks', 'select', 'date', 'email', 'phone', 'number', 'scale', 'section'];
	const hasOptions = (t: FieldType) => t === 'choice' || t === 'checks' || t === 'select';
	function addField(type: FieldType) {
		if (!form) return;
		const f: Field = { id: 'q_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12), type, label: '', required: false };
		if (hasOptions(type)) f.options = ['Opção 1', 'Opção 2'];
		if (type === 'scale') Object.assign(f, { min: 1, max: 5 });
		form.fields = [...form.fields, f];
		adding = false;
		requestAnimationFrame(() => document.getElementById('lbl-' + f.id)?.focus());
	}
	function moveField(i: number, d: number) {
		if (!form) return;
		const j = i + d;
		if (j < 0 || j >= form.fields.length) return;
		const arr = [...form.fields];
		[arr[i], arr[j]] = [arr[j], arr[i]];
		form.fields = arr;
	}
	function dupField(i: number) {
		if (!form) return;
		const c = { ...$state.snapshot(form.fields[i]), id: 'q_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12) };
		form.fields = [...form.fields.slice(0, i + 1), c, ...form.fields.slice(i + 1)];
	}
	let confirmDel = $state<string | null>(null);
	function delField(f: Field) {
		if (!form) return;
		if (confirmDel !== f.id) {
			confirmDel = f.id;
			setTimeout(() => (confirmDel = null), 3000);
			return;
		}
		form.fields = form.fields.filter((x) => x.id !== f.id);
	}
	function changeType(f: Field, t: FieldType) {
		f.type = t;
		if (hasOptions(t) && !f.options?.length) f.options = ['Opção 1', 'Opção 2'];
		if (t === 'scale' && f.max == null) Object.assign(f, { min: 1, max: 5 });
		if (t === 'section') f.required = false;
	}

	// ---------- Link ----------
	async function copyLink() {
		await navigator.clipboard.writeText(publicUrl);
		say('link copiado');
	}
	function shareLink() {
		if (navigator.share) navigator.share({ title: form?.title, url: publicUrl }).catch(() => {});
		else copyLink();
	}

	// ---------- Respostas ----------
	const unread = $derived(responses.filter((r) => !r.read_at).length);
	const shown = $derived(onlyNew ? responses.filter((r) => !r.read_at) : responses);
	const show = (v: string | string[]) => (Array.isArray(v) ? v.join(', ') : v);
	const fmtVal = (a: Answer) => {
		const v = show(a.value);
		return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : v;
	};

	async function setRead(r: Resp, read: boolean) {
		r.read_at = read ? Math.floor(Date.now() / 1000) : null;
		await api(`/responses/${r.id}`, { method: 'PATCH', body: JSON.stringify({ read }) });
	}
	async function toTask(r: Resp) {
		const t = await api<{ id: string; existed?: boolean }>(`/responses/${r.id}/task`, { method: 'POST' });
		r.task_id = t.id;
		r.read_at ??= Math.floor(Date.now() / 1000);
		say(t.existed ? 'essa resposta já tinha virado tarefa' : 'tarefa criada no inbox');
		openTask = t.id;
	}
	let confirmResp = $state<string | null>(null);
	async function delResp(r: Resp) {
		if (confirmResp !== r.id) {
			confirmResp = r.id;
			setTimeout(() => (confirmResp = null), 3000);
			return;
		}
		responses = responses.filter((x) => x.id !== r.id);
		await api(`/responses/${r.id}`, { method: 'DELETE' });
	}

	// "Abrir no Claude": leva a resposta pronta para o Claude transformar em tarefas e briefing
	function claudePrompt(r: Resp) {
		const body = r.answers.map((a) => `${a.label}: ${fmtVal(a) || '—'}`).join('\n');
		return (
			`Recebi esta resposta ao formulário “${form?.title}”. Transforme em: (1) um briefing curto e organizado; ` +
			`(2) uma lista de tarefas para o meu quadro, cada uma com título, descrição, checklist, prioridade (Bom, Preocupante ou Crítico) e prazo sugerido. ` +
			`Responda em português.\n\n${body}`
		);
	}
	async function copyPrompt(r: Resp) {
		await navigator.clipboard.writeText(claudePrompt(r));
		say('pedido copiado: cole no Claude');
	}
	function claudeUrl(r: Resp) {
		const body = r.answers.map((a) => `${a.label}: ${fmtVal(a) || '—'}`).join('\n');
		let q =
			`Recebi esta resposta ao formulário “${form?.title}”. Transforme em: (1) um briefing curto e organizado; ` +
			`(2) uma lista de tarefas para o meu quadro, cada uma com título, descrição, checklist, prioridade (Bom, Preocupante ou Crítico) e prazo sugerido. ` +
			`Responda em português.\n\n${body}`;
		if (q.length > 6000) q = q.slice(0, 6000) + '…';
		return `https://claude.ai/new?q=${encodeURIComponent(q)}`;
	}

	function csvCell(v: string) {
		return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
	}
	function exportCsv() {
		const labels: string[] = [];
		for (const r of responses) for (const a of r.answers) if (!labels.includes(a.label)) labels.push(a.label);
		const lines = [['data', ...labels].map(csvCell).join(',')];
		for (const r of [...responses].reverse()) {
			lines.push([fmtLong(r.created_at), ...labels.map((l) => fmtVal(r.answers.find((a) => a.label === l) ?? { id: '', label: '', value: '' }))].map(csvCell).join(','));
		}
		const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `${form?.slug ?? 'respostas'}.csv`;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	// ---------- Importar respostas antigas (.csv do Google Forms) ----------
	function parseCsv(text: string) {
		const rows: string[][] = [];
		let row: string[] = [];
		let cell = '';
		let q = false;
		const sep = text.split('\n')[0].split(';').length > text.split('\n')[0].split(',').length ? ';' : ',';
		for (let i = 0; i < text.length; i++) {
			const ch = text[i];
			if (q) {
				if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
				else if (ch === '"') q = false;
				else cell += ch;
			} else if (ch === '"') q = true;
			else if (ch === sep) row.push(cell), (cell = '');
			else if (ch === '\n') row.push(cell), rows.push(row), (row = []), (cell = '');
			else if (ch !== '\r') cell += ch;
		}
		if (cell || row.length) row.push(cell), rows.push(row);
		const [head, ...body] = rows.filter((r) => r.some((c) => c.trim()));
		return body.map((r) => Object.fromEntries(head.map((h, i) => [h.replace(/^﻿/, ''), r[i] ?? ''])));
	}
	async function importCsv(file: File | undefined) {
		if (!file) return;
		try {
			const rows = parseCsv(await file.text());
			const r = await api<{ imported: number }>(`/forms/${fid}/import-responses`, { method: 'POST', body: JSON.stringify({ rows }) });
			say(`${r.imported} respostas importadas`);
			await load();
			tab = 'respostas';
		} catch (e) {
			say((e as Error).message);
		}
	}

	let confirmArchive = $state(false);
	async function archive() {
		if (!confirmArchive) {
			confirmArchive = true;
			setTimeout(() => (confirmArchive = false), 4000);
			return;
		}
		await api(`/forms/${fid}`, { method: 'DELETE' });
		goto(resolve('/formularios'));
	}

	const textFields = $derived(form?.fields.filter((f) => ['short', 'email', 'phone', 'select', 'choice'].includes(f.type)) ?? []);
	const dateFields = $derived(form?.fields.filter((f) => f.type === 'date') ?? []);
</script>

<p class="back meta"><a href={resolve('/formularios')}>← formulários</a></p>

{#if error}
	<p class="err">{error}</p>
{:else if form}
	<section class="head">
		<input
			class="title-lg name"
			value={form.title}
			aria-label="Nome do formulário"
			onchange={(e) => {
				form!.title = e.currentTarget.value.trim() || form!.title;
				patch({ title: form!.title });
			}}
			onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
		/>
		<div class="linkrow">
			<button
				class="status"
				class:on={!!form.open}
				onclick={() => {
					form!.open = form!.open ? 0 : 1;
					patch({ open: form!.open });
				}}
			>
				<i></i>{form.open ? 'recebendo respostas' : 'fechado'}
			</button>
			<span class="meta url">{publicUrl.replace(/^https?:\/\//, '')}</span>
			<span class="lact">
				<button class="link" onclick={copyLink}>copiar link</button>
				<button class="link" onclick={shareLink}>enviar</button>
				<a class="link" href={publicUrl} target="_blank" rel="noopener">ver como cliente ↗</a>
			</span>
		</div>
	</section>

	{#if skipped}
		<p class="note">Do Google Forms, ficaram de fora (tipo de pergunta sem equivalente aqui): {skipped}. Se precisar, recrie com outro tipo.</p>
	{/if}

	<nav class="tabs" aria-label="Seções">
		<button class:on={tab === 'perguntas'} onclick={() => (tab = 'perguntas')}>perguntas <span class="meta">{form.fields.filter((f) => f.type !== 'section').length}</span></button>
		<button class:on={tab === 'respostas'} onclick={() => (tab = 'respostas')}
			>respostas <span class="meta">{responses.length}</span>{#if unread}<b class="dot">{unread}</b>{/if}</button
		>
		<button class:on={tab === 'ajustes'} onclick={() => (tab = 'ajustes')}>ajustes</button>
		<span class="meta saved">{saved}</span>
	</nav>

	{#if tab === 'perguntas'}
		<textarea
			class="desc"
			rows="2"
			placeholder="descrição (opcional): o que o cliente precisa saber antes de responder"
			value={form.description}
			onchange={(e) => {
				form!.description = e.currentTarget.value;
				patch({ description: form!.description });
			}}
		></textarea>

		<ol class="qs">
			{#each form.fields as f, i (f.id)}
				<li class="qcard" class:section={f.type === 'section'}>
					<div class="qtop">
						<span class="meta num">{String(i + 1).padStart(2, '0')}</span>
						<select value={f.type} onchange={(e) => changeType(f, e.currentTarget.value as FieldType)} aria-label="Tipo da pergunta">
							{#each NEW_TYPES as t (t)}<option value={t}>{TYPE_NAMES[t]}</option>{/each}
						</select>
						{#if f.type !== 'section'}
							<label class="req"><input type="checkbox" bind:checked={f.required} /> obrigatória</label>
						{/if}
					</div>
					<input id="lbl-{f.id}" class="field qlabel" placeholder={f.type === 'section' ? 'título da seção' : 'pergunta'} bind:value={f.label} />
					<input class="field qhelp" placeholder="explicação (opcional)" bind:value={f.help} />
					{#if hasOptions(f.type)}
						<label class="optlabel meta" for="opt-{f.id}">opções, uma por linha</label>
						<textarea
							id="opt-{f.id}"
							class="field opts"
							rows={Math.max(2, (f.options ?? []).length)}
							value={(f.options ?? []).join('\n')}
							oninput={(e) => (f.options = e.currentTarget.value.split('\n'))}
						></textarea>
					{/if}
					{#if f.type === 'scale'}
						<div class="scale meta">
							de <select bind:value={f.min} aria-label="Mínimo">{#each [0, 1] as n (n)}<option value={n}>{n}</option>{/each}</select>
							a <select bind:value={f.max} aria-label="Máximo">{#each [3, 4, 5, 6, 7, 8, 9, 10] as n (n)}<option value={n}>{n}</option>{/each}</select>
						</div>
					{/if}
					<div class="qact">
						<button onclick={() => moveField(i, -1)} disabled={i === 0} aria-label="Subir">↑</button>
						<button onclick={() => moveField(i, 1)} disabled={i === form.fields.length - 1} aria-label="Descer">↓</button>
						<button onclick={() => dupField(i)}>duplicar</button>
						<button class="danger" onclick={() => delField(f)}>{confirmDel === f.id ? 'confirmar' : 'excluir'}</button>
					</div>
				</li>
			{/each}
		</ol>

		{#if adding}
			<div class="types" role="menu">
				{#each NEW_TYPES as t (t)}<button onclick={() => addField(t)}>{TYPE_NAMES[t]}</button>{/each}
				<button class="cancel" onclick={() => (adding = false)}>cancelar</button>
			</div>
		{:else}
			<button class="btn addq" onclick={() => (adding = true)}>+ pergunta</button>
		{/if}
	{:else if tab === 'respostas'}
		<div class="rbar">
			<label class="opt"><input type="checkbox" bind:checked={onlyNew} /> só as novas ({unread})</label>
			{#if responses.length}<button class="link" onclick={exportCsv}>baixar .csv</button>{/if}
		</div>
		{#if !responses.length}
			<p class="label grey">Nenhuma resposta ainda. Copie o link acima e mande para o cliente.</p>
		{/if}
		<div class="resps">
			{#each shown as r (r.id)}
				<article class="resp" class:unread={!r.read_at}>
					<header>
						<span class="meta">{fmtLong(r.created_at)}{r.source === 'google' ? ', via Google Forms' : ''}</span>
						{#if !r.read_at}<b class="badge">nova</b>{/if}
					</header>
					<dl>
						{#each r.answers as a (a.id + a.label)}
							<dt>{a.label}</dt>
							<dd class:empty={!fmtVal(a)}>{fmtVal(a) || '—'}</dd>
						{/each}
					</dl>
					<footer>
						{#if r.task_id}
							<button class="btn" onclick={() => (openTask = r.task_id)}>ver tarefa{r.task_title ? `: ${r.task_title}` : ''}</button>
						{:else}
							<button class="btn primary-b" onclick={() => toTask(r)}>criar tarefa no inbox</button>
						{/if}
						<a class="btn" href={claudeUrl(r)} target="_blank" rel="noopener">abrir no Claude ↗</a>
						<button class="btn" onclick={() => copyPrompt(r)}>copiar pedido</button>
						<span class="ract">
							<button class="link" onclick={() => setRead(r, !r.read_at)}>{r.read_at ? 'marcar como nova' : 'marcar como lida'}</button>
							<button class="link danger" onclick={() => delResp(r)}>{confirmResp === r.id ? 'confirmar' : 'apagar'}</button>
						</span>
					</footer>
				</article>
			{/each}
		</div>
	{:else}
		<dl class="settings">
			<dt>aviso por e-mail</dt>
			<dd>
				<label class="opt"
					><input
						type="checkbox"
						checked={!!form.notify}
						onchange={(e) => {
							form!.notify = e.currentTarget.checked ? 1 : 0;
							patch({ notify: form!.notify });
						}}
					/> me avisar a cada resposta nova</label
				>
				{#if !emailReady}<p class="meta">O envio de e-mails ainda não foi configurado no servidor (falta a chave do Resend).</p>{/if}
			</dd>

			<dt>título da tarefa</dt>
			<dd>
				<select
					value={form.title_field ?? ''}
					onchange={(e) => {
						form!.title_field = e.currentTarget.value || null;
						patch({ title_field: form!.title_field });
					}}
				>
					<option value="">só o nome do formulário + data</option>
					{#each textFields as f (f.id)}<option value={f.id}>nome do formulário + “{f.label || 'sem título'}”</option>{/each}
				</select>
				<p class="meta">Ao criar uma tarefa a partir de uma resposta. A descrição leva todas as respostas.</p>
			</dd>

			<dt>prazo da tarefa</dt>
			<dd>
				<select
					value={form.due_field ?? ''}
					onchange={(e) => {
						form!.due_field = e.currentTarget.value || null;
						patch({ due_field: form!.due_field });
					}}
				>
					<option value="">sem prazo</option>
					{#each dateFields as f (f.id)}<option value={f.id}>a data respondida em “{f.label || 'sem título'}”</option>{/each}
				</select>
			</dd>

			<dt>marca</dt>
			<dd>
				<select
					value={form.client_id ?? ''}
					onchange={(e) => {
						form!.client_id = e.currentTarget.value || null;
						patch({ client_id: form!.client_id });
					}}
				>
					<option value="">padrão do πύλη</option>
					{#each clients as cl (cl.id)}<option value={cl.id}>{cl.name}</option>{/each}
				</select>
				<p class="meta">Cores e logotipo do cliente (cliente → perfil → marca).</p>
			</dd>

			<dt>mensagem final</dt>
			<dd>
				<input
					class="field"
					value={form.thanks}
					onchange={(e) => {
						form!.thanks = e.currentTarget.value;
						patch({ thanks: form!.thanks });
					}}
				/>
			</dd>

			<dt>endereço do link</dt>
			<dd>
				<div class="slug">
					<span class="meta">/f/</span>
					<input
						class="field"
						value={form.slug}
						onchange={async (e) => {
							const v = e.currentTarget.value;
							await patch({ slug: v });
							await load();
						}}
					/>
				</div>
				<p class="meta">Mudar o endereço desativa o link antigo.</p>
			</dd>

			<dt>respostas do Google</dt>
			<dd>
				<label class="btn upload"
					>importar .csv<input type="file" accept=".csv,text/csv" hidden onchange={(e) => (importCsv(e.currentTarget.files?.[0]), (e.currentTarget.value = ''))} /></label
				>
				<p class="meta">No Google Forms: aba Respostas → ⋮ → “Baixar respostas (.csv)”. As colunas são ligadas às perguntas pelo texto.</p>
			</dd>

			<dt></dt>
			<dd><button class="btn danger" onclick={archive}>{confirmArchive ? 'toque de novo para arquivar' : 'arquivar formulário'}</button></dd>
		</dl>
	{/if}
{:else}
	<p class="meta">carregando…</p>
{/if}

{#if flash}<p class="flash" role="status">{flash}</p>{/if}

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
		gap: 10px;
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
	.linkrow {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 16px;
		align-items: center;
		font-size: var(--t-sm);
	}
	.status {
		display: flex;
		align-items: center;
		gap: 6px;
		border: var(--rule);
		background: var(--white);
		padding: 5px 10px;
		cursor: pointer;
		font-size: var(--t-sm);
	}
	.status i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--grey);
	}
	.status.on i {
		background: var(--accent);
	}
	.url {
		overflow-wrap: anywhere;
	}
	.lact {
		display: flex;
		gap: 14px;
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
	.note {
		margin-top: 12px;
		font-size: var(--t-sm);
		border-left: 3px solid var(--accent);
		padding-left: 10px;
	}
	.tabs {
		display: flex;
		gap: 22px;
		align-items: baseline;
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
		display: flex;
		gap: 6px;
		align-items: baseline;
	}
	.tabs button.on {
		border-bottom-color: var(--accent);
	}
	.dot {
		background: var(--accent);
		color: #fff;
		font: 700 10px/1 var(--sans);
		font-variant-numeric: tabular-nums;
		padding: 3px 5px;
	}
	.saved {
		margin-left: auto;
	}
	.desc {
		width: 100%;
		border: 0;
		border-bottom: var(--rule-soft);
		padding: 6px 0;
		resize: vertical;
		background: none;
		outline: none;
		margin-bottom: 14px;
		font-size: var(--t-sm);
	}
	.qs {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 12px;
		max-width: 760px;
	}
	.qcard {
		border: var(--rule);
		padding: 12px 14px;
		display: grid;
		gap: 6px;
	}
	.qcard.section {
		border-width: 2px;
	}
	.qtop {
		display: flex;
		gap: 10px;
		align-items: center;
		flex-wrap: wrap;
	}
	.num {
		min-width: 20px;
	}
	select {
		border: var(--rule);
		border-radius: 0;
		background: var(--white);
		padding: 6px 8px;
		font-size: var(--t-sm);
	}
	.req,
	.opt {
		display: flex;
		gap: 6px;
		align-items: center;
		font-size: var(--t-sm);
		cursor: pointer;
	}
	.req {
		margin-left: auto;
	}
	input[type='checkbox'] {
		accent-color: var(--accent);
	}
	.qlabel {
		font-size: var(--t-md);
		padding: 8px 0;
	}
	.qhelp {
		font-size: var(--t-sm);
		color: var(--grey);
		padding: 4px 0;
		border-bottom-color: var(--grey-light);
	}
	.optlabel {
		margin-top: 6px;
	}
	.opts {
		resize: vertical;
		font-size: var(--t-sm);
		line-height: 1.6;
	}
	.scale {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.qact {
		display: flex;
		gap: 4px;
		justify-content: flex-end;
		margin-top: 4px;
	}
	.qact button {
		background: none;
		border: 1px solid var(--grey-light);
		padding: 4px 10px;
		font-size: var(--t-xs);
		cursor: pointer;
	}
	.qact button:disabled {
		opacity: 0.3;
	}
	.qact .danger:hover,
	.link.danger:hover {
		color: var(--accent);
	}
	.addq {
		margin-top: 14px;
	}
	.types {
		margin-top: 14px;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		border-top: var(--rule);
		border-left: var(--rule);
		max-width: 760px;
	}
	.types button {
		border: 0;
		border-right: var(--rule);
		border-bottom: var(--rule);
		background: var(--white);
		padding: 14px 10px;
		text-align: left;
		cursor: pointer;
		font-size: var(--t-sm);
	}
	.types button:hover {
		background: var(--black);
		color: var(--white);
	}
	.types .cancel {
		color: var(--grey);
	}
	.btn.primary-b {
		background: var(--black);
		border-color: var(--black);
		color: var(--white);
	}
	a.btn {
		text-decoration: none;
	}
	.rbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 14px;
	}
	.resps {
		display: grid;
		gap: 14px;
		max-width: 860px;
	}
	.resp {
		border: var(--rule);
		padding: 14px;
		display: grid;
		gap: 12px;
	}
	.resp.unread {
		border-left: 4px solid var(--accent);
	}
	.resp header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.badge {
		color: var(--accent);
		font: 700 var(--t-xs) var(--sans);
		font-variant-numeric: tabular-nums;
	}
	.resp dl {
		display: grid;
		grid-template-columns: minmax(120px, 34%) 1fr;
		gap: 8px 14px;
		margin: 0;
	}
	.resp dt {
		font-size: var(--t-sm);
		color: var(--grey);
	}
	.resp dd {
		margin: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.resp dd.empty {
		color: var(--inactive);
	}
	.resp footer {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
		border-top: var(--rule-soft);
		padding-top: 12px;
	}
	.resp footer .btn {
		padding: 8px 12px;
	}
	.ract {
		margin-left: auto;
		display: flex;
		gap: 14px;
	}
	.settings {
		display: grid;
		grid-template-columns: 170px 1fr;
		gap: 18px 16px;
		max-width: 760px;
		margin: 0;
	}
	.settings dt {
		font-size: var(--t-sm);
		color: var(--grey);
		padding-top: 6px;
	}
	.settings dd {
		margin: 0;
		display: grid;
		gap: 6px;
		min-width: 0;
	}
	.settings .field {
		padding: 6px 0;
	}
	.slug {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.upload {
		justify-self: start;
		cursor: pointer;
	}
	.btn.danger:hover {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	.grey {
		color: var(--grey);
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
		.resp dl,
		.settings {
			grid-template-columns: 1fr;
			gap: 2px;
		}
		.resp dd,
		.settings dd {
			margin-bottom: 10px;
		}
		.ract {
			margin-left: 0;
			width: 100%;
			justify-content: space-between;
		}
	}
</style>

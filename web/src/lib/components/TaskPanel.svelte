<script lang="ts">
	import { api, ApiError } from '#lib/api.ts';
	import {
		CARD_COLORS,
		LABEL_COLORS,
		PRIORITY_LABEL,
		fmtLong,
		fromInput,
		isLate,
		toInput,
		type Label,
		type Priority,
		type Task
	} from '#lib/model.ts';
	import Checklist, { type CheckItem } from './Checklist.svelte';
	import Destination from './Destination.svelte';
	import type { ExTask } from '#lib/export.ts';

	let { id, onclose, onchange }: { id: string; onclose: () => void; onchange: () => void } = $props();

	type Placement = { id: string; board_id: string; list_id: string | null; board_name: string; list_name: string | null };
	type History = { id: number; at: number; field: string; old_value: string | null; new_value: string | null };
	type Person = { id: string; name: string; email?: string | null };
	type Attachment = { id: string; kind: 'link' | 'file'; name: string; href: string; size: number; mime: string | null };
	type Ref = { id: string; title: string; done_at: number | null };
	type Full = {
		checklist: CheckItem[];
		members: string[];
		mentions: string[];
		attachments: Attachment[];
		refs_out: Ref[];
		refs_in: Ref[];
	};

	// O painel pode navegar para outra tarefa (referências) sem fechar
	let current = $state('');
	$effect.pre(() => {
		current = id;
	});

	let task = $state<Task | null>(null);
	let placements = $state<Placement[]>([]);
	let history = $state<History[]>([]);
	let labels = $state<Label[]>([]);
	let people = $state<Person[]>([]);
	let full = $state<Full | null>(null);
	let error = $state('');
	let confirmDelete = $state(false);
	let copied = $state(false);
	let newLabel = $state('');
	let newLabelColor = $state(LABEL_COLORS[0]);
	let showHistory = $state(false);
	let newPerson = $state('');
	let linkUrl = $state('');
	let uploading = $state(false);
	let action = $state<null | 'move' | 'copy' | 'mirror' | 'template'>(null);
	let templateName = $state('');
	let movePlacement = $state('');
	let flash = $state('');
	let Editor = $state<any>(null);

	import('./Editor.svelte').then((m) => (Editor = m.default)); // carrega o editor só quando precisa

	async function load() {
		const tid = current;
		try {
			const [t, l, p, f] = await Promise.all([
				api<{ task: Task; placements: Placement[]; history: History[] }>(`/tasks/${tid}`),
				api<{ labels: Label[] }>('/labels'),
				api<{ people: Person[] }>('/people'),
				api<Full>(`/tasks/${tid}/full`)
			]);
			if (tid !== current) return;
			task = t.task;
			placements = t.placements;
			history = t.history;
			labels = l.labels;
			people = p.people;
			full = f;
			movePlacement = placements[0]?.id ?? '';
			error = '';
		} catch (e) {
			error = (e as Error).message;
		}
	}

	$effect(() => {
		current;
		task = null;
		full = null;
		action = null;
		load();
	});

	function say(msg: string) {
		flash = msg;
		setTimeout(() => (flash = ''), 2500);
	}

	async function refreshSide() {
		const [t, f] = await Promise.all([
			api<{ task: Task; placements: Placement[]; history: History[] }>(`/tasks/${current}`),
			api<Full>(`/tasks/${current}/full`)
		]);
		history = t.history;
		placements = t.placements;
		full = f;
		onchange();
	}

	async function save(patch: Partial<Task> & Record<string, unknown>) {
		if (!task) return;
		Object.assign(task, patch);
		try {
			await api(`/tasks/${current}`, { method: 'PATCH', body: JSON.stringify(patch) });
			await refreshSide();
		} catch (e) {
			error = (e as Error).message;
		}
	}

	let descTimer: ReturnType<typeof setTimeout>;
	function onDesc(md: string) {
		if (!task) return;
		task.description_md = md;
		clearTimeout(descTimer);
		descTimer = setTimeout(() => save({ description_md: md }), 800);
	}

	async function toggleDone() {
		if (!task) return;
		await api(`/tasks/${current}/${task.done_at ? 'undone' : 'done'}`, { method: 'POST' });
		await load();
		onchange();
	}

	function toggleLabel(lid: string) {
		if (!task) return;
		const next = task.labels.includes(lid) ? task.labels.filter((x) => x !== lid) : [...task.labels, lid];
		save({ labels: next });
	}

	async function createLabel(e: SubmitEvent) {
		e.preventDefault();
		if (!newLabel.trim() || !task) return;
		const { id: lid } = await api<{ id: string }>('/labels', {
			method: 'POST',
			body: JSON.stringify({ name: newLabel, color: newLabelColor })
		});
		labels = [...labels, { id: lid, name: newLabel.trim(), color: newLabelColor }];
		newLabel = '';
		toggleLabel(lid);
	}

	// ---------- Membros ----------
	async function setMembers(ids: string[]) {
		if (!full) return;
		full.members = ids;
		await api(`/tasks/${current}/members`, { method: 'PUT', body: JSON.stringify({ person_ids: ids }) });
		onchange();
	}
	function toggleMember(pid: string) {
		if (!full) return;
		setMembers(full.members.includes(pid) ? full.members.filter((x) => x !== pid) : [...full.members, pid]);
	}
	async function addPerson(e: SubmitEvent) {
		e.preventDefault();
		const name = newPerson.trim();
		if (!name || !full) return;
		const { id: pid } = await api<{ id: string }>('/people', { method: 'POST', body: JSON.stringify({ name }) });
		people = [...people, { id: pid, name }].sort((a, b) => a.name.localeCompare(b.name));
		newPerson = '';
		setMembers([...full.members, pid]);
	}

	// ---------- Anexos ----------
	async function upload(files: FileList | null) {
		if (!files?.length) return;
		uploading = true;
		try {
			for (const f of files) {
				if (f.size > 5 * 1024 * 1024) {
					say(`“${f.name}” tem mais de 5 MB`);
					continue;
				}
				const fd = new FormData();
				fd.append('file', f);
				await api(`/tasks/${current}/attachments`, { method: 'POST', body: fd });
			}
			await refreshSide();
		} catch (e) {
			say((e as ApiError).message);
		} finally {
			uploading = false;
		}
	}
	async function addLink(e: SubmitEvent) {
		e.preventDefault();
		if (!linkUrl.trim()) return;
		let url = linkUrl.trim();
		if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
		try {
			await api(`/tasks/${current}/attachments`, { method: 'POST', body: JSON.stringify({ url }) });
			linkUrl = '';
			await refreshSide();
		} catch (e) {
			say((e as Error).message);
		}
	}
	let confirmAtt = $state<string | null>(null);
	async function removeAttachment(a: Attachment) {
		if (confirmAtt !== a.id) {
			confirmAtt = a.id;
			setTimeout(() => (confirmAtt = null), 3000);
			return;
		}
		await api(`/attachments/${a.id}`, { method: 'DELETE' });
		if (task?.cover_key === a.id) task.cover_key = null;
		await refreshSide();
	}
	const isImage = (a: Attachment) => a.kind === 'file' && /^image\//.test(a.mime ?? '');
	const cover = $derived(full?.attachments.find((a) => a.id === task?.cover_key && isImage(a)));
	const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

	// ---------- Ações ----------
	async function doAction(dest: { board_id: string; list_id: string | null }) {
		try {
			if (action === 'move') {
				await api(`/placements/${movePlacement}/move`, { method: 'POST', body: JSON.stringify(dest) });
				say('tarefa movida');
			} else if (action === 'copy') {
				await api(`/tasks/${current}/copy`, { method: 'POST', body: JSON.stringify(dest) });
				say('cópia criada');
			} else if (action === 'mirror') {
				await api(`/tasks/${current}/mirror`, { method: 'POST', body: JSON.stringify(dest) });
				say('espelho criado: editar aqui muda lá também');
			}
			action = null;
			await refreshSide();
		} catch (e) {
			say((e as Error).message);
		}
	}
	async function duplicate() {
		const r = await api<{ id: string }>(`/tasks/${current}/duplicate`, { method: 'POST' });
		onchange();
		current = r.id;
		say('tarefa duplicada (você está na cópia)');
	}
	async function saveTemplate(e: SubmitEvent) {
		e.preventDefault();
		if (!templateName.trim()) return;
		await api('/templates', { method: 'POST', body: JSON.stringify({ task_id: current, name: templateName }) });
		templateName = '';
		action = null;
		say('modelo salvo');
	}
	async function unplace(p: Placement) {
		await api(`/placements/${p.id}`, { method: 'DELETE' });
		await refreshSide();
	}

	// ---------- Compartilhar como PDF (WhatsApp etc.) ----------
	let sharing = $state(false);
	let pendingPdf = $state<File | null>(null);
	async function sharePdf() {
		sharing = true;
		try {
			const [{ task: ex }, x] = await Promise.all([api<{ task: ExTask }>(`/tasks/${current}/export`), import('#lib/export.ts')]);
			const all = new Set(x.FIELDS.map((f) => f.key));
			const blob = await x.toPDF(ex.title, `πύλη · ${ex.list ?? 'inbox'}`, [{ name: '', tasks: [ex] }], all);
			const name = `${x.fileSlug(ex.title)}.pdf`;
			const r = await x.deliver(blob, name, true);
			if (r === 'gesture') pendingPdf = new File([blob], name, { type: 'application/pdf' });
			if (r === 'downloaded') say('PDF baixado');
		} catch (e) {
			say((e as Error).message);
		} finally {
			sharing = false;
		}
	}

	async function remove() {
		if (!confirmDelete) {
			confirmDelete = true;
			setTimeout(() => (confirmDelete = false), 4000);
			return;
		}
		await api(`/tasks/${current}`, { method: 'DELETE' });
		onchange();
		onclose();
	}

	async function copyDesc() {
		if (!task) return;
		// copia como texto limpo: menções e referências viram texto simples
		const text = task.description_md.replace(/\[([^\]]+)\]\((?:person|task):[^)]+\)/g, '$1');
		await navigator.clipboard.writeText(text);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	const FIELD_NAME: Record<string, string> = {
		title: 'título',
		description_md: 'descrição',
		start_at: 'início',
		due_at: 'prazo',
		priority: 'prioridade',
		color: 'cor',
		cover_key: 'capa',
		done_at: 'concluída'
	};
	function histValue(field: string, v: string | null) {
		if (v == null || v === '') return '—';
		if ((field === 'start_at' || field === 'due_at' || field === 'done_at') && /^\d+$/.test(v)) return fmtLong(Number(v));
		if (field === 'priority') return PRIORITY_LABEL[v as Exclude<Priority, null>] ?? v;
		if (field === 'description_md') return v.length > 40 ? v.slice(0, 40) + '…' : v;
		if (field === 'cover_key') return 'imagem';
		return v;
	}

	function onkey(e: KeyboardEvent) {
		if (e.key === 'Escape' && !action) onclose();
	}
</script>

<svelte:window onkeydown={onkey} />

<div class="scrim" onclick={onclose} aria-hidden="true"></div>

<aside class="panel" aria-label="Tarefa">
	<header class="top">
		<span class="meta where">
			{#if placements.length}
				{#each placements as p, i (p.id)}
					{#if i > 0}<span class="mirror" title="Cartão espelho"> ⧉ </span>{/if}
					<span>{p.board_name}{p.list_name ? ' › ' + p.list_name : ''}</span>
					{#if placements.length > 1}<button class="x small" onclick={() => unplace(p)} title="Tirar deste lugar">×</button>{/if}
				{/each}
			{:else}
				inbox
			{/if}
		</span>
		<button class="x" onclick={onclose} aria-label="Fechar">fechar</button>
	</header>

	{#if error}<p class="err">{error}</p>{/if}

	{#if task && full}
		{#if cover}
			<figure class="cover">
				<img src={cover.href} alt="" />
				<button class="link" onclick={() => save({ cover_key: null })}>remover capa</button>
			</figure>
		{/if}

		<div class="titlerow">
			<button class="btn" class:primary={!task.done_at} onclick={toggleDone}>{task.done_at ? 'reabrir' : 'concluir'}</button>
			<textarea
				class="title"
				rows="1"
				value={task.title}
				onchange={(e) => save({ title: e.currentTarget.value.trim() || task!.title })}
				onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
			></textarea>
		</div>
		{#if task.done_at}<p class="meta">concluída em {fmtLong(task.done_at)}</p>{/if}

		<nav class="actions" aria-label="Ações da tarefa">
			{#if placements.length}<button class:on={action === 'move'} onclick={() => (action = action === 'move' ? null : 'move')}>mover</button>{/if}
			<button class:on={action === 'copy'} onclick={() => (action = action === 'copy' ? null : 'copy')}>copiar</button>
			<button onclick={duplicate}>duplicar</button>
			<button class:on={action === 'mirror'} onclick={() => (action = action === 'mirror' ? null : 'mirror')}>espelhar</button>
			<button onclick={sharePdf} disabled={sharing}>{sharing ? 'gerando PDF…' : 'compartilhar PDF'}</button>
			<button class:on={action === 'template'} onclick={() => (action = action === 'template' ? null : 'template')}>salvar como modelo</button>
		</nav>

		{#if pendingPdf}
			<div class="actionbox row">
				<span class="label">PDF pronto.</span>
				<button class="btn primary" onclick={() => { const f = pendingPdf!; pendingPdf = null; navigator.share({ files: [f], title: f.name }).catch(() => {}); }}>enviar PDF</button>
			</div>
		{/if}

		{#if action === 'move' || action === 'copy' || action === 'mirror'}
			<div class="actionbox">
				<p class="label">
					{action === 'move' ? 'Mover para' : action === 'copy' ? 'Copiar (tarefa nova, independente) para' : 'Espelhar em (mesma tarefa, aparece nos dois lugares)'}
				</p>
				{#if action === 'move' && placements.length > 1}
					<select bind:value={movePlacement} aria-label="Qual lugar mover">
						{#each placements as p (p.id)}<option value={p.id}>de: {p.board_name}{p.list_name ? ' › ' + p.list_name : ''}</option>{/each}
					</select>
				{/if}
				<Destination label={action === 'move' ? 'mover' : action === 'copy' ? 'copiar' : 'espelhar'} onconfirm={doAction} oncancel={() => (action = null)} />
			</div>
		{:else if action === 'template'}
			<form class="actionbox" onsubmit={saveTemplate}>
				<p class="label">Salvar como modelo: título, descrição, checklist, labels, membros, prioridade, cor e capa.</p>
				<div class="row">
					<!-- svelte-ignore a11y_autofocus -->
					<input class="field" placeholder="nome do modelo" bind:value={templateName} autofocus />
					<button class="btn primary" disabled={!templateName.trim()}>salvar</button>
				</div>
			</form>
		{/if}

		<dl>
			<dt>prioridade</dt>
			<dd class="seg">
				<button class:on={!task.priority} onclick={() => save({ priority: null })}>—</button>
				{#each ['bom', 'preocupante', 'critico'] as const as p (p)}
					<button class="p-{p}" class:on={task.priority === p} onclick={() => save({ priority: p })}>{PRIORITY_LABEL[p]}</button>
				{/each}
			</dd>

			<dt>membros</dt>
			<dd>
				<div class="chips">
					{#each people as p (p.id)}
						<button class="chip person" class:on={full.members.includes(p.id)} onclick={() => toggleMember(p.id)}>{p.name}</button>
					{/each}
				</div>
				<form class="inline" onsubmit={addPerson}>
					<input class="field" placeholder="+ pessoa (só o nome)" bind:value={newPerson} />
					{#if newPerson.trim()}<button class="btn">adicionar</button>{/if}
				</form>
			</dd>

			<dt>início</dt>
			<dd>
				<input class="field" type="datetime-local" value={toInput(task.start_at)} onchange={(e) => save({ start_at: fromInput(e.currentTarget.value) })} />
			</dd>

			<dt>prazo</dt>
			<dd>
				<input
					class="field"
					class:late={isLate(task)}
					type="datetime-local"
					value={toInput(task.due_at)}
					onchange={(e) => save({ due_at: fromInput(e.currentTarget.value) })}
				/>
			</dd>

			<dt>cor</dt>
			<dd class="swatches">
				{#each CARD_COLORS as c (c.name)}
					<button
						class="sw"
						class:on={task.color === c.value}
						style:background={c.value ?? 'var(--white)'}
						onclick={() => save({ color: c.value })}
						aria-label={c.name}
						title={c.name}
					></button>
				{/each}
			</dd>

			<dt>labels</dt>
			<dd>
				<div class="chips">
					{#each labels as l (l.id)}
						<button class="chip" class:on={task.labels.includes(l.id)} style:--c={l.color} onclick={() => toggleLabel(l.id)}>{l.name}</button>
					{/each}
				</div>
				<form class="inline" onsubmit={createLabel}>
					<input class="field" placeholder="+ label" bind:value={newLabel} />
					{#each LABEL_COLORS as c (c)}
						<button type="button" class="dot" class:on={newLabelColor === c} style:background={c} onclick={() => (newLabelColor = c)} aria-label="cor {c}"
						></button>
					{/each}
					{#if newLabel.trim()}<button class="btn">criar</button>{/if}
				</form>
			</dd>
		</dl>

		<section class="block">
			<div class="head">
				<span class="label">descrição</span>
				<button class="link" onclick={copyDesc} disabled={!task.description_md}>{copied ? 'copiado ✓' : 'copiar texto'}</button>
			</div>
			{#if Editor}
				{#key current}
					<Editor
						value={task.description_md}
						{people}
						onchange={onDesc}
						onpeople={(p: Person) => (people = [...people, p])}
						onopentask={(tid: string) => (current = tid)}
					/>
				{/key}
			{:else}
				<p class="meta">carregando editor…</p>
			{/if}
		</section>

		<section class="block">
			<Checklist taskId={current} items={full.checklist} {people} onchange={refreshSide} />
		</section>

		<section class="block">
			<div class="head">
				<span class="label">anexos</span>
				<label class="link upload">
					{uploading ? 'enviando…' : '+ arquivo (até 5 MB)'}
					<input type="file" multiple hidden disabled={uploading} onchange={(e) => (upload(e.currentTarget.files), (e.currentTarget.value = ''))} />
				</label>
			</div>
			{#if full.attachments.length}
				<ul class="atts">
					{#each full.attachments as a (a.id)}
						<li>
							{#if isImage(a)}<img class="thumb" src={a.href} alt="" loading="lazy" />{:else}<span class="thumb ico">{a.kind === 'link' ? '↗' : '▤'}</span>{/if}
							<a href={a.href} target="_blank" rel="noopener noreferrer">{a.name}</a>
							<span class="meta">{a.kind === 'file' ? kb(a.size) : 'link'}</span>
							<span class="attact">
								{#if isImage(a) && task.cover_key !== a.id}<button class="link" onclick={() => save({ cover_key: a.id })}>usar como capa</button>{/if}
								{#if task.cover_key === a.id}<span class="meta">capa</span>{/if}
								<button class="link danger" onclick={() => removeAttachment(a)}>{confirmAtt === a.id ? 'confirmar' : 'remover'}</button>
							</span>
						</li>
					{/each}
				</ul>
			{/if}
			<form class="inline" onsubmit={addLink}>
				<input class="field" placeholder="+ link (https://…)" bind:value={linkUrl} inputmode="url" />
				{#if linkUrl.trim()}<button class="btn">anexar</button>{/if}
			</form>
		</section>

		{#if full.refs_out.length || full.refs_in.length}
			<section class="block">
				<span class="label">referências</span>
				<ul class="refs">
					{#each full.refs_out as r (r.id)}
						<li><span class="meta">cita →</span> <button class="link" class:done={!!r.done_at} onclick={() => (current = r.id)}>{r.title}</button></li>
					{/each}
					{#each full.refs_in as r (r.id)}
						<li><span class="meta">citada por ←</span> <button class="link" class:done={!!r.done_at} onclick={() => (current = r.id)}>{r.title}</button></li>
					{/each}
				</ul>
			</section>
		{/if}

		<section class="block soft">
			<button class="link" onclick={() => (showHistory = !showHistory)}>histórico ({history.length}) {showHistory ? '−' : '+'}</button>
			{#if showHistory}
				<ol class="hist">
					{#each history as h (h.id)}
						<li class="meta">
							<span>{fmtLong(h.at)}</span>
							<span>{FIELD_NAME[h.field] ?? h.field}: {histValue(h.field, h.old_value)} → {histValue(h.field, h.new_value)}</span>
						</li>
					{:else}
						<li class="meta">sem alterações ainda</li>
					{/each}
				</ol>
			{/if}
		</section>

		<footer>
			<button class="btn danger" onclick={remove}>{confirmDelete ? 'clique de novo para excluir' : 'excluir tarefa'}</button>
		</footer>
	{:else if !error}
		<p class="meta">carregando…</p>
	{/if}

	{#if flash}<p class="flash" role="status">{flash}</p>{/if}
</aside>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: var(--scrim);
		z-index: 10;
	}
	.panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: min(620px, 100vw);
		background: var(--white);
		border-left: var(--rule);
		z-index: 11;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0 var(--gutter) calc(var(--gutter) * 3);
		display: grid;
		align-content: start;
		gap: 18px;
	}
	.top {
		position: sticky;
		top: 0;
		z-index: 3;
		background: var(--white);
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
		padding: 18px 0 12px;
		border-bottom: var(--rule);
	}
	.where {
		display: flex;
		flex-wrap: wrap;
		gap: 2px 4px;
		align-items: baseline;
	}
	.mirror {
		color: var(--accent);
	}
	.x,
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
	.x.small {
		font-size: var(--t-xs);
		text-decoration: none;
		color: var(--grey);
	}
	.x:hover,
	.link:hover {
		color: var(--accent);
	}
	.link:disabled {
		opacity: 0.4;
	}
	.link.done {
		text-decoration: line-through;
		color: var(--grey);
	}
	.danger:hover {
		color: var(--accent);
	}
	.cover {
		margin: 0;
		display: grid;
		gap: 6px;
		justify-items: end;
	}
	.cover img {
		width: 100%;
		max-height: 240px;
		object-fit: cover;
		border: var(--rule);
	}
	.titlerow {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 14px;
		align-items: start;
	}
	.title {
		font-size: var(--t-lg);
		line-height: 1.15;
		letter-spacing: -0.01em;
		border: 0;
		resize: none;
		field-sizing: content;
		padding: 0;
		outline: none;
		width: 100%;
	}
	.title:focus {
		box-shadow: 0 2px 0 var(--accent);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 16px;
		font-size: var(--t-sm);
	}
	.actions button {
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
		color: var(--grey);
	}
	.actions button:hover,
	.actions button.on {
		color: var(--black);
		text-decoration: underline;
		text-decoration-color: var(--accent);
		text-decoration-thickness: 2px;
		text-underline-offset: 4px;
	}
	.actionbox {
		border: var(--rule);
		padding: 12px;
		display: grid;
		gap: 10px;
	}
	.row {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	select {
		border: var(--rule);
		border-radius: 0;
		background: var(--white);
		padding: 8px;
		font-size: var(--t-sm);
	}
	dl {
		display: grid;
		grid-template-columns: 96px 1fr;
		gap: 14px 12px;
		margin: 0;
		padding-top: 14px;
		border-top: var(--rule);
		align-items: center;
	}
	dt {
		font-size: var(--t-sm);
		color: var(--grey);
		align-self: start;
		padding-top: 6px;
	}
	dd {
		margin: 0;
		min-width: 0;
	}
	.field {
		padding: 6px 0;
	}
	.field.late {
		color: var(--accent);
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
	.seg .p-preocupante.on {
		background: var(--white);
		color: var(--accent);
		border-color: var(--accent);
		position: relative;
	}
	.seg .p-critico.on {
		background: var(--accent);
		border-color: var(--accent);
		position: relative;
	}
	.swatches {
		display: flex;
		gap: 6px;
	}
	.sw {
		width: 26px;
		height: 26px;
		border: 1px solid var(--grey);
		cursor: pointer;
		padding: 0;
	}
	.sw.on {
		outline: 2px solid var(--black);
		outline-offset: 2px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 6px;
	}
	.chip {
		font: 400 var(--t-xs) / 1 var(--mono);
		padding: 5px 7px;
		border: 1px solid var(--c, var(--black));
		color: var(--c, var(--black));
		background: var(--white);
		cursor: pointer;
	}
	.chip.on {
		background: var(--c, var(--black));
		color: var(--white);
	}
	.inline {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.inline .field {
		flex: 1;
		min-width: 80px;
		font-size: var(--t-sm);
	}
	.inline .btn {
		padding: 5px 10px;
	}
	.dot {
		width: 14px;
		height: 14px;
		border: 0;
		padding: 0;
		cursor: pointer;
		flex: none;
	}
	.dot.on {
		outline: 2px solid var(--black);
		outline-offset: 2px;
	}
	.block {
		border-top: var(--rule);
		padding-top: 14px;
		display: grid;
		gap: 10px;
	}
	.block.soft {
		border-top: var(--rule-soft);
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.upload {
		cursor: pointer;
	}
	.atts,
	.refs {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
	}
	.atts li {
		display: grid;
		grid-template-columns: 40px 1fr auto;
		gap: 4px 10px;
		align-items: center;
		font-size: var(--t-sm);
	}
	.atts a {
		overflow-wrap: anywhere;
	}
	.attact {
		grid-column: 2 / -1;
		display: flex;
		gap: 12px;
	}
	.thumb {
		width: 40px;
		height: 40px;
		object-fit: cover;
		border: 1px solid var(--grey-light);
		grid-row: span 2;
	}
	.thumb.ico {
		display: grid;
		place-items: center;
		color: var(--grey);
	}
	.refs li {
		display: flex;
		gap: 8px;
		align-items: baseline;
	}
	.hist {
		list-style: none;
		padding: 0;
		margin: 10px 0 0;
		display: grid;
		gap: 6px;
	}
	.hist li {
		display: grid;
		grid-template-columns: 130px 1fr;
		gap: 8px;
	}
	footer {
		border-top: var(--rule-soft);
		padding-top: 14px;
	}
	.btn.danger:hover {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--white);
	}
	.flash {
		position: sticky;
		bottom: 16px;
		justify-self: center;
		background: var(--black);
		color: var(--white);
		padding: 10px 16px;
		font-size: var(--t-sm);
	}
	.err {
		color: var(--accent);
	}
	@media (max-width: 600px) {
		.panel {
			border-left: 0;
		}
		dl {
			grid-template-columns: 1fr;
			gap: 4px;
		}
		dt {
			padding-top: 10px;
		}
	}
</style>

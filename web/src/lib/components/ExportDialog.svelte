<script lang="ts">
	import { api } from '#lib/api.ts';
	import { fmtLong, nowS } from '#lib/model.ts';
	import {
		FIELDS,
		deliver,
		fileSlug,
		parseMarkdown,
		toCSV,
		toDOCX,
		toMarkdown,
		toPDF,
		toXLSX,
		type ExTask,
		type FieldKey
	} from '#lib/export.ts';

	let { boardId, onclose, onimported }: { boardId: string; onclose: () => void; onimported: () => void } = $props();

	type Data = { board: { id: string; name: string }; lists: { id: string; name: string; is_final: number }[]; tasks: ExTask[] };

	const FORMATS = [
		{ key: 'pdf', label: '.pdf', hint: 'para ler e compartilhar' },
		{ key: 'docx', label: '.docx', hint: 'Word' },
		{ key: 'xlsx', label: '.xlsx', hint: 'Excel, uma linha por tarefa' },
		{ key: 'csv', label: '.csv', hint: 'planilha simples' },
		{ key: 'md', label: '.md', hint: 'markdown, dá para importar de volta' }
	] as const;
	type Format = (typeof FORMATS)[number]['key'];

	let tab = $state<'export' | 'import'>('export');
	let data = $state<Data | null>(null);
	let format = $state<Format>((localStorage.getItem('pyle.export.format') as Format) ?? 'pdf');
	let fields = $state<FieldKey[]>(
		JSON.parse(localStorage.getItem('pyle.export.fields') ?? 'null') ?? ['list', 'priority', 'due', 'labels', 'members', 'description', 'checklist', 'progress']
	);
	let lists = $state<string[]>([]);
	let includeDone = $state(true);
	let busy = $state(false);
	let error = $state('');
	let done = $state('');

	$effect(() => {
		api<Data>(`/boards/${boardId}/export`).then((d) => {
			data = d;
			lists = [...d.lists.map((l) => l.name), '(sem card)'];
		});
	});

	const listNames = $derived(data ? [...data.lists.map((l) => l.name), ...(data.tasks.some((t) => !t.list) ? ['(sem card)'] : [])] : []);
	const selected = $derived(
		(data?.tasks ?? []).filter((t) => lists.includes(t.list ?? '(sem card)') && (includeDone || !t.done_at))
	);

	async function run() {
		if (!data) return;
		busy = true;
		error = '';
		localStorage.setItem('pyle.export.format', format);
		localStorage.setItem('pyle.export.fields', JSON.stringify(fields));
		try {
			const f = new Set(fields);
			const groups = listNames
				.filter((n) => lists.includes(n))
				.map((n) => ({ name: n, tasks: selected.filter((t) => (t.list ?? '(sem card)') === n) }))
				.filter((g) => g.tasks.length);
			const name = `${fileSlug(data.board.name)}-${new Date().toISOString().slice(0, 10)}`;
			let blob: Blob;
			if (format === 'md') blob = new Blob([toMarkdown(data.board.name, groups, f)], { type: 'text/markdown;charset=utf-8' });
			else if (format === 'csv') blob = new Blob([toCSV(selected, f)], { type: 'text/csv;charset=utf-8' });
			else if (format === 'xlsx') blob = await toXLSX(selected, f);
			else if (format === 'docx') blob = await toDOCX(data.board.name, groups, f);
			else blob = await toPDF(data.board.name, `πύλη · exportado em ${fmtLong(nowS())}`, groups, f);
			await deliver(blob, `${name}.${format}`);
			done = `${selected.length} tarefas exportadas`;
		} catch (e) {
			error = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	// ---------- importar ----------
	let preview = $state<ReturnType<typeof parseMarkdown> | null>(null);
	async function pick(files: FileList | null) {
		const file = files?.[0];
		if (!file) return;
		if (file.size > 2 * 1024 * 1024) return (error = 'Arquivo grande demais (máx. 2 MB).');
		preview = parseMarkdown(await file.text());
		error = preview.length ? '' : 'Não encontrei tarefas nesse arquivo.';
	}
	async function doImport() {
		if (!preview) return;
		busy = true;
		try {
			const r = await api<{ created: number }>(`/boards/${boardId}/import`, { method: 'POST', body: JSON.stringify({ lists: preview }) });
			done = `${r.created} tarefas importadas`;
			preview = null;
			onimported();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	function onkey(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={onkey} />
<div class="scrim" onclick={onclose} aria-hidden="true"></div>

<div class="dialog" role="dialog" aria-modal="true" aria-label="Exportar ou importar">
	<header>
		<nav>
			<button class:on={tab === 'export'} onclick={() => (tab = 'export')}>exportar</button>
			<button class:on={tab === 'import'} onclick={() => (tab = 'import')}>importar .md</button>
		</nav>
		<button class="link" onclick={onclose}>fechar</button>
	</header>

	{#if tab === 'export'}
		{#if !data}
			<p class="meta">carregando…</p>
		{:else}
			<section>
				<p class="label">formato</p>
				<div class="formats">
					{#each FORMATS as fm (fm.key)}
						<label class="fmt" class:on={format === fm.key}>
							<input type="radio" name="fmt" value={fm.key} bind:group={format} />
							<b>{fm.label}</b><span class="meta">{fm.hint}</span>
						</label>
					{/each}
				</div>
			</section>

			<section>
				<p class="label">campos <span class="meta">(o título sempre vai)</span></p>
				<div class="checks">
					{#each FIELDS as fl (fl.key)}
						<label><input type="checkbox" value={fl.key} bind:group={fields} /> {fl.label}</label>
					{/each}
				</div>
			</section>

			<section>
				<p class="label">cards</p>
				<div class="checks">
					{#each listNames as n (n)}
						<label><input type="checkbox" value={n} bind:group={lists} /> {n}</label>
					{/each}
				</div>
				<label class="opt"><input type="checkbox" bind:checked={includeDone} /> incluir tarefas concluídas</label>
			</section>

			<footer>
				<span class="meta">{selected.length} tarefas</span>
				<button class="btn primary" disabled={busy || !selected.length} onclick={run}>{busy ? 'gerando…' : `baixar ${format}`}</button>
			</footer>
		{/if}
	{:else}
		<section>
			<p class="label">Importe um arquivo .md para este quadro.</p>
			<ul class="meta how">
				<li><code>## Nome</code> vira um card (usa o existente se o nome for igual)</li>
				<li><code>### Tarefa</code> ou <code>- Tarefa</code> vira tarefa</li>
				<li><code>- [ ] item (20%)</code> logo abaixo da tarefa vira checklist</li>
				<li>o resto do texto vira a descrição</li>
			</ul>
			<label class="btn file">escolher arquivo .md<input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden onchange={(e) => pick(e.currentTarget.files)} /></label>
		</section>
		{#if preview}
			<section>
				<p class="label">prévia</p>
				<ul class="preview">
					{#each preview as l (l.name)}
						<li><b>{l.name}</b> <span class="meta">{l.tasks.length} tarefas</span></li>
					{/each}
				</ul>
				<footer>
					<span class="meta">{preview.reduce((s, l) => s + l.tasks.length, 0)} tarefas</span>
					<button class="btn primary" disabled={busy} onclick={doImport}>{busy ? 'importando…' : 'importar'}</button>
				</footer>
			</section>
		{/if}
	{/if}

	{#if error}<p class="err">{error}</p>{/if}
	{#if done}<p class="ok" role="status">{done} ✓</p>{/if}
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: var(--scrim);
		z-index: 20;
	}
	.dialog {
		position: fixed;
		z-index: 21;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(640px, calc(100vw - 24px));
		max-height: calc(100dvh - 24px);
		overflow-y: auto;
		background: var(--white);
		border: var(--rule);
		padding: 0 20px 20px;
		display: grid;
		gap: 18px;
	}
	header {
		position: sticky;
		top: 0;
		background: var(--white);
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		padding: 16px 0 10px;
		border-bottom: var(--rule);
	}
	nav {
		display: flex;
		gap: 20px;
	}
	nav button {
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
		font-size: var(--t-md);
		color: var(--grey);
	}
	nav button.on {
		color: var(--black);
		box-shadow: inset 0 -2px 0 var(--accent);
	}
	.link {
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
		font-size: var(--t-sm);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	section {
		display: grid;
		gap: 10px;
	}
	.formats {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
		gap: 6px;
	}
	.fmt {
		border: var(--rule);
		padding: 10px;
		display: grid;
		gap: 4px;
		cursor: pointer;
	}
	.fmt input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.fmt b {
		font-weight: 400;
		font-size: var(--t-lg);
	}
	.fmt.on {
		background: var(--black);
		color: var(--white);
	}
	.fmt.on .meta {
		color: var(--grey);
	}
	.fmt:focus-within {
		outline: 2px solid var(--accent);
	}
	.checks {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 18px;
		font-size: var(--t-sm);
	}
	.checks label,
	.opt {
		display: flex;
		gap: 6px;
		align-items: center;
		cursor: pointer;
		font-size: var(--t-sm);
	}
	input[type='checkbox'] {
		accent-color: var(--accent);
	}
	footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-top: var(--rule-soft);
		padding-top: 14px;
	}
	.how {
		margin: 0;
		padding-left: 18px;
		display: grid;
		gap: 4px;
	}
	code {
		font-family: var(--mono);
		color: var(--black);
	}
	.file {
		justify-self: start;
	}
	.preview {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}
	.preview b {
		font-weight: 500;
	}
	.err {
		color: var(--accent);
	}
	.ok {
		font-size: var(--t-sm);
	}
</style>

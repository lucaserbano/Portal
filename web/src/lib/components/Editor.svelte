<script lang="ts">
	// Editor da descrição. Salva em markdown.
	// @ menciona pessoas  → [@Nome](person:pe_x)
	// # referencia tarefas → [Título](task:t_x)
	import { onDestroy, onMount } from 'svelte';
	import { Editor, Extension } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Highlight from '@tiptap/extension-highlight';
	import { Markdown } from '@tiptap/markdown';
	import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion';
	import { PluginKey } from '@tiptap/pm/state';
	import { api } from '#lib/api.ts';

	type Person = { id: string; name: string };
	type Item = { id: string; label: string; hint?: string; create?: boolean };

	let {
		value,
		people,
		onchange,
		onpeople,
		onopentask
	}: {
		value: string;
		people: Person[];
		onchange: (md: string) => void;
		onpeople: (p: Person) => void;
		onopentask: (id: string) => void;
	} = $props();

	let el: HTMLDivElement;
	let editor = $state<Editor | null>(null);
	let tick = $state(0); // força atualizar a barra de ferramentas
	let linkOpen = $state(false);
	let linkUrl = $state('');
	let markOpen = $state(false);

	const MARKS = [
		{ color: '#ffd1e4', name: 'rosa' },
		{ color: '#fff0a6', name: 'amarelo' },
		{ color: '#cdeccb', name: 'verde' },
		{ color: '#d3e2ff', name: 'azul' }
	];

	// ---------- Marca-texto com cor que sobrevive ao markdown ----------
	const ColorHighlight = Highlight.extend({
		renderMarkdown(node: any, h: any) {
			const c = node.attrs?.color;
			return c ? `<mark data-color="${c}">${h.renderChildren(node)}</mark>` : `==${h.renderChildren(node)}==`;
		},
		parseMarkdown(token: any, h: any) {
			return h.applyMark('highlight', h.parseInline(token.tokens || []), token.color ? { color: token.color } : undefined);
		},
		markdownTokenizer: {
			name: 'highlight',
			level: 'inline',
			start: (src: string) => {
				const a = src.indexOf('=='),
					b = src.indexOf('<mark');
				return a < 0 ? b : b < 0 ? a : Math.min(a, b);
			},
			tokenize(src: string, _: unknown, h: any) {
				let m = /^<mark data-color="(#[0-9a-fA-F]{6})">([\s\S]*?)<\/mark>/.exec(src);
				if (m) return { type: 'highlight', raw: m[0], text: m[2], color: m[1], tokens: h.inlineTokens(m[2]) };
				m = /^(==)(?!\s)([^=]*[^=\s])(==)/.exec(src);
				if (m) return { type: 'highlight', raw: m[0], text: m[2].trim(), tokens: h.inlineTokens(m[2].trim()) };
			}
		}
	} as any).configure({ multicolor: true });

	// ---------- Sugestões (@ e #) ----------
	let sug = $state<{ items: Item[]; index: number; rect: DOMRect | null; char: string } | null>(null);
	let sugCommand: ((item: Item) => void) | null = null;

	function suggestionFor(char: '@' | '#') {
		return Extension.create({
			name: char === '@' ? 'mentionSuggest' : 'taskSuggest',
			addProseMirrorPlugins() {
				return [
					Suggestion({
						editor: this.editor,
						char,
						pluginKey: new PluginKey(char === '@' ? 'mention' : 'taskref'),
						allowSpaces: true,
						items: async ({ query }): Promise<Item[]> => {
							const q = query.trim().toLowerCase();
							if (char === '@') {
								const found: Item[] = people
									.filter((p) => p.name.toLowerCase().includes(q))
									.slice(0, 6)
									.map((p) => ({ id: p.id, label: p.name }));
								if (q && !people.some((p) => p.name.toLowerCase() === q)) {
									found.push({ id: '', label: query.trim(), create: true });
								}
								return found;
							}
							const r = await api<{ tasks: { id: string; title: string; board_name: string | null }[] }>(
								`/tasks-search?q=${encodeURIComponent(query.trim())}`
							);
							return r.tasks.map((t) => ({ id: t.id, label: t.title, hint: t.board_name ?? 'inbox' }));
						},
						command: async ({ editor, range, props }) => {
							const item = props as unknown as Item;
							let id = item.id;
							let label = item.label;
							if (item.create) {
								const r = await api<{ id: string }>('/people', { method: 'POST', body: JSON.stringify({ name: label }) });
								id = r.id;
								onpeople({ id, name: label });
							}
							const text = char === '@' ? `@${label}` : label;
							const href = char === '@' ? `person:${id}` : `task:${id}`;
							editor
								.chain()
								.focus()
								.deleteRange(range)
								.insertContent([
									{ type: 'text', text, marks: [{ type: 'link', attrs: { href } }] },
									{ type: 'text', text: ' ' }
								])
								.run();
						},
						render: () => ({
							onStart: (p: SuggestionProps) => {
								sugCommand = (item) => p.command(item as any);
								sug = { items: p.items as Item[], index: 0, rect: p.clientRect?.() ?? null, char };
							},
							onUpdate: (p: SuggestionProps) => {
								sugCommand = (item) => p.command(item as any);
								sug = { items: p.items as Item[], index: 0, rect: p.clientRect?.() ?? null, char };
							},
							onKeyDown: ({ event }: SuggestionKeyDownProps) => {
								if (!sug || !sug.items.length) return false;
								if (event.key === 'ArrowDown') return ((sug.index = (sug.index + 1) % sug.items.length), true);
								if (event.key === 'ArrowUp') return ((sug.index = (sug.index - 1 + sug.items.length) % sug.items.length), true);
								if (event.key === 'Enter' || event.key === 'Tab') {
									sugCommand?.(sug.items[sug.index]);
									return true;
								}
								if (event.key === 'Escape') return ((sug = null), true);
								return false;
							},
							onExit: () => {
								sug = null;
								sugCommand = null;
							}
						})
					})
				];
			}
		});
	}

	// ---------- Colar código: vira bloco de código ----------
	function looksLikeCode(text: string) {
		const lines = text.split('\n').filter((l) => l.trim());
		if (lines.length < 2) return false;
		const indented = lines.filter((l) => /^(\t| {2,})/.test(l)).length;
		const symbols = lines.filter((l) => /[;{}]\s*$|=>|^\s*(const|let|var|function|def|class|import|return|if|for|<\/?[a-z]+[ >])/.test(l)).length;
		return indented / lines.length >= 0.4 || symbols / lines.length >= 0.5;
	}

	onMount(() => {
		editor = new Editor({
			element: el,
			extensions: [
				StarterKit.configure({
					heading: false, // sem tamanhos de fonte
					link: {
						openOnClick: false,
						autolink: true,
						protocols: ['person', 'task'],
						isAllowedUri: (url: string) => /^(https?:|mailto:|person:|task:)/i.test(url)
					}
				}),
				ColorHighlight,
				Markdown,
				suggestionFor('@'),
				suggestionFor('#')
			],
			// títulos (##) viram negrito: o editor não tem tamanhos de fonte
			content: value.replace(/^#{1,6} +(.+)$/gm, '**$1**'),
			contentType: 'markdown',
			editorProps: {
				attributes: { class: 'prose', 'aria-label': 'Descrição' },
				handlePaste(view, event) {
					const cb = event.clipboardData;
					if (!cb) return false;
					const text = cb.getData('text/plain');
					const fromIde = cb.types.includes('vscode-editor-data');
					if (!text || !(fromIde || (!cb.types.includes('text/html') && looksLikeCode(text)))) return false;
					const { schema } = view.state;
					const node = schema.nodes.codeBlock.create(null, schema.text(text.replace(/\n$/, '')));
					view.dispatch(view.state.tr.replaceSelectionWith(node));
					return true;
				},
				handleClick(_view, _pos, event) {
					const a = (event.target as HTMLElement).closest('a');
					const href = a?.getAttribute('href') ?? '';
					if (href.startsWith('task:')) {
						onopentask(href.slice(5));
						return true;
					}
					if (/^https?:/.test(href) && (event.metaKey || event.ctrlKey)) {
						window.open(href, '_blank', 'noopener');
						return true;
					}
					return false;
				}
			},
			onUpdate: ({ editor }) => onchange(editor.getMarkdown()),
			onTransaction: () => tick++
		});
	});

	onDestroy(() => editor?.destroy());

	/** Insere texto onde está o cursor (ex.: citar [imagem 2] no roteiro) */
	export function insert(text: string) {
		editor?.chain().focus().insertContent(text).run();
	}

	const active = (name: string, attrs?: object) => {
		void tick; // reavalia a cada transação
		return editor?.isActive(name, attrs) ?? false;
	};
	const cmd = () => editor!.chain().focus();

	function applyLink(e: SubmitEvent) {
		e.preventDefault();
		let url = linkUrl.trim();
		if (url && !/^(https?:|mailto:)/i.test(url)) url = 'https://' + url;
		if (url) cmd().extendMarkRange('link').setLink({ href: url }).run();
		else cmd().extendMarkRange('link').unsetLink().run();
		linkOpen = false;
		linkUrl = '';
	}

	function openLink() {
		linkUrl = editor?.getAttributes('link').href ?? '';
		linkOpen = !linkOpen;
		markOpen = false;
	}
</script>

<div class="wrap">
	{#if editor}
		<div class="bar" role="toolbar" aria-label="Formatação">
			<button class:on={active('bold')} onclick={() => cmd().toggleBold().run()} title="Negrito (⌘B)"><b>B</b></button>
			<button class:on={active('italic')} onclick={() => cmd().toggleItalic().run()} title="Itálico (⌘I)"><i>I</i></button>
			<button class:on={active('underline')} onclick={() => cmd().toggleUnderline().run()} title="Sublinhado (⌘U)"><u>U</u></button>
			<button class:on={active('strike')} onclick={() => cmd().toggleStrike().run()} title="Riscado"><s>S</s></button>
			<span class="markwrap">
				<button class:on={active('highlight')} onclick={() => ((markOpen = !markOpen), (linkOpen = false))} title="Marca-texto"
					><span class="hl">A</span></button
				>
				{#if markOpen}
					<span class="pop">
						{#each MARKS as m (m.color)}
							<button
								class="sw"
								style:background={m.color}
								title={m.name}
								aria-label="marca-texto {m.name}"
								onclick={() => (cmd().setHighlight({ color: m.color }).run(), (markOpen = false))}
							></button>
						{/each}
						<button class="sw none" title="sem marca" aria-label="remover marca-texto" onclick={() => (cmd().unsetHighlight().run(), (markOpen = false))}
							>×</button
						>
					</span>
				{/if}
			</span>
			<span class="sep"></span>
			<button class:on={active('bulletList')} onclick={() => cmd().toggleBulletList().run()} title="Lista">•</button>
			<button class:on={active('orderedList')} onclick={() => cmd().toggleOrderedList().run()} title="Lista numerada">1.</button>
			<button class:on={active('blockquote')} onclick={() => cmd().toggleBlockquote().run()} title="Citação">“</button>
			<button class:on={active('codeBlock')} onclick={() => cmd().toggleCodeBlock().run()} title="Código">{'{}'}</button>
			<button class:on={active('link')} onclick={openLink} title="Link">↗</button>
			<span class="hint meta">@ pessoa # tarefa</span>
		</div>
		{#if linkOpen}
			<form class="linkform" onsubmit={applyLink}>
				<!-- svelte-ignore a11y_autofocus -->
				<input class="field" placeholder="https://… (vazio remove o link)" bind:value={linkUrl} autofocus />
				<button class="btn">ok</button>
			</form>
		{/if}
	{/if}

	<div class="area" bind:this={el}></div>

	{#if sug && sug.rect && sug.items.length}
		<ul class="sug" style:left="{sug.rect.left}px" style:top="{sug.rect.bottom + 6}px" role="listbox">
			{#each sug.items as it, i (it.id + it.label)}
				<li>
					<button
						class:on={i === sug.index}
						role="option"
						aria-selected={i === sug.index}
						onmousedown={(e) => (e.preventDefault(), sugCommand?.(it))}
					>
						{#if it.create}+ adicionar “{it.label}”{:else}{sug.char === '@' ? '@' : ''}{it.label}{/if}
						{#if it.hint}<span class="meta">{it.hint}</span>{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.wrap {
		border: var(--rule);
		position: relative;
	}
	.wrap:focus-within {
		border-color: var(--accent);
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px;
		padding: 4px;
		border-bottom: var(--rule-soft);
		position: sticky;
		top: 58px;
		background: var(--white);
		z-index: 2;
	}
	.bar button {
		min-width: 30px;
		height: 30px;
		border: 0;
		background: none;
		cursor: pointer;
		font-size: 14px;
		padding: 0 6px;
	}
	.bar button:hover {
		background: var(--grey-light);
	}
	.bar button.on {
		background: var(--black);
		color: var(--white);
	}
	.hl {
		background: #ffd1e4;
		color: #000;
		padding: 0 3px;
	}
	.on .hl {
		background: var(--accent);
	}
	.sep {
		width: 1px;
		height: 18px;
		background: var(--grey-light);
		margin: 0 4px;
	}
	.hint {
		margin-left: auto;
		padding-right: 4px;
	}
	.markwrap {
		position: relative;
	}
	.pop {
		position: absolute;
		top: 34px;
		left: 0;
		display: flex;
		gap: 4px;
		padding: 6px;
		background: var(--white);
		border: var(--rule);
		z-index: 5;
	}
	.pop .sw {
		width: 22px;
		height: 22px;
		min-width: 0;
		border: 1px solid var(--grey);
		padding: 0;
	}
	.sw.none {
		background: var(--white);
		line-height: 1;
	}
	.linkform {
		display: flex;
		gap: 8px;
		padding: 6px 10px;
		border-bottom: var(--rule-soft);
	}
	.linkform .field {
		padding: 4px 0;
		font-size: var(--t-sm);
	}
	.linkform .btn {
		padding: 4px 10px;
	}
	.area :global(.prose) {
		min-height: 160px;
		padding: 12px 14px;
		outline: none;
		font-size: var(--t-md);
		line-height: 1.55;
	}
	.area :global(.prose > * + *) {
		margin-top: 0.6em;
	}
	.area :global(.prose p) {
		margin: 0;
	}
	.area :global(.prose ul),
	.area :global(.prose ol) {
		padding-left: 1.3em;
		margin: 0;
	}
	.area :global(.prose blockquote) {
		margin: 0;
		padding-left: 12px;
		border-left: 2px solid var(--black);
		color: var(--soft);
	}
	.area :global(.prose pre) {
		background: var(--code-bg);
		padding: 10px 12px;
		font: 400 var(--t-sm) / 1.5 var(--mono);
		overflow-x: auto;
		white-space: pre;
	}
	.area :global(.prose code) {
		font-family: var(--mono);
		font-size: 0.9em;
		background: var(--code-bg);
		padding: 1px 3px;
	}
	.area :global(.prose pre code) {
		background: none;
		padding: 0;
	}
	.area :global(.prose mark) {
		padding: 0 2px;
		color: #000 !important; /* marca-texto claro: texto sempre escuro */
	}
	.area :global(.prose a) {
		cursor: text;
	}
	.area :global(.prose a[href^='person:']) {
		text-decoration: none;
		color: var(--accent);
	}
	.area :global(.prose a[href^='task:']) {
		text-decoration: none;
		border-bottom: 1px dashed var(--black);
		cursor: pointer;
	}
	.area :global(.prose a[href^='task:']::before) {
		content: '↳ ';
		color: var(--grey);
	}
	.sug {
		position: fixed;
		z-index: 30;
		list-style: none;
		margin: 0;
		padding: 4px 0;
		background: var(--white);
		border: var(--rule);
		min-width: 220px;
		max-width: 320px;
	}
	.sug button {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		width: 100%;
		border: 0;
		background: none;
		text-align: left;
		padding: 7px 10px;
		cursor: pointer;
		font-size: var(--t-sm);
	}
	.sug button.on {
		background: var(--black);
		color: var(--white);
	}
	.sug button.on .meta {
		color: var(--white);
	}
</style>

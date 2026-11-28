<script lang="ts">
	// Fundo de tela inteira de algumas páginas, fixo atrás de tudo. Cada um tem versão dia e noite
	// (troca só pelo CSS, com o tema). Os blocos das páginas ficam com fundo liso por cima.
	//   comprimidos: o túnel de cor visto através de comprimidos de vidro, a luz andando devagar
	//   menta:       menta → creme (dia), preto → menta (noite)
	//   noite:       branco → creme → vermelho (dia), preto → inferno → brasa → vermelho (noite)
	//   letreiro:    πύλη em comprimidos, aceso em vermelho
	import { onMount } from 'svelte';

	let { kind }: { kind: 'comprimidos' | 'menta' | 'noite' | 'letreiro' } = $props();

	// ---------- letreiro: a mesma grade do manual (cada letra com 5 de largura e 10 de altura) ----------
	const G: Record<string, string[]> = {
		π: ['.....', '.....', '.....', '#####', '.#.#.', '.#.#.', '.#.#.', '.#..#', '.....', '.....'],
		ύ: ['...#.', '..#..', '.....', '#...#', '#...#', '#...#', '#...#', '.###.', '.....', '.....'],
		λ: ['##...', '..#..', '..#..', '..#..', '.#.#.', '.#.#.', '#...#', '#...#', '.....', '.....'],
		η: ['.....', '.....', '.....', '#.##.', '##..#', '#...#', '#...#', '#...#', '....#', '....#']
	};
	const WORD = [...'πύλη'];
	const WORD_COLS = WORD.length * 5 + (WORD.length - 1); // 23

	let cols = $state(0);
	let rows = $state(0);
	let lit = $state(new Set<number>());

	function layout() {
		const W = innerWidth;
		const H = innerHeight;
		// comprimidos de no máximo 46 px; a palavra ocupa a largura toda no celular
		cols = Math.max(WORD_COLS + 4, Math.ceil(W / 46));
		const p = W / cols;
		rows = Math.ceil(H / p) + 1;
		const x0 = Math.floor((cols - WORD_COLS) / 2);
		// a palavra fica no pé da tela; a página de clientes tem um respiro no fim para ela aparecer inteira
		const y0 = Math.max(0, Math.floor(H / p) - 11);
		const s = new Set<number>();
		WORD.forEach((ch, i) =>
			G[ch].forEach((row, y) =>
				[...row].forEach((c, x) => {
					if (c === '#') s.add((y0 + y) * cols + x0 + i * 6 + x);
				})
			)
		);
		lit = s;
	}

	onMount(() => {
		if (kind !== 'letreiro') return;
		layout();
		let w = innerWidth;
		let h = innerHeight;
		const onResize = () => {
			// no iPhone a barra do Safari muda a altura ao rolar: só refaz em mudanças grandes
			if (Math.abs(innerWidth - w) > 40 || Math.abs(innerHeight - h) > 160) {
				w = innerWidth;
				h = innerHeight;
				layout();
			}
		};
		addEventListener('resize', onResize);
		return () => removeEventListener('resize', onResize);
	});
</script>

<div class="bg {kind}" aria-hidden="true">
	{#if kind === 'comprimidos'}
		<div class="luz"></div>
		<div class="vidro"></div>
	{:else if kind === 'letreiro' && cols}
		<div class="letreiro" style:--lc={cols}>
			{#each { length: cols * rows } as _, i (i)}<span class:on={lit.has(i)}></span>{/each}
		</div>
	{/if}
</div>

<style>
	.bg {
		position: fixed;
		inset: 0;
		z-index: -1;
		overflow: hidden;
		pointer-events: none;
		background: var(--white);
	}

	/* ---------- comprimidos ---------- */
	/* a luz: um túnel de cor bem maior que a tela, que anda devagar (só transform, leve no iPhone) */
	.luz {
		position: absolute;
		inset: -30%;
		background: radial-gradient(
			circle at 50% 50%,
			#9e1500 0 7%,
			#c22000 15%,
			#ff0006 29%,
			#fff9cc 58%,
			#ffffff 72%
		);
	}
	:global([data-theme='dark']) .luz {
		background: radial-gradient(circle at 50% 50%, #ff0006 0 6%, #c22000 18%, #9e1500 30%, #3a0800 46%, #000 64%);
	}
	@media (prefers-reduced-motion: no-preference) {
		.luz {
			animation: luz 16s ease-in-out infinite alternate;
		}
		@keyframes luz {
			0% {
				transform: translate(-7%, -5%);
			}
			50% {
				transform: translate(6%, 5%);
			}
			100% {
				transform: translate(-2%, 8%);
			}
		}
	}
	/* o vidro: comprimidos quase encostados, um padrão só por cima da luz (sem desfoque por comprimido) */
	.vidro {
		--p: clamp(30px, 7.4vw, 54px);
		position: absolute;
		inset: 0;
		background-size: var(--p) var(--p);
		background-image:
			radial-gradient(circle closest-side, rgb(255 255 255 / 0.1) 0, rgb(255 255 255 / 0) 55%, transparent 100%),
			radial-gradient(
				circle closest-side,
				rgb(255 255 255 / 0.05) 0 84%,
				rgb(255 60 50 / 0.5) 92%,
				rgb(110 12 4 / 0.18) 97%,
				transparent 100%
			);
	}
	:global([data-theme='dark']) .vidro {
		background-image:
			radial-gradient(circle closest-side, rgb(255 255 255 / 0.06) 0, rgb(255 255 255 / 0) 55%, transparent 100%),
			radial-gradient(
				circle closest-side,
				rgb(255 255 255 / 0.03) 0 84%,
				rgb(255 60 50 / 0.3) 92%,
				rgb(0 0 0 / 0.4) 97%,
				transparent 100%
			);
	}

	/* ---------- degradês ---------- */
	.menta {
		background: linear-gradient(in oklab 180deg, #02d7a4, #fff9cc);
	}
	:global([data-theme='dark']) .menta {
		background: linear-gradient(in oklab 180deg, #000 0%, #000 12%, #02d7a4 100%);
	}
	.noite {
		background: linear-gradient(180deg, #fff 0%, #fff9cc 40%, #ff0006 100%);
	}
	:global([data-theme='dark']) .noite {
		background: linear-gradient(180deg, #000 0%, #9e1500 55%, #c22000 80%, #ff0006 100%);
	}

	/* ---------- letreiro ---------- */
	.letreiro {
		display: grid;
		grid-template-columns: repeat(var(--lc), 1fr);
		gap: 1px;
	}
	.letreiro span {
		aspect-ratio: 1;
		border-radius: 50%;
		background: rgb(110 12 4 / 0.035);
		box-shadow: inset 0 0 2px 1px rgb(110 12 4 / 0.08);
	}
	:global([data-theme='dark']) .letreiro span {
		background: rgb(255 255 255 / 0.035);
		box-shadow: inset 0 0 2px 1px rgb(255 0 6 / 0.1);
	}
	.letreiro span.on,
	:global([data-theme='dark']) .letreiro span.on {
		background: #ff0006;
		box-shadow:
			inset 0 0 2px 1px rgb(255 150 140 / 0.55),
			inset -1px -1px 3px rgb(110 12 4 / 0.25);
	}
</style>

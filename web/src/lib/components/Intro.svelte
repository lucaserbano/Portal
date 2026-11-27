<script lang="ts">
	// Abertura: "πύλη" vem em zoom acelerando, se desfaz em feixes de linhas finas que viram portais
	// (aberturas retangulares, como as salas de luz de Turrell) e a câmera atravessa o túnel até a página.
	// Canvas puro, ~1,8 s. Toque/clique pula. Com "reduzir movimento", só um esmaecer rápido.
	import { onMount } from 'svelte';

	let { ondone }: { ondone: () => void } = $props();

	let canvas = $state<HTMLCanvasElement>()!;
	let fading = $state(false);
	let gone = $state(false);
	const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

	const PINK = [255, 0, 111] as const;
	const T_ZOOM = 0.72; // fim do zoom da palavra
	const T_TUNNEL = 1.45; // começa a esmaecer ainda dentro do túnel
	const T_END = 1.8;

	function finish() {
		if (fading) return;
		fading = true;
		setTimeout(() => {
			gone = true;
			ondone();
		}, reduce ? 260 : 420);
	}

	onMount(() => {
		if (reduce) {
			const t = setTimeout(finish, 350);
			return () => clearTimeout(t);
		}
		const ctx = canvas.getContext('2d')!;
		const dpr = Math.min(1.5, devicePixelRatio || 1); // leve no iPhone
		let W = 0;
		let H = 0;
		const resize = () => {
			W = innerWidth;
			H = innerHeight;
			canvas.width = W * dpr;
			canvas.height = H * dpr;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		};
		resize();
		addEventListener('resize', resize);

		// a palavra desenhada uma vez num canvas próprio (para virar linhas depois)
		const word = document.createElement('canvas');
		const wctx = word.getContext('2d')!;
		const FS = 220;
		wctx.font = `400 ${FS}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
		const tw = Math.ceil(wctx.measureText('πύλη').width) + 40;
		word.width = tw;
		word.height = FS * 1.5;
		wctx.font = `400 ${FS}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
		wctx.fillStyle = `rgb(${PINK})`;
		wctx.textBaseline = 'middle';
		wctx.fillText('πύλη', 20, word.height / 2);

		// portais: proporção de porta (estreita e alta), cada um nasce no fundo e passa pela câmera
		type Portal = { z0: number; ratio: number; lines: number; seed: number; fill: number };
		const portals: Portal[] = Array.from({ length: 9 }, (_, i) => ({
			z0: 0.9 + i * 0.75,
			ratio: i % 3 === 0 ? 0.5 : i % 3 === 1 ? 0.62 : 0.42,
			lines: 3 + (i % 3),
			seed: i * 97.13,
			fill: i % 4
		}));
		const rnd = (s: number) => {
			const x = Math.sin(s) * 43758.5453;
			return x - Math.floor(x);
		};

		// traço "à mão": retângulo com pequenas tremidas que mudam a cada ~4 quadros (boil)
		function wobblyRect(cx: number, cy: number, w: number, h: number, seed: number, amp: number) {
			const pts: [number, number][] = [];
			const steps = 4;
			const corners: [number, number][] = [
				[cx - w / 2, cy - h / 2],
				[cx + w / 2, cy - h / 2],
				[cx + w / 2, cy + h / 2],
				[cx - w / 2, cy + h / 2]
			];
			for (let c = 0; c < 4; c++) {
				const [ax, ay] = corners[c];
				const [bx, by] = corners[(c + 1) % 4];
				for (let k = 0; k < steps; k++) {
					const f = k / steps;
					pts.push([ax + (bx - ax) * f + (rnd(seed + c * 13 + k) - 0.5) * amp, ay + (by - ay) * f + (rnd(seed + c * 31 + k * 7) - 0.5) * amp]);
				}
			}
			ctx.beginPath();
			ctx.moveTo(pts[0][0], pts[0][1]);
			for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
			ctx.closePath();
			ctx.stroke();
		}

		const t0 = performance.now();
		let raf = 0;
		const frame = (now: number) => {
			const t = (now - t0) / 1000;
			ctx.globalCompositeOperation = 'source-over';
			ctx.globalAlpha = 1;
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, W, H);
			const cx = W / 2;
			const cy = H / 2;
			const boil = Math.floor(t * 15); // a tremida muda ~15 vezes por segundo

			// ---------- 1. a palavra em zoom acelerando, se desfazendo em linhas ----------
			if (t < T_ZOOM + 0.2) {
				const p = Math.min(1, t / T_ZOOM);
				const base = Math.min(W * 0.5, 420) / tw;
				const scale = base * Math.exp(Math.pow(p, 2.6) * 5.2); // acelera até encher a tela
				const dw = tw * scale;
				const dh = word.height * scale;
				const dissolve = Math.max(0, (p - 0.6) / 0.4); // 0 → 1: vira linhas
				const alpha = t < 0.12 ? t / 0.12 : t > T_ZOOM ? Math.max(0, 1 - (t - T_ZOOM) / 0.2) : 1;
				ctx.globalAlpha = alpha;
				if (dissolve <= 0) {
					ctx.drawImage(word, cx - dw / 2, cy - dh / 2, dw, dh);
				} else {
					// fatias horizontais finas que se afastam do centro (como o N da Netflix virando fitas)
					const slices = 48;
					for (let i = 0; i < slices; i++) {
						const sy = (i / slices) * word.height;
						const sh = word.height / slices;
						const gap = 1 - dissolve * 0.75; // fitas ficam mais finas
						const off = (rnd(i * 3.1 + boil * 0.01) - 0.5) * dissolve * dw * 0.18;
						const ty = cy - dh / 2 + (i / slices) * dh;
						ctx.drawImage(word, 0, sy, tw, sh * gap, cx - dw / 2 + off, ty, dw, (dh / slices) * gap);
					}
				}
				ctx.globalAlpha = 1;
			}

			// ---------- 2. túnel de portais desenhados em feixes de linhas ----------
			if (t > T_ZOOM - 0.3 && t < T_END + 0.4) {
				const speed = 4.2;
				const tt = Math.max(0, t - (T_ZOOM - 0.3));
				const fadeIn = Math.min(1, tt / 0.25);
				const SPAN = portals.length * 0.75;
				const travel = tt * speed * (1 + tt * 0.9);
				const ordered = portals
					// túnel contínuo: quem passa da câmera volta para o fundo
					.map((pt) => ({ ...pt, z: ((((pt.z0 - travel - 0.05) % SPAN) + SPAN) % SPAN) + 0.05 }))
					.filter((pt) => pt.z < 8)
					.sort((a, b) => b.z - a.z); // do fundo para a frente
				const unit = Math.min(W, H) * 0.42;
				for (const pt of ordered) {
					const s = 1 / pt.z;
					const h = unit * 1.9 * s;
					const w = h * pt.ratio;
					const near = Math.min(1, s / 3);
					const a = fadeIn * Math.min(1, (8 - pt.z) / 3) * (pt.z < 0.25 ? pt.z / 0.25 : 1);
					// luz dentro da abertura (como a sala vermelha): gradiente magenta → preto
					if (pt.fill === 1 || pt.fill === 3) {
						ctx.fillStyle = `rgba(${PINK},${0.12 * a})`;
						ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
					}
					// feixe de linhas finas: brilho largo e fraco + linhas finas nítidas
					for (let k = 0; k < pt.lines; k++) {
						const inset = 1 - k * 0.04;
						const amp = 2 + near * 8;
						const seed = pt.seed + k * 5 + boil * 1.7;
						// brilho só nos portais perto da câmera (economiza desenho)
						if (near > 0.35 && k === 0) {
							ctx.lineWidth = 10 + near * 8;
							ctx.strokeStyle = `rgba(${PINK},${0.08 * a})`;
							wobblyRect(cx, cy, w * inset, h * inset, seed, amp);
						}
						ctx.lineWidth = 0.7 + near * 1.3;
						ctx.strokeStyle = k % 3 === 2 ? `rgba(255,255,255,${0.55 * a})` : `rgba(${PINK},${0.9 * a})`;
						wobblyRect(cx, cy, w * inset, h * inset, seed, amp);
					}
				}
			}

			if (t >= T_TUNNEL) finish();
			if (!gone && t < T_END + 0.6) raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);
		return () => {
			cancelAnimationFrame(raf);
			removeEventListener('resize', resize);
		};
	});
</script>

{#if !gone}
	<div class="intro" class:fading class:reduce onclick={finish} onkeydown={(e) => e.key === 'Escape' && finish()} role="presentation">
		<canvas bind:this={canvas} aria-hidden="true"></canvas>
		<span class="sr-only">πύλη</span>
	</div>
{/if}

<style>
	.intro {
		position: fixed;
		inset: 0;
		z-index: 1000;
		background: #000;
		cursor: pointer;
		transition: opacity 0.42s ease-out;
	}
	.intro.reduce {
		transition-duration: 0.26s;
	}
	.intro.fading {
		opacity: 0;
		pointer-events: none;
	}
	canvas {
		width: 100%;
		height: 100%;
		display: block;
	}
</style>

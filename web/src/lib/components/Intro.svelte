<script lang="ts">
	// Abertura: o símbolo aparece e a porta sobe (passa da altura e volta). A câmera se aproxima acelerando
	// e, enquanto se aproxima, a lente abre (distância focal menor, as bordas se curvam). Atravessamos a porta
	// e seguimos por um túnel de portas (só o contorno) que desce e sobe uma vez; na última, a página aparece.
	// Canvas puro, cerca de 2,9 s. Toque/clique pula. Com "reduzir movimento", só um esmaecer rápido.
	import { onMount } from 'svelte';
	import { theme } from '#lib/theme.svelte.ts';

	let { ondone }: { ondone: () => void } = $props();

	let canvas = $state<HTMLCanvasElement>()!;
	let fading = $state(false);
	let gone = $state(false);
	const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

	function finish() {
		if (fading) return;
		fading = true;
		setTimeout(
			() => {
				gone = true;
				ondone();
			},
			reduce ? 260 : 420
		);
	}

	// ---------- o símbolo, em unidades de 0 a 100 (a porta tem o centro em 50, 75) ----------
	const MAG = '#FF0006';
	// fundo conforme o modo escolhido (no login ou no menu)
	const BG = theme.v === 'light' ? '#fff' : '#000';
	const DOOR = { x: 41, y: 56, w: 18, h: 38 };
	const DC = { x: 50, y: 75 };

	// ---------- tempos ----------
	const T_SWING = 1.05; // a porta sobe
	const T_MOVE = 1.8; // aproximação + túnel
	const FOCAL_END = 0.42; // lente mais aberta (distância focal relativa)

	// túnel: muitas portas, quase coladas; o caminho desce uma vez e sobe uma vez
	const N = 90;
	const GAP = 0.05;
	const LEN = N * GAP;
	const AMP = 30;
	const track = (p: number) => (AMP * (1 - Math.cos(Math.max(0, Math.min(1, (p - 1) / LEN)) * Math.PI * 2))) / 2;

	const smooth = (x: number) => {
		x = Math.max(0, Math.min(1, x));
		return x * x * (3 - 2 * x);
	};
	const easeIn = (x: number) => x * x * x;
	const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
	const inOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

	// porta do símbolo: sobe acelerando, passa ~24% da altura e volta desacelerando
	function doorScale(t: number) {
		if (t <= 0) return 0;
		const p = Math.min(1, t / T_SWING);
		const k = 0.56;
		return p < k ? 1.24 * easeIn(p / k) : 1.24 - 0.24 * easeOut((p - k) / (1 - k));
	}
	// câmera: um movimento só; a lente abre enquanto ela se aproxima do símbolo
	function camera(t: number) {
		const f = t - T_SWING;
		if (f <= 0) return { travel: 0, focal: 1 };
		const travel = (1 + LEN + 0.1) * inOutCubic(Math.min(1, f / T_MOVE));
		return { travel, focal: 1 - (1 - FOCAL_END) * smooth(travel) };
	}
	// altura da câmera: média do caminho logo à frente (antecipa a curva, sem balançar)
	function camHeight(travel: number) {
		let sum = 0;
		for (let k = 0; k < 9; k++) sum += track(travel + k * 0.08);
		return sum / 9;
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

		// lente: distorção em barril (as retas se curvam para fora perto das bordas)
		let LENS = 0;
		let CX = 0;
		let CY = 0;
		let RR = 1;
		const lens = (x: number, y: number): [number, number] => {
			if (LENS <= 0) return [x, y];
			const nx = (x - CX) / RR;
			const ny = (y - CY) / RR;
			const k = 1 / (1 + LENS * Math.min(nx * nx + ny * ny, 4));
			return [CX + nx * k * RR, CY + ny * k * RR];
		};
		// polígono com as arestas subdivididas, para a distorção curvar as retas
		const poly = (pts: [number, number][], steps: number) => {
			ctx.beginPath();
			for (let i = 0; i < pts.length; i++) {
				const [ax, ay] = pts[i];
				const [bx, by] = pts[(i + 1) % pts.length];
				for (let k = 0; k < steps; k++) {
					const [px, py] = lens(ax + ((bx - ax) * k) / steps, ay + ((by - ay) * k) / steps);
					if (i === 0 && k === 0) ctx.moveTo(px, py);
					else ctx.lineTo(px, py);
				}
			}
			ctx.closePath();
		};

		const t0 = performance.now();
		let raf = 0;
		const frame = (now: number) => {
			const t = (now - t0) / 1000;
			ctx.globalAlpha = 1;
			ctx.fillStyle = BG;
			ctx.fillRect(0, 0, W, H);
			CX = W / 2;
			CY = H / 2;
			RR = Math.hypot(W, H) / 2;
			const base = (Math.min(W, H) * 0.55) / 100; // tamanho do símbolo em repouso, por unidade
			const { travel, focal } = camera(t);
			LENS = 0.32 * smooth((1 - focal) / (1 - FOCAL_END));
			const camY = camHeight(travel) * smooth((travel - 0.8) / 0.5);
			const toCenter = smooth(travel / 0.9); // em repouso o símbolo fica centrado; na aproximação, a porta
			const restOffset = (DC.y - 49) * base;
			const X = (v: number, u: number) => CX + (v - DC.x) * u;

			// o símbolo (porta 0)
			const z0 = 1 - travel;
			const logoOn = z0 > 0.012;
			const u0 = (base * focal) / Math.max(z0, 0.012);
			const cy0 = CY + restOffset * (1 - toCenter) - camY * u0;
			const k = doorScale(t);
			const top = 94 - DOOR.h * k;
			const Y0 = (v: number) => cy0 + (v - DC.y) * u0;

			// até atravessarmos o símbolo, o túnel só aparece pela porta dele
			if (logoOn) {
				ctx.save();
				poly([[X(DOOR.x, u0), Y0(top)], [X(DOOR.x + DOOR.w, u0), Y0(top)], [X(DOOR.x + DOOR.w, u0), Y0(94)], [X(DOOR.x, u0), Y0(94)]], 6);
				ctx.clip();
			}
			// túnel, do fundo para a frente
			const show = Math.min(1, Math.max(0, (t - T_SWING + 0.15) / 0.3));
			ctx.strokeStyle = MAG;
			for (let i = N; i >= 1; i--) {
				const pos = 1 + i * GAP;
				const z = pos - travel;
				if (z <= 0.02) continue;
				const u = (base * focal) / z;
				const cy = CY + restOffset * (1 - toCenter) + (track(pos) - camY) * u;
				const x0 = X(DOOR.x, u);
				const x1 = X(DOOR.x + DOOR.w, u);
				const y0 = cy + (DOOR.y - DC.y) * u;
				const y1 = cy + (94 - DC.y) * u;
				ctx.globalAlpha = show * Math.min(1, 0.25 + 0.9 / (z * 2.2)) * Math.min(1, (LEN + 1 - z) / 0.6);
				ctx.lineWidth = Math.max(0.6, Math.min(3, 0.9 / z));
				poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z < 0.6 ? 14 : 4);
				ctx.stroke();
			}
			ctx.globalAlpha = 1;
			if (logoOn) {
				ctx.restore();
				const pts: [number, number][] =
					k > 0.001
						? [[X(4, u0), Y0(94)], [X(41, u0), Y0(94)], [X(41, u0), Y0(top)], [X(59, u0), Y0(top)], [X(59, u0), Y0(94)], [X(96, u0), Y0(94)], [X(50, u0), Y0(4)]]
						: [[X(4, u0), Y0(94)], [X(96, u0), Y0(94)], [X(50, u0), Y0(4)]];
				ctx.globalAlpha = Math.min(1, t / 0.18);
				poly(pts, 18);
				ctx.fillStyle = MAG;
				ctx.fill();
				ctx.globalAlpha = 1;
			}
			// a página aparece quando passamos pela última porta
			if (1 + LEN - travel < 0.05) finish();
			if (!gone && t < T_SWING + T_MOVE + 0.6) raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);
		return () => {
			cancelAnimationFrame(raf);
			removeEventListener('resize', resize);
		};
	});
</script>

{#if !gone}
	<div class="intro" style:background={BG} class:fading class:reduce onclick={finish} onkeydown={(e) => e.key === 'Escape' && finish()} role="presentation">
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

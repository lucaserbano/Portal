// Fotos do site (privadas: links assinados da API). Carregadas uma vez por sessão.
import { api } from './api.ts';

export type Photo = { url: string; w: number; h: number; vibe: boolean };
let cache: Promise<Photo[]> | null = null;

export function photos() {
	cache ??= api<{ photos: Photo[] }>('/site-images')
		.then((d) => d.photos)
		.catch(() => ((cache = null), []));
	return cache;
}

/** Uma foto fixa para cada lugar, que muda a cada dia (sem repetir as "vibe", que ficam no mosaico) */
export function pick(list: Photo[], seed: string, vibe = false) {
	const pool = list.filter((p) => p.vibe === vibe);
	if (!pool.length) return null;
	let h = Math.floor(Date.now() / 86400000);
	for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
	return pool[h % pool.length];
}

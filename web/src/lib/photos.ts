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

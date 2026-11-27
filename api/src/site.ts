// Fotos do site (privadas no R2, prefixo site/). Só aparecem depois do login; a tela de login usa uma só.
import { Hono } from 'hono';
import type { Env } from './index';
import { signedUrl } from './files';

type Photo = { file: string; w: number; h: number; vibe: boolean };

async function manifest(env: Env): Promise<Photo[]> {
  const obj = await env.FILES.get('site/manifest.json');
  return obj ? ((await obj.json()) as Photo[]) : [];
}

export const siteImages = new Hono<{ Bindings: Env }>();
siteImages.get('/site-images', async (c) => {
  const o = new URL(c.req.url).origin;
  const list = await manifest(c.env);
  const photos = await Promise.all(list.map(async (p) => ({ url: await signedUrl(c.env, o, `site/${p.file}`), w: p.w, h: p.h, vibe: p.vibe })));
  c.header('Cache-Control', 'private, max-age=3600');
  return c.json({ photos });
});

// Uma foto "vibe" para a tela de login (muda a cada dia)
export const loginImage = new Hono<{ Bindings: Env }>();
loginImage.get('/public/login-image', async (c) => {
  const vibe = (await manifest(c.env)).filter((p) => p.vibe);
  if (!vibe.length) return c.json({ photo: null });
  const p = vibe[Math.floor(Date.now() / 86400000) % vibe.length];
  return c.json({ photo: { url: await signedUrl(c.env, new URL(c.req.url).origin, `site/${p.file}`), w: p.w, h: p.h } });
});

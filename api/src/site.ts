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

// A foto da tela de login: a sala de luz com a cadeira (cosmos_470762718, tom já ajustado)
const LOGIN_PHOTO = 'pyle-23.webp';
export const loginImage = new Hono<{ Bindings: Env }>();
loginImage.get('/public/login-image', async (c) => {
  const p = (await manifest(c.env)).find((x) => x.file === LOGIN_PHOTO);
  if (!p) return c.json({ photo: null });
  return c.json({ photo: { url: await signedUrl(c.env, new URL(c.req.url).origin, `site/${p.file}`), w: p.w, h: p.h } });
});

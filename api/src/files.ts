// Arquivos no R2 (privado). O navegador recebe URLs assinadas e temporárias,
// porque <img src> não consegue mandar o token de login.
import type { Env } from './index';

const enc = new TextEncoder();
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

async function hmac(env: Env, data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.FILE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!);
}

/** URL válida por ~7 dias (arredondada ao dia, para o navegador poder guardar em cache) */
export async function signedUrl(env: Env, origin: string, key: string) {
  const day = 86400;
  const exp = Math.ceil(Date.now() / 1000 / day) * day + 7 * day;
  return `${origin}/files/${encodeURIComponent(key)}?e=${exp}&s=${await hmac(env, `${key}:${exp}`)}`;
}

export async function verify(env: Env, key: string, exp: string | undefined, sig: string | undefined) {
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return (await hmac(env, `${key}:${exp}`)) === sig;
}

/** Bytes já usados pelo portal (anexos, capas de modelos, imagens de roteiros) */
export async function usedBytes(env: Env) {
  const r = await env.DB.prepare(
    `SELECT (SELECT COALESCE(SUM(size),0) FROM attachments WHERE kind = 'file')
          + (SELECT COALESCE(SUM(cover_size),0) FROM templates)
          + (SELECT COALESCE(SUM(size),0) FROM script_images)
          + (SELECT COALESCE(SUM(brand_logo_size),0) FROM clients) AS n`,
  ).first<{ n: number }>();
  return r?.n ?? 0;
}

export async function copyObject(env: Env, from: string, to: string) {
  const obj = await env.FILES.get(from);
  if (!obj) return false;
  await env.FILES.put(to, obj.body, { httpMetadata: obj.httpMetadata });
  return true;
}

type Row = Record<string, any>;
export const BRAND_COLORS = ['brand_text', 'brand_bg', 'brand_section', 'brand_question', 'brand_accent'] as const;

/** Marca do cliente para as páginas públicas; null quando nada foi configurado (fica a cara padrão) */
export async function brandOf(env: Env, origin: string, cl: Row | null | undefined) {
  if (!cl) return null;
  const b = {
    text: cl.brand_text || null,
    bg: cl.brand_bg || null,
    section: cl.brand_section || null,
    question: cl.brand_question || null,
    accent: cl.brand_accent || null,
    logo: cl.brand_logo_key ? await signedUrl(env, origin, cl.brand_logo_key) : null,
  };
  return Object.values(b).some(Boolean) ? b : null;
}

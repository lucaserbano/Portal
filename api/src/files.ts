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
          + (SELECT COALESCE(SUM(size),0) FROM script_images) AS n`,
  ).first<{ n: number }>();
  return r?.n ?? 0;
}

export async function copyObject(env: Env, from: string, to: string) {
  const obj = await env.FILES.get(from);
  if (!obj) return false;
  await env.FILES.put(to, obj.body, { httpMetadata: obj.httpMetadata });
  return true;
}

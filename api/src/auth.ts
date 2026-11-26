// Senha: formato "pbkdf2$<iterações>$<sal base64>$<hash base64>"
// Sessão: token aleatório entregue ao navegador; no banco fica só o SHA-256 dele.

const enc = new TextEncoder();

const b64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iter, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2' || !iter || !salt || !hash) return false;
  const derived = new Uint8Array(await pbkdf2(password, unb64(salt), Number(iter)));
  return timingSafeEqual(derived, unb64(hash));
}

export async function sha256(text: string) {
  return b64(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return b64(bytes).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!);
}

export const SESSION_DAYS = 30;
export const MAX_FAILS = 5;
export const FAIL_WINDOW_S = 15 * 60;

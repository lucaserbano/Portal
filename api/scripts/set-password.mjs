// Gera uma senha forte, copia para a área de transferência (sem exibir)
// e escreve o hash PBKDF2 em stdout (para `wrangler secret put PASSWORD_HASH`)
// e em .dev.vars (para desenvolvimento local).
//
// Uso:  node scripts/set-password.mjs | npx wrangler secret put PASSWORD_HASH
import { webcrypto as crypto } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem 0/O, 1/l/I
const groups = [];
for (let g = 0; g < 5; g++) {
  let s = '';
  const bytes = crypto.getRandomValues(new Uint8Array(4 * 4));
  for (let i = 0; s.length < 4; i++) {
    const b = bytes[i % bytes.length];
    if (b < 256 - (256 % ALPHABET.length)) s += ALPHABET[b % ALPHABET.length];
    else bytes[i % bytes.length] = crypto.getRandomValues(new Uint8Array(1))[0];
  }
  groups.push(s);
}
const password = groups.join('-'); // ex.: aB3k-Q9xz-... (20 caracteres, ~114 bits)

const ITER = 100000; // máximo suportado pelo PBKDF2 do Cloudflare Workers
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256);
const b64 = (u) => Buffer.from(u).toString('base64');
const hash = `pbkdf2$${ITER}$${b64(salt)}$${b64(new Uint8Array(bits))}`;

execFileSync('pbcopy', { input: password });

const devVars = new URL('../.dev.vars', import.meta.url);
let vars = existsSync(devVars) ? readFileSync(devVars, 'utf8').replace(/^PASSWORD_HASH=.*\n?/m, '') : '';
writeFileSync(devVars, vars + `PASSWORD_HASH=${hash}\n`);

process.stderr.write('Senha nova copiada para a área de transferência (⌘V para colar).\n');
process.stdout.write(hash);

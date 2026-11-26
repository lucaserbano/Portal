// Gera nova senha, grava num arquivo na Mesa (para o usuário copiar) e imprime só o hash.
import { webcrypto as crypto } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
const A = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
const pick = () => { for (;;) { const b = crypto.getRandomValues(new Uint8Array(1))[0]; if (b < 256 - (256 % A.length)) return A[b % A.length]; } };
const pw = Array.from({ length: 5 }, () => Array.from({ length: 4 }, pick).join('')).join('-');
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
const b64 = (u) => Buffer.from(u).toString('base64');
writeFileSync(`${homedir()}/Desktop/senha-pyle.txt`,
  `Senha do portal πύλη (lucaserbano.github.io/Portal):\n\n${pw}\n\n` +
  `1. Salve no app Senhas.\n2. Apague este arquivo depois.\n`, { mode: 0o600 });
process.stdout.write(`pbkdf2$100000$${b64(salt)}$${b64(new Uint8Array(bits))}`);

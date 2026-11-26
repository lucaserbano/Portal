// Senha fixa "teste-local" só para desenvolvimento (grava .dev.vars, que não vai para o Git)
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const salt = randomBytes(16);
const h = pbkdf2Sync('teste-local', salt, 100000, 32, 'sha256');
writeFileSync(new URL('../.dev.vars', import.meta.url), `PASSWORD_HASH=pbkdf2$100000$${salt.toString('base64')}$${h.toString('base64')}\n`);

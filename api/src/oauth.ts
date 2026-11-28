// Login do conector do Claude (OAuth 2.1): o app do Claude abre /authorize, a pessoa digita a senha do portal e aprova.
import type { Env } from './index';
import { FAIL_WINDOW_S, MAX_FAILS, verifyPassword } from './auth';

const now = () => Math.floor(Date.now() / 1000);
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(o: { client: string; host: string; local: boolean; handle: string; error?: string }) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Autorizar πύλη</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;font:15px/1.45 'Helvetica Neue',Helvetica,Arial,sans-serif;background:#000;color:#fff;display:grid;min-height:100vh;place-items:center}
  main{width:min(460px,100% - 40px);display:grid;gap:18px}
  h1{font-weight:400;font-size:56px;letter-spacing:-.03em;margin:0;line-height:1}
  p{margin:0}
  .meta{font:12px ui-monospace,Menlo,monospace;color:#808080}
  b{color:#ff0006;font-weight:400}
  input{font:16px inherit;width:100%;box-sizing:border-box;padding:12px 0;border:0;border-bottom:1px solid #fff;background:none;color:#fff;outline:none}
  input:focus{border-bottom:2px solid #ff0006}
  .row{display:flex;gap:10px}
  button{font:15px inherit;padding:12px 20px;border:1px solid #fff;background:none;color:#fff;cursor:pointer}
  button.ok{background:#ff0006;border-color:#ff0006}
  .err{color:#ff0006}
  .warn{border-left:3px solid #ff0006;padding-left:10px}
</style></head><body><main>
  <h1>πύλη</h1>
  <p><b>${esc(o.client)}</b> quer acessar o seu portal: ler e criar tarefas, temas, roteiros e eventos.</p>
  <p class="meta">O acesso vai para: ${esc(o.host)}</p>
  ${o.local ? '<p class="warn">Isto manda o acesso para um programa no seu computador. Continue só se você acabou de pedir isso.</p>' : ''}
  ${o.error ? `<p class="err">${esc(o.error)}</p>` : ''}
  <form method="post">
    <input type="hidden" name="handle" value="${esc(o.handle)}">
    <input type="hidden" name="client" value="${esc(o.client)}">
    <input type="hidden" name="host" value="${esc(o.host)}">
    <input type="text" name="username" placeholder="login" autocomplete="username" autocapitalize="none" autofocus required>
    <input type="password" name="password" placeholder="senha" autocomplete="current-password" required style="margin-top:8px">
    <div class="row" style="margin-top:16px">
      <button class="ok" name="decision" value="approve">permitir</button>
      <button name="decision" value="deny" formnovalidate>recusar</button>
    </div>
  </form>
</main></body></html>`;
}

export async function authorize(request: Request, env: Env): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  if (request.method === 'GET') {
    let req;
    try {
      req = await oauth.parseAuthRequest(request);
    } catch (e) {
      return new Response(`Pedido de autorização inválido: ${esc((e as Error).message)}`, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    const d = await oauth.describeConsent(req);
    const consent = await oauth.beginConsent(req);
    consent.headers.set('Content-Type', 'text/html; charset=utf-8');
    return new Response(page({ client: d.clientName, host: d.redirectHost, local: d.redirectIsLoopback, handle: consent.handle }), { headers: consent.headers });
  }

  if (request.method !== 'POST') return new Response(null, { status: 405 });
  const form = await request.formData();
  const handle = String(form.get('handle') ?? '');
  if (form.get('decision') !== 'approve') {
    const denied = await oauth.denyConsent(request, handle);
    return new Response(null, { status: 302, headers: denied.headers });
  }

  // mesma proteção do login do portal: 5 erros em 15 min bloqueiam o IP
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  const fails = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND at > ?').bind(ip, now() - FAIL_WINDOW_S).first<{ n: number }>();
  const password = String(form.get('password') ?? '');
  const userOk = String(form.get('username') ?? '').trim().toLowerCase() === (env.LOGIN_USER || 'pyle').toLowerCase();
  const blocked = (fails?.n ?? 0) >= MAX_FAILS;
  if (blocked || !userOk || !password || !(await verifyPassword(password, env.PASSWORD_HASH))) {
    if (!blocked) await env.DB.prepare('INSERT INTO login_attempts (ip, at) VALUES (?, ?)').bind(ip, now()).run();
    // o formulário volta com o erro (o handle continua valendo até permitir ou recusar)
    const msg = blocked ? 'Muitas tentativas. Tente de novo em 15 minutos.' : 'Login ou senha incorretos.';
    return new Response(page({ client: String(form.get('client') ?? 'O app'), host: String(form.get('host') ?? ''), local: false, handle, error: msg }), {
      status: 401,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'" },
    });
  }

  const approved = await oauth.approveConsent(request, handle, { scope: ['mcp:read', 'mcp:write'] });
  const { redirectTo } = await oauth.completeAuthorization({
    request: approved.request,
    userId: 'dono',
    metadata: {},
    scope: approved.request.scope?.length ? approved.request.scope : ['mcp:read', 'mcp:write'],
    props: { userId: 'dono' },
  });
  approved.headers.set('Location', redirectTo);
  return new Response(null, { status: 302, headers: approved.headers });
}

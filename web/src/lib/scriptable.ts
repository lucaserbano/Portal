// Script do widget para o app Scriptable (iPhone). O token vai embutido.
export function widgetScript(apiUrl: string, siteUrl: string) {
	return `// πύλη · widget (app Scriptable)
// Próximos 14 dias por dia: tarefas com prazo, etapas de roteiro e eventos da agenda.
// Foto na parte de baixo, sumindo para cima. Se a foto ficar cortada, mude ALTURA (altura ÷ largura do widget).
const API = ${JSON.stringify(apiUrl)};
const SITE = ${JSON.stringify(siteUrl)};
const ALTURA = 1.53;
const PINK = new Color("#FF006F"), WHITE = Color.white(), GREY = new Color("#8C8C8C"), BLACK = Color.black();
const SOFT = new Color("#BBBBBB"), DIM = new Color("#666666"), RULE = new Color("#FFFFFF", 0.22);
const FS = 14; // um tamanho de letra só

let data;
try { data = await new Request(API).loadJSON(); } catch (e) { data = { error: "sem conexão" }; }

const fam = config.widgetFamily || "large";
const small = fam === "small";
const max = small ? 5 : fam === "medium" ? 6 : 17; // linhas (os títulos de dia contam)
const budget = small ? 22 : 56; // limite de letras (o iPhone ainda encurta o título se faltar espaço)
const w = new ListWidget();
w.backgroundColor = BLACK;
w.url = SITE;
w.setPadding(14, 14, 12, 14);

// ---------- fundo: foto embaixo, sumindo para cima ----------
async function background() {
  if (fam !== "large" || !data.bg) return null;
  const fm = FileManager.local();
  const path = fm.joinPath(fm.cacheDirectory(), "pyle-widget-bg-" + ALTURA + ".png");
  if (fm.fileExists(path) && Date.now() - fm.modificationDate(path).getTime() < 7 * 86400000) return fm.readImage(path);
  const img = await new Request(data.bg).loadImage();
  const W = 1080, H = Math.round(W * ALTURA);
  const ih = Math.round(W * img.size.height / img.size.width);
  const ctx = new DrawContext();
  ctx.size = new Size(W, H); ctx.opaque = true; ctx.respectScreenScale = false;
  ctx.setFillColor(BLACK); ctx.fillRect(new Rect(0, 0, W, H));
  const y = H - ih;
  ctx.drawImageInRect(img, new Rect(0, y, W, ih));
  // degradê: preto em cima da foto, transparente embaixo
  const fade = Math.round(ih * 0.75), steps = 60;
  for (let i = 0; i < steps; i++) {
    const a = Math.pow(1 - i / steps, 1.6);
    ctx.setFillColor(new Color("#000000", a));
    ctx.fillRect(new Rect(0, y + Math.floor(i * fade / steps), W, Math.ceil(fade / steps) + 1));
  }
  const out = ctx.getImage();
  fm.writeImage(path, out);
  return out;
}
try { const bg = await background(); if (bg) w.backgroundImage = bg; } catch (e) {}

// ---------- topo ----------
const top = w.addStack();
top.centerAlignContent();
const t = top.addText("πύλη");
t.font = Font.systemFont(small ? 20 : 24); t.textColor = PINK;
top.addSpacer();
const d = top.addText(new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" }));
d.font = Font.regularMonospacedSystemFont(small ? 11 : FS - 2); d.textColor = GREY;
w.addSpacer(4);

const hm = (s) => new Date(s * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const cut = (s, n) => (s.length > n ? s.slice(0, Math.max(n - 1, 4)).trimEnd() + "…" : s);
let used = 0;
function text(stack, s, color, bold) {
  const x = stack.addText(s);
  x.font = bold ? Font.semiboldSystemFont(small ? 12 : FS) : Font.systemFont(small ? 12 : FS);
  x.textColor = color; x.lineLimit = 1;
  return x;
}
function head(name, color) {
  if (used >= max - 1) return false; // título sem nenhuma linha embaixo não vale
  used++;
  w.addSpacer(10);
  const h = w.addStack();
  text(h, name, color, true);
  w.addSpacer(3);
  const r = w.addStack(); r.size = new Size(0, 1); r.backgroundColor = RULE; r.addSpacer(); // filete do dia (o espaçador estica até a largura toda)
  w.addSpacer(4);
  return true;
}
function line(x) {
  if (used >= max) return false;
  used++;
  const s = w.addStack(); s.spacing = 6; s.centerAlignContent();
  if (!small) {
    const a = s.addText(x.all_day ? "dia  " : hm(x.at));
    a.font = Font.regularMonospacedSystemFont(FS - 1); a.textColor = x.late ? PINK : GREY;
  }
  // ordem: cliente/quadro › título › ação
  const sep = " › ";
  const where = small ? "" : x.where;
  const fixed = (where ? where.length + sep.length : 0) + (x.kind === "step" ? x.step.length + sep.length : 0);
  if (where) { text(s, where, GREY); text(s, "›", DIM); }
  text(s, cut(x.title, budget - fixed), x.kind === "event" ? SOFT : WHITE);
  if (x.kind === "step") { text(s, "›", DIM); text(s, x.step, PINK); }
  s.addSpacer();
  w.addSpacer(3);
  return true;
}

if (data.error) {
  const e = w.addText(data.error); e.textColor = PINK; e.font = Font.systemFont(FS);
} else {
  const items = data.agenda || [];
  const DAY = 86400;
  const label = (i) => {
    const x = new Date((data.today0 + i * DAY + 43200) * 1000);
    const dd = x.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
    if (i === 0) return "hoje · " + dd.split(",")[1].trim();
    if (i === 1) return "amanhã · " + dd.split(",")[1].trim();
    return dd.replace("-feira", "");
  };
  const groups = [];
  const late = items.filter((x) => x.late);
  if (late.length) groups.push(["atrasadas", PINK, late]);
  for (let i = 0; i < 14; i++) {
    const g = items.filter((x) => !x.late && x.at >= data.today0 + i * DAY && x.at < data.today0 + (i + 1) * DAY);
    if (g.length) groups.push([label(i), i === 0 ? PINK : WHITE, g]);
  }
  let shown = 0;
  for (const [name, color, list] of groups) {
    if (!head(name, color)) break;
    for (const x of list) { if (!line(x)) break; shown++; }
  }
  if (!items.length) { const n = w.addText("nada nos próximos 14 dias"); n.textColor = GREY; n.font = Font.systemFont(FS); }
  const rest = items.length - shown;
  if (rest > 0) { w.addSpacer(6); const r = w.addText("+" + rest + " no portal"); r.textColor = GREY; r.font = Font.systemFont(FS - 2); }
}
w.addSpacer();
const f = w.addText("atualizado " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
f.font = Font.regularMonospacedSystemFont(9); f.textColor = DIM; f.rightAlignText();
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

Script.setWidget(w);
if (config.runsInApp) await w.presentLarge();
Script.complete();
`;
}

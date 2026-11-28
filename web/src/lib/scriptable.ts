// Script do widget para o app Scriptable (iPhone). O token vai embutido.
export function widgetScript(apiUrl: string, siteUrl: string) {
	return `// πύλη, widget (app Scriptable)
// Próximos 14 dias por dia: tarefas com prazo, etapas de roteiro e eventos da agenda.
// O Scriptable só informa o formato do widget; o tamanho sai da tabela da Apple (pontos, tela de 440 de largura),
// ajustado à largura da tela deste iPhone. Com isso: a foto sai na proporção certa e só entram as linhas que cabem.
const API = ${JSON.stringify(apiUrl)};
const SITE = ${JSON.stringify(siteUrl)};
const PINK = new Color("#FF0006"), WHITE = Color.white(), GREY = new Color("#8C8C8C"), BLACK = Color.black();
const SOFT = new Color("#BBBBBB"), DIM = new Color("#666666"), RULE = new Color("#FFFFFF", 0.22);

let data;
try { data = await new Request(API).loadJSON(); } catch (e) { data = { error: "sem conexão" }; }

// ---------- tamanho do widget ----------
const fam = config.widgetFamily || "large";
const SIZES = { small: [170, 170], medium: [364, 170], large: [364, 382], extraLarge: [364, 584] };
const k = Device.screenSize().width / 440;
const [WPT, HPT] = (SIZES[fam] || SIZES.extraLarge).map((v) => v * k);
const small = fam === "small";
const tight = fam === "small" || fam === "medium";
const FS = tight ? 13 : 14; // um tamanho de letra só
const PAD = tight ? 12 : 14;

const w = new ListWidget();
w.backgroundColor = BLACK;
w.url = SITE;
w.setPadding(PAD, PAD + 2, PAD - 2, PAD + 2);

// ---------- fundo: foto embaixo, sumindo para cima (não vai no quadrado pequeno) ----------
async function background() {
  if (small || !data.bg) return null;
  const fm = FileManager.local();
  const path = fm.joinPath(fm.cacheDirectory(), "pyle-widget-bg-" + fam + "-" + Math.round(WPT) + "x" + Math.round(HPT) + ".png");
  if (fm.fileExists(path) && Date.now() - fm.modificationDate(path).getTime() < 7 * 86400000) return fm.readImage(path);
  const img = await new Request(data.bg).loadImage();
  const W = 1080, H = Math.round((W * HPT) / WPT); // mesma proporção do widget: o iPhone não recorta
  const ih = Math.round((W * img.size.height) / img.size.width);
  const ctx = new DrawContext();
  ctx.size = new Size(W, H); ctx.opaque = true; ctx.respectScreenScale = false;
  ctx.setFillColor(BLACK); ctx.fillRect(new Rect(0, 0, W, H));
  const y = H - ih; // foto encostada embaixo (no retângulo, só a parte de baixo dela aparece)
  ctx.drawImageInRect(img, new Rect(0, y, W, ih));
  const top = Math.max(y, 0), vis = H - top;
  // véu leve na foto toda (texto legível) + degradê: preto no alto da foto, transparente embaixo
  ctx.setFillColor(new Color("#000000", tight ? 0.45 : 0.2)); ctx.fillRect(new Rect(0, top, W, vis));
  const fade = Math.round(vis * (tight ? 0.6 : 0.7)), steps = 60;
  for (let i = 0; i < steps; i++) {
    ctx.setFillColor(new Color("#000000", Math.pow(1 - i / steps, 1.6)));
    ctx.fillRect(new Rect(0, top + Math.floor((i * fade) / steps), W, Math.ceil(fade / steps) + 1));
  }
  const out = ctx.getImage();
  fm.writeImage(path, out);
  return out;
}
try { const bg = await background(); if (bg) w.backgroundImage = bg; } catch (e) {}

// ---------- altura: conta o que cabe (em pontos) ----------
const LINE = FS + 6, HEAD = (tight ? 6 : 10) + FS + 12; // linha; título do dia (espaço + texto + filete)
let room = HPT - 2 * PAD - (tight ? 26 : 34) - (tight ? 0 : 14) - (FS + 6); // topo, rodapé, "+N"

// ---------- topo ----------
const top = w.addStack();
top.centerAlignContent();
const t = top.addText("πύλη");
t.font = Font.systemFont(tight ? 18 : 24); t.textColor = PINK;
top.addSpacer();
const d = top.addText(new Date().toLocaleDateString("pt-BR", small ? { day: "numeric", month: "short" } : { weekday: "short", day: "numeric", month: "short" }));
d.font = Font.systemFont(FS - 2); d.textColor = GREY;

const hm = (s) => new Date(s * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
function text(stack, s, color, bold) {
  const x = stack.addText(s);
  x.font = bold ? Font.semiboldSystemFont(FS) : Font.systemFont(FS);
  x.textColor = color; x.lineLimit = 1;
  return x;
}
function head(name, color) {
  if (room < HEAD + LINE) return false; // título sem nenhuma linha embaixo não vale
  room -= HEAD;
  w.addSpacer(tight ? 6 : 10);
  const h = w.addStack();
  text(h, name, color, true);
  w.addSpacer(3);
  const r = w.addStack(); r.size = new Size(0, 1); r.backgroundColor = RULE; r.addSpacer(); // filete do dia
  w.addSpacer(3);
  return true;
}
function line(x) {
  if (room < LINE) return false;
  room -= LINE;
  const s = w.addStack(); s.spacing = 5; s.centerAlignContent();
  if (!small) { const a = s.addText(x.all_day ? "dia  " : hm(x.at)); a.font = Font.systemFont(FS - 1); a.textColor = x.late ? PINK : GREY; }
  // ordem: cliente/quadro › título › ação (no quadrado pequeno, sem o cliente)
  if (x.where && !small) { text(s, x.where, GREY); text(s, "›", DIM); }
  text(s, x.title, x.kind === "event" ? SOFT : WHITE);
  if (x.kind === "step") { text(s, "›", DIM); text(s, x.step, PINK); }
  s.addSpacer();
  w.addSpacer(2);
  return true;
}

if (data.error) {
  w.addSpacer(8);
  const e = w.addText(data.error); e.textColor = PINK; e.font = Font.systemFont(FS);
} else {
  const items = data.agenda || [];
  const DAY = 86400;
  const label = (i) => {
    const x = new Date((data.today0 + i * DAY + 43200) * 1000);
    const dm = x.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    if (i === 0) return "hoje, " + dm;
    if (i === 1) return "amanhã, " + dm;
    const wd = x.toLocaleDateString("pt-BR", { weekday: tight ? "short" : "long" }).replace("-feira", "").replace(".", "");
    return wd + ", " + dm;
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
  if (!items.length) { w.addSpacer(8); const n = w.addText("nada nos próximos 14 dias"); n.textColor = GREY; n.font = Font.systemFont(FS); }
  const rest = items.length - shown;
  if (rest > 0) { w.addSpacer(4); const r = w.addText("+" + rest + " no portal"); r.textColor = GREY; r.font = Font.systemFont(FS - 1); }
}
w.addSpacer();
if (!tight) {
  const f = w.addText("atualizado " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
  f.font = Font.systemFont(9); f.textColor = DIM; f.rightAlignText();
}
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

Script.setWidget(w);
if (config.runsInApp) await w.presentLarge();
Script.complete();
`;
}

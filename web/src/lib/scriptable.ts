// Script do widget para o app Scriptable (iPhone). O token vai embutido.
export function widgetScript(apiUrl: string, siteUrl: string) {
	return `// πύλη · widget (app Scriptable)
// Próximos 14 dias por dia: tarefas com prazo, etapas de roteiro e eventos da agenda.
const API = ${JSON.stringify(apiUrl)};
const SITE = ${JSON.stringify(siteUrl)};
const PINK = new Color("#FF006F"), WHITE = Color.white(), GREY = new Color("#808080"), BLACK = Color.black();
const SOFT = new Color("#BBBBBB"), DIM = new Color("#555555");

let data;
try { data = await new Request(API).loadJSON(); } catch (e) { data = { error: "sem conexão" }; }

const fam = config.widgetFamily || "large";
const small = fam === "small";
const max = small ? 5 : fam === "medium" ? 6 : 19; // linhas (os títulos de dia contam)
const w = new ListWidget();
w.backgroundColor = BLACK;
w.url = SITE;
w.setPadding(14, 14, 12, 14);

const top = w.addStack();
top.centerAlignContent();
const t = top.addText("πύλη");
t.font = Font.systemFont(small ? 20 : 24); t.textColor = PINK;
top.addSpacer();
const d = top.addText(new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" }));
d.font = Font.regularMonospacedSystemFont(10); d.textColor = GREY;
w.addSpacer(6);

const hm = (s) => new Date(s * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
let used = 0;
function head(text, color) {
  if (used >= max - 1) return false; // título sem nenhuma linha embaixo não vale
  used++;
  w.addSpacer(4);
  const h = w.addText(text.toUpperCase());
  h.font = Font.mediumMonospacedSystemFont(9); h.textColor = color;
  w.addSpacer(2);
  return true;
}
function line(x) {
  if (used >= max) return false;
  used++;
  const s = w.addStack(); s.spacing = 6; s.centerAlignContent();
  if (!small) {
    const a = s.addText(x.all_day ? "dia  " : hm(x.at));
    a.font = Font.regularMonospacedSystemFont(10); a.textColor = x.late ? PINK : GREY;
  }
  if (x.kind === "step") { const k = s.addText(x.step); k.font = Font.mediumSystemFont(small ? 11 : 12); k.textColor = PINK; }
  const b = s.addText(x.title);
  b.font = Font.systemFont(small ? 12 : 13); b.lineLimit = 1;
  b.textColor = x.kind === "event" ? SOFT : WHITE;
  if (x.where && !small) { const c = s.addText(x.where); c.font = Font.systemFont(11); c.textColor = GREY; c.lineLimit = 1; }
  w.addSpacer(2);
  return true;
}

if (data.error) {
  const e = w.addText(data.error); e.textColor = PINK; e.font = Font.systemFont(12);
} else {
  const items = data.agenda || [];
  const DAY = 86400;
  const label = (i) => {
    if (i === 0) return "hoje";
    if (i === 1) return "amanhã";
    const x = new Date((data.today0 + i * DAY + 43200) * 1000);
    return x.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", "");
  };
  const groups = [];
  const late = items.filter((x) => x.late);
  if (late.length) groups.push(["atrasadas", PINK, late]);
  for (let i = 0; i < 14; i++) {
    const g = items.filter((x) => !x.late && x.at >= data.today0 + i * DAY && x.at < data.today0 + (i + 1) * DAY);
    if (g.length) groups.push([label(i), i === 0 ? WHITE : GREY, g]);
  }
  let shown = 0;
  for (const [name, color, list] of groups) {
    if (!head(name, color)) break;
    for (const x of list) { if (!line(x)) break; shown++; }
  }
  if (!items.length) { const n = w.addText("nada nos próximos 14 dias"); n.textColor = GREY; n.font = Font.systemFont(13); }
  const rest = items.length - shown;
  if (rest > 0) { w.addSpacer(2); const r = w.addText("+" + rest + " no portal"); r.textColor = GREY; r.font = Font.regularMonospacedSystemFont(10); }
}
w.addSpacer();
const f = w.addText("atualizado " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
f.font = Font.regularMonospacedSystemFont(8); f.textColor = DIM; f.rightAlignText();
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

Script.setWidget(w);
if (config.runsInApp) await w.presentLarge();
Script.complete();
`;
}

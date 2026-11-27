// Script do widget para o app Scriptable (iPhone). O token vai embutido.
export function widgetScript(apiUrl: string, siteUrl: string) {
	return `// πύλη · widget (app Scriptable)
// Mostra prazos atrasados, de hoje, dos próximos dias e os eventos de hoje.
const API = ${JSON.stringify(apiUrl)};
const SITE = ${JSON.stringify(siteUrl)};
const PINK = new Color("#FF006F"), WHITE = Color.white(), GREY = new Color("#808080"), BLACK = Color.black();

let data;
try { data = await new Request(API).loadJSON(); } catch (e) { data = { error: "sem conexão" }; }

const fam = config.widgetFamily || "large";
const max = fam === "small" ? 4 : fam === "medium" ? 5 : 14;
const w = new ListWidget();
w.backgroundColor = BLACK;
w.url = SITE;
w.setPadding(14, 14, 12, 14);

const top = w.addStack();
const t = top.addText("πύλη");
t.font = Font.systemFont(fam === "small" ? 20 : 24); t.textColor = PINK;
top.addSpacer();
const d = top.addText(new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" }));
d.font = Font.regularMonospacedSystemFont(10); d.textColor = GREY;
w.addSpacer(8);

const hm = (s) => new Date(s * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dm = (s) => new Date(s * 1000).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
let used = 0;
function line(label, text, color) {
  if (used >= max) return;
  used++;
  const s = w.addStack(); s.spacing = 6; s.centerAlignContent();
  const a = s.addText(label); a.font = Font.regularMonospacedSystemFont(10); a.textColor = color; a.lineLimit = 1;
  const b = s.addText(text); b.font = Font.systemFont(fam === "small" ? 12 : 13); b.textColor = WHITE; b.lineLimit = 1;
  w.addSpacer(3);
}

if (data.error) {
  const e = w.addText(data.error); e.textColor = PINK; e.font = Font.systemFont(12);
} else {
  for (const x of data.late) line("atrasada", x.title, PINK);
  for (const x of data.events) line(x.all_day ? "dia todo" : hm(x.start), x.title, GREY);
  for (const x of data.today) line("hoje " + hm(x.due_at), x.title, WHITE);
  for (const x of data.soon) line(dm(x.due_at), x.title, GREY);
  if (!used) { const n = w.addText("nada para hoje"); n.textColor = GREY; n.font = Font.systemFont(13); }
  const rest = data.late.length + data.events.length + data.today.length + data.soon.length - used;
  if (rest > 0) { const r = w.addText("+" + rest); r.textColor = GREY; r.font = Font.regularMonospacedSystemFont(10); }
}
w.addSpacer();
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

Script.setWidget(w);
if (config.runsInApp) await w.presentLarge();
Script.complete();
`;
}

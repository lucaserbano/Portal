// Marca do cliente nas páginas públicas (/f, /t, /c). Sem marca: tudo fica como o padrão do πύλη.
export type Brand = {
	text: string | null;
	bg: string | null;
	section: string | null;
	question: string | null;
	accent: string | null;
	logo: string | null;
};

/** Troca as variáveis de cor da página. As que não foram definidas continuam com o padrão. */
export function applyBrand(b: Brand | null | undefined) {
	if (!b) return;
	const root = document.documentElement;
	// cores de marca valem nos dois modos: a página não inverte no modo noturno
	if (b.text || b.bg) root.dataset.theme = 'light';
	const set = (k: string, v: string | null) => v && root.style.setProperty(k, v);
	set('--black', b.text);
	set('--white', b.bg);
	set('--accent', b.accent);
	set('--q-bg', b.section);
	set('--q-text', b.question);
	if (b.section) root.style.setProperty('--q-pad', '18px');
	if (b.bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', b.bg);
}

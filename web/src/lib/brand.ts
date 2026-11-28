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
	// texto sobre o destaque: preto ou branco, o que tiver mais contraste com a cor escolhida
	if (b.accent) root.style.setProperty('--on-accent', onColor(b.accent));
	if (b.bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', b.bg);
}

/** Preto ou branco, o que contrasta mais com a cor (luminância relativa da WCAG) */
export function onColor(hex: string) {
	let h = hex.replace('#', '');
	if (h.length === 3) h = [...h].map((c) => c + c).join('');
	const lin = (i: number) => {
		const c = parseInt(h.slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	const L = 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4);
	return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#000000' : '#ffffff';
}

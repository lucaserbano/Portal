// Modo dia/noite do portal, compartilhado entre o login, o menu e a abertura
export const theme = $state({ v: (document.documentElement.dataset.theme ?? 'dark') as 'dark' | 'light' });

export function setTheme(v: 'dark' | 'light') {
	theme.v = v;
	document.documentElement.dataset.theme = v;
	localStorage.setItem('pyle.theme', v);
	document.querySelector('meta[name="theme-color"]')?.setAttribute('content', v === 'dark' ? '#000000' : '#ffffff');
}

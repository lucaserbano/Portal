// Shift + roda do mouse rola para o lado (no Mac/Windows nem todo navegador faz isso sozinho)
export function hscroll(el: HTMLElement) {
	function onWheel(e: WheelEvent) {
		if (!e.shiftKey || e.deltaX !== 0 || e.deltaY === 0) return;
		if (el.scrollWidth <= el.clientWidth) return;
		e.preventDefault();
		el.scrollLeft += e.deltaY;
	}
	el.addEventListener('wheel', onWheel, { passive: false });
	return { destroy: () => el.removeEventListener('wheel', onWheel) };
}

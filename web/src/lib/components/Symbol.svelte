<script lang="ts">
	// O símbolo do πύλη: um A sem barra, com uma porta reta recortada na base.
	// Um contorno só (sem emenda nos cantos da porta). Medidas num quadro de 100.
	let { size = 20, color = 'var(--accent)', label = '' }: { size?: number; color?: string; label?: string } = $props();
</script>

<svg viewBox="0 0 100 100" width={size} height={size} role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : 'true'}>
	<path fill={color} d="M4 94 L41 94 L41 56 L59 56 L59 94 L96 94 L50 4 Z" />
</svg>

<style>
	svg {
		display: block;
		flex: none;
	}
</style>

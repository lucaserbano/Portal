<script lang="ts">
	// Ícones desenhados "à mão": traço preto, pontas arredondadas, linhas levemente tortas.
	type Name = 'inbox' | 'board' | 'calendar' | 'form' | 'people' | 'door' | 'empty';
	let { name, size = 28 }: { name: Name; size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 32 32"
	fill="none"
	stroke="currentColor"
	stroke-width="1.8"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#if name === 'inbox'}
		<path d="M4.5 17.2 L8.3 6.4 Q8.6 5.6 9.5 5.7 L22.8 5.4 Q23.6 5.5 23.9 6.2 L27.6 17.1" />
		<path d="M4.2 17.3 L4.6 25.8 Q4.7 26.6 5.6 26.5 L26.4 26.8 Q27.4 26.7 27.3 25.9 L27.7 17.2" />
		<path d="M4.4 17.3 L11.2 17.1 Q12.4 21.2 16.1 21.1 Q19.6 21.3 20.7 17.2 L27.5 17.3" />
	{:else if name === 'board'}
		<path d="M4.3 5.2 L27.6 4.8 L27.9 26.9 L4.6 27.3 Z" />
		<path d="M11.9 5.1 L12.2 27.1" />
		<path d="M19.8 4.9 L19.9 27.2" />
		<path d="M6.6 9.1 L9.8 9.2 M6.5 12.6 L9.6 12.4 M14.3 9 L17.6 9.2 M22.1 8.9 L25.3 9.1" />
	{:else if name === 'calendar'}
		<path d="M4.6 8.1 L27.2 7.7 L27.6 27.2 L4.3 27.5 Z" />
		<path d="M4.5 13.4 L27.4 13.1" />
		<path d="M10.1 4.3 L10.3 10.2 M21.8 4.2 L21.9 10.1" />
		<path d="M9.2 18.6 l0.4 0.1 M15.8 18.4 l0.4 0.1 M22.3 18.5 l0.4 0 M9.4 23.1 l0.4 0 M15.9 23 l0.4 0.1" stroke-width="2.6" />
	{:else if name === 'form'}
		<path d="M7.2 4.4 L24.9 4.7 L24.6 27.6 L6.9 27.3 Z" />
		<path d="M10.6 10.2 L12.4 12.1 L15.3 8.6" />
		<path d="M17.4 10.6 L21.6 10.4" />
		<path d="M10.8 17.1 L13.1 17.2 L13 19.2 L10.7 19.1 Z" />
		<path d="M17.3 18.3 L21.5 18.1" />
		<path d="M10.6 23.4 L21.4 23.7" />
	{:else if name === 'people'}
		<path d="M12.2 13.4 Q8.1 13.2 8.4 9.1 Q8.9 5.2 12.4 5.5 Q16 5.9 15.8 9.6 Q15.5 13.4 12.2 13.4 Z" />
		<path d="M4.3 26.8 Q4.6 17.2 12.3 17.1 Q19.6 17.3 19.9 26.6" />
		<path d="M20.3 13.1 Q23.6 13.4 23.8 9.6 Q23.6 6.4 20.6 6.2" />
		<path d="M22.1 17.4 Q27.4 18.6 27.6 26.4" />
	{:else if name === 'door'}
		<path d="M7.1 27.4 L7.4 4.6 L24.6 4.3 L24.9 27.6" />
		<path d="M3.8 27.6 L28.3 27.3" />
		<path d="M7.4 4.6 L18.2 8.1 L18.4 30.1 L7.1 27.4" />
		<path d="M15.3 18.2 l0.3 0.2" stroke-width="2.6" />
	{:else}
		<path d="M5.3 22.4 Q9.8 25.9 16.2 25.6 Q23.1 25.8 26.9 21.7" />
		<path d="M10.6 12.3 l0.2 0.3 M21.1 12.1 l0.2 0.3" stroke-width="2.8" />
		<path d="M12.3 19.2 Q16.1 17.6 19.8 19.3" />
	{/if}
</svg>

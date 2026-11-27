<script lang="ts">
	// Uma foto inteira para um lugar do portal (cabeçalhos, telas vazias)
	import { photos, pick, type Photo } from '#lib/photos.ts';
	let { seed, vibe = false, height = 140 }: { seed: string; vibe?: boolean; height?: number } = $props();
	let photo = $state<Photo | null>(null);
	photos().then((l) => (photo = pick(l, seed, vibe)));
</script>

{#if photo}
	<figure style:--h="{height}px">
		<img src={photo.url} alt="" width={photo.w} height={photo.h} loading="lazy" decoding="async" />
	</figure>
{/if}

<style>
	figure {
		margin: 0;
		display: flex;
		justify-content: flex-end;
	}
	img {
		display: block;
		height: var(--h);
		width: auto;
		max-width: 100%;
		object-fit: contain; /* inteira, sem corte */
	}
</style>

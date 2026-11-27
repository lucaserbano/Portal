<script lang="ts">
	// Mosaico em grade de 12 colunas: as fotos "vibe" grandes, as outras pelo formato. Sempre inteiras.
	import { photos, type Photo } from '#lib/photos.ts';
	let list = $state<Photo[]>([]);
	photos().then((p) => (list = [...p.filter((x) => x.vibe), ...p.filter((x) => !x.vibe)]));
	const span = (p: Photo) => (p.vibe ? 'big' : p.w > p.h * 1.15 ? 'wide' : 'tall');
</script>

{#if list.length}
	<section class="mosaic" aria-label="Portais">
		<div class="grid12">
			{#each list as p, i (p.url)}
				<figure class={span(p)}>
					<img src={p.url} alt="" width={p.w} height={p.h} loading={i < 6 ? 'eager' : 'lazy'} decoding="async" />
				</figure>
			{/each}
		</div>
	</section>
{/if}

<style>
	.mosaic {
		margin-top: var(--gutter);
	}
	.grid12 {
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		grid-auto-flow: row dense;
		gap: var(--gutter);
		align-items: start;
	}
	figure {
		margin: 0;
		border-top: var(--rule);
		padding-top: 8px;
	}
	figure.big {
		grid-column: span 6;
	}
	figure.wide {
		grid-column: span 4;
	}
	figure.tall {
		grid-column: span 3;
	}
	img {
		display: block;
		width: 100%;
		height: auto; /* inteira, na proporção original */
		background: var(--code-bg);
	}
	@media (max-width: 720px) {
		.grid12 {
			grid-template-columns: repeat(6, minmax(0, 1fr));
			gap: 12px;
		}
		figure.big {
			grid-column: span 6;
		}
		figure.wide {
			grid-column: span 6;
		}
		figure.tall {
			grid-column: span 3;
		}
	}
</style>

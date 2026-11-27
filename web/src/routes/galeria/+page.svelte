<script lang="ts">
	import PhotoMosaic from '#lib/components/PhotoMosaic.svelte';
</script>

<section class="head">
	<h1 class="title-xl">Galeria</h1>
	<p class="meta">portais, portas e salas de luz · as referências visuais do πύλη</p>
</section>

<PhotoMosaic />

<style>
	.head {
		display: grid;
		gap: 8px;
		padding-bottom: 6px;
	}
	@media (max-width: 720px) {
		.title-xl {
			font-size: clamp(40px, 12vw, 64px);
		}
	}
</style>

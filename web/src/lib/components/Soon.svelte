<script lang="ts">
	import Doodle from './Doodle.svelte';
	let { title, phase, items }: { title: string; phase: number; items: string[] } = $props();
</script>

<section class="grid">
	<h1 class="title-lg head">{title}</h1>
	<p class="meta phase">fase {phase}</p>
	<div class="doodle"><Doodle name="empty" size={56} /></div>
	<div class="body">
		<p class="label">Ainda em construção. O que vai entrar aqui:</p>
		<ul>
			{#each items as it (it)}<li>{it}</li>{/each}
		</ul>
	</div>
</section>

<style>
	.head {
		grid-column: 1 / span 9;
	}
	.phase {
		grid-column: 10 / span 3;
		justify-self: end;
		align-self: end;
	}
	.doodle {
		grid-column: 1 / span 6;
		padding-top: var(--gutter);
		border-top: var(--rule);
		color: var(--grey);
	}
	.body {
		grid-column: 7 / span 6;
		padding-top: var(--gutter);
		border-top: var(--rule);
	}
	ul {
		margin: 12px 0 0;
		padding-left: 18px;
		font-size: var(--t-sm);
	}
	@media (max-width: 720px) {
		.doodle,
		.body {
			grid-column: 1 / -1;
		}
	}
</style>

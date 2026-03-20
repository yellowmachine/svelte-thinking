<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<div class="flex min-h-screen items-center justify-center bg-paper px-4 dark:bg-dark-paper">
	<div class="max-w-md text-center">
		{#if data.alreadyUnsubscribed}
			<p class="font-serif text-xl text-ink dark:text-dark-ink">Ya estabas desuscrito</p>
			<p class="mt-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				No recibirás notificaciones de comentarios de este proyecto.
			</p>
		{:else}
			<p class="font-serif text-xl text-ink dark:text-dark-ink">Notificaciones silenciadas</p>
			<p class="mt-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Ya no recibirás emails de comentarios de este proyecto.
			</p>
		{/if}
		<a
			href="/projects"
			class="mt-6 inline-block font-sans text-sm text-accent hover:underline"
		>
			Volver a mis proyectos
		</a>
	</div>
</div>

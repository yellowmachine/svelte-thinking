<script lang="ts">
	type Person = {
		name: string;
		url: string;
		description: string;
		avatarUrl?: string;
	};

	let { people }: { people: Person[] } = $props();
</script>

<section class="border-t border-paper-border py-24 dark:border-dark-paper-border">
	<div class="mx-auto max-w-5xl px-6">
		<div class="mb-12 text-center">
			<p class="mb-3 font-sans text-xs font-semibold tracking-widest text-accent uppercase">
				Acknowledgements
			</p>
			<h2 class="font-serif text-3xl font-semibold text-ink dark:text-dark-ink">Thank you</h2>
			<p
				class="mx-auto mt-4 max-w-xl font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted"
			>
				Writers who believed in Scholio from the very beginning and helped shape it.
			</p>
		</div>

		<div class="flex flex-wrap justify-center gap-6">
			{#each people as person (person.url)}
				<a
					href={person.url}
					target="_blank"
					rel="noopener noreferrer"
					class="group flex w-72 flex-col items-center rounded-xl border border-paper-border bg-paper p-8 text-center transition-shadow hover:shadow-md dark:border-dark-paper-border dark:bg-dark-paper"
				>
					{#if person.avatarUrl}
						<img
							src={person.avatarUrl}
							alt={person.name}
							class="mb-4 h-16 w-16 rounded-full object-cover ring-2 ring-paper-border dark:ring-dark-paper-border"
						/>
					{:else}
						<div
							class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 ring-2 ring-paper-border dark:ring-dark-paper-border"
						>
							<svg
								width="28"
								height="28"
								viewBox="0 0 24 24"
								fill="none"
								stroke="#7c5c3e"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path d="M12 20h9" />
								<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
							</svg>
						</div>
					{/if}

					<h3
						class="font-serif text-base font-semibold text-ink transition-colors group-hover:text-accent dark:text-dark-ink dark:group-hover:text-accent"
					>
						{person.name}
					</h3>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						{person.description}
					</p>
				</a>
			{/each}
		</div>
	</div>
</section>

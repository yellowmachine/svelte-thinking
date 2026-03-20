<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Group outgoing by source document
	const outgoingByDoc = $derived(() => {
		const groups = new Map<string, {
			docId: string;
			docTitle: string;
			projectId: string;
			projectTitle: string;
			targets: typeof data.outgoing;
		}>();
		for (const link of data.outgoing) {
			if (!groups.has(link.fromDocId)) {
				groups.set(link.fromDocId, {
					docId: link.fromDocId,
					docTitle: link.fromDocTitle,
					projectId: link.fromProjectId,
					projectTitle: link.fromProjectTitle,
					targets: []
				});
			}
			groups.get(link.fromDocId)!.targets.push(link);
		}
		return [...groups.values()];
	});

	// Group incoming by target document (mine)
	const incomingByDoc = $derived(() => {
		const groups = new Map<string, {
			docId: string;
			docTitle: string;
			projectId: string;
			projectTitle: string;
			sources: typeof data.incoming;
		}>();
		for (const link of data.incoming) {
			if (!groups.has(link.toDocId)) {
				groups.set(link.toDocId, {
					docId: link.toDocId,
					docTitle: link.toDocTitle,
					projectId: link.toProjectId,
					projectTitle: link.toProjectTitle,
					sources: []
				});
			}
			groups.get(link.toDocId)!.sources.push(link);
		}
		return [...groups.values()];
	});
</script>

<div class="mx-auto max-w-4xl px-6 py-10">

	<div class="mb-8">
		<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">Red de referencias</h1>
		<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Documentos que referencias y documentos que te referencian a ti.
		</p>
	</div>

	<div class="grid gap-10 lg:grid-cols-2">

		<!-- ── Outgoing ─────────────────────────────────────────────────── -->
		<section>
			<div class="mb-4 flex items-center gap-2">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" class="text-accent" aria-hidden="true">
					<path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				<h2 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">Referencio</h2>
				<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
					{data.outgoing.length} {data.outgoing.length === 1 ? 'enlace' : 'enlaces'}
				</span>
			</div>

			{#if outgoingByDoc().length === 0}
				<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
					Ninguno de tus documentos referencia otros documentos todavía.<br>
					<span class="text-xs">Usa <code class="rounded bg-paper-ui px-1 dark:bg-dark-paper-ui">[[Título]]</code> y haz commit.</span>
				</p>
			{:else}
				<div class="flex flex-col gap-4">
					{#each outgoingByDoc() as group (group.docId)}
						<div class="rounded-xl border border-paper-border bg-paper p-4 dark:border-dark-paper-border dark:bg-dark-paper">
							<!-- Source doc -->
							<a
								href="/projects/{group.projectId}/documents/{group.docId}"
								class="mb-3 flex items-center gap-2 hover:underline"
							>
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" class="shrink-0 text-ink-faint" aria-hidden="true">
									<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" stroke-width="1.5"/>
									<polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="1.5"/>
								</svg>
								<span class="font-sans text-sm font-medium text-ink dark:text-dark-ink">{group.docTitle}</span>
								<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">· {group.projectTitle}</span>
							</a>

							<!-- Targets -->
							<div class="flex flex-col gap-1.5 pl-4 border-l-2 border-paper-border dark:border-dark-paper-border">
								{#each group.targets as link (link.linkId)}
									<div class="flex items-center gap-2">
										<svg width="10" height="10" viewBox="0 0 24 24" fill="none" class="shrink-0 text-accent/60" aria-hidden="true">
											<path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
										</svg>
										{#if link.toDocOwnedByMe || link.toDocIsPublic}
											<a
												href="/projects/{link.toProjectId}/documents/{link.toDocId}"
												class="font-sans text-sm text-accent hover:underline"
											>{link.toDocTitle}</a>
										{:else}
											<span class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">{link.toDocTitle}</span>
										{/if}
										{#if !link.toDocOwnedByMe}
											<span class="font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint">· {link.toProjectTitle}</span>
											{#if link.toDocIsPublic}
												<svg width="10" height="10" viewBox="0 0 24 24" fill="none" class="text-green-500" aria-label="Público">
													<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
													<path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
												</svg>
											{/if}
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<!-- ── Incoming ─────────────────────────────────────────────────── -->
		<section>
			<div class="mb-4 flex items-center gap-2">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" class="text-green-600 dark:text-green-400" aria-hidden="true">
					<path d="M19 12H5M11 18l-6-6 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				<h2 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">Me referencian</h2>
				<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
					{data.incoming.length} {data.incoming.length === 1 ? 'enlace' : 'enlaces'}
				</span>
			</div>

			{#if incomingByDoc().length === 0}
				<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
					Ningún documento público te referencia todavía.
				</p>
			{:else}
				<div class="flex flex-col gap-4">
					{#each incomingByDoc() as group (group.docId)}
						<div class="rounded-xl border border-paper-border bg-paper p-4 dark:border-dark-paper-border dark:bg-dark-paper">
							<!-- Target doc (mine) -->
							<a
								href="/projects/{group.projectId}/documents/{group.docId}"
								class="mb-3 flex items-center gap-2 hover:underline"
							>
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" class="shrink-0 text-ink-faint" aria-hidden="true">
									<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" stroke-width="1.5"/>
									<polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="1.5"/>
								</svg>
								<span class="font-sans text-sm font-medium text-ink dark:text-dark-ink">{group.docTitle}</span>
								<span class="font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint">· {group.projectTitle}</span>
							</a>

							<!-- Sources -->
							<div class="flex flex-col gap-1.5 pl-4 border-l-2 border-green-200 dark:border-green-900">
								{#each group.sources as link (link.linkId)}
									<div class="flex items-center gap-2">
										<svg width="10" height="10" viewBox="0 0 24 24" fill="none" class="shrink-0 text-green-500/60" aria-hidden="true">
											<path d="M19 12H5M11 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
										</svg>
										<a
											href="/projects/{link.fromProjectId}/documents/{link.fromDocId}"
											class="font-sans text-sm text-green-700 hover:underline dark:text-green-400"
										>{link.fromDocTitle}</a>
										<span class="font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint">· {link.fromProjectTitle}</span>
										<svg width="10" height="10" viewBox="0 0 24 24" fill="none" class="text-green-500" aria-label="Público">
											<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
											<path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
										</svg>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>

	</div>
</div>

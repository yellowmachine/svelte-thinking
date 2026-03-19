<script lang="ts">
	import { diffWords } from 'diff';

	let {
		oldText,
		newText,
		oldLabel = 'Versión anterior',
		newLabel = 'Versión actual'
	}: {
		oldText: string;
		newText: string;
		oldLabel?: string;
		newLabel?: string;
	} = $props();

	type DiffPart = { value: string; added?: boolean; removed?: boolean };

	const parts: DiffPart[] = $derived(diffWords(oldText, newText));

	type Line = { segments: { text: string; type: 'added' | 'removed' | 'equal' }[] };

	const oldLines: Line[] = $derived.by(() => {
		const lines: Line[] = [{ segments: [] }];
		for (const part of parts) {
			if (part.added) continue;
			const chunks = part.value.split('\n');
			for (let i = 0; i < chunks.length; i++) {
				if (i > 0) lines.push({ segments: [] });
				if (chunks[i])
					lines[lines.length - 1].segments.push({
						text: chunks[i],
						type: part.removed ? 'removed' : 'equal'
					});
			}
		}
		return lines;
	});

	const newLines: Line[] = $derived.by(() => {
		const lines: Line[] = [{ segments: [] }];
		for (const part of parts) {
			if (part.removed) continue;
			const chunks = part.value.split('\n');
			for (let i = 0; i < chunks.length; i++) {
				if (i > 0) lines.push({ segments: [] });
				if (chunks[i])
					lines[lines.length - 1].segments.push({
						text: chunks[i],
						type: part.added ? 'added' : 'equal'
					});
			}
		}
		return lines;
	});

	const maxLines: number = $derived(Math.max(oldLines.length, newLines.length));

	const hasChanges: boolean = $derived(parts.some((p) => p.added || p.removed));
</script>

<div class="w-full overflow-hidden rounded-lg border border-paper-border font-sans text-sm dark:border-dark-paper-border">
	{#if !hasChanges}
		<div class="flex items-center justify-center px-6 py-8 text-ink-muted dark:text-dark-ink-muted">
			Sin cambios entre las versiones seleccionadas.
		</div>
	{:else}
		<!-- Header -->
		<div class="grid grid-cols-2 border-b border-paper-border bg-paper-ui dark:border-dark-paper-border dark:bg-dark-paper-ui">
			<div class="px-4 py-2 text-xs font-medium text-ink-faint dark:text-dark-ink-faint">
				{oldLabel}
			</div>
			<div class="border-l border-paper-border px-4 py-2 text-xs font-medium text-ink-faint dark:border-dark-paper-border dark:text-dark-ink-faint">
				{newLabel}
			</div>
		</div>

		<!-- Diff rows -->
		<div class="divide-y divide-paper-border font-mono text-xs dark:divide-dark-paper-border">
			{#each { length: maxLines } as _, i (i)}
				{@const oldLine = oldLines[i]}
				{@const newLine = newLines[i]}
				<div class="grid grid-cols-2">
					<!-- Old side -->
					<div
						class="px-4 py-1.5 leading-relaxed text-ink dark:text-dark-ink"
						class:bg-red-50={oldLine?.segments.some((s) => s.type === 'removed')}
						class:dark:bg-red-950={oldLine?.segments.some((s) => s.type === 'removed')}
					>
						{#if oldLine}
							{#each oldLine.segments as seg (seg.text + seg.type)}
								{#if seg.type === 'removed'}
									<mark class="rounded bg-red-200 px-0.5 text-red-800 no-underline dark:bg-red-900 dark:text-red-200"
										>{seg.text}</mark
									>
								{:else}
									<span>{seg.text}</span>
								{/if}
							{/each}
						{/if}
					</div>

					<!-- New side -->
					<div
						class="border-l border-paper-border px-4 py-1.5 leading-relaxed text-ink dark:border-dark-paper-border dark:text-dark-ink"
						class:bg-green-50={newLine?.segments.some((s) => s.type === 'added')}
						class:dark:bg-green-950={newLine?.segments.some((s) => s.type === 'added')}
					>
						{#if newLine}
							{#each newLine.segments as seg (seg.text + seg.type)}
								{#if seg.type === 'added'}
									<mark class="rounded bg-green-200 px-0.5 text-green-800 no-underline dark:bg-green-900 dark:text-green-200"
										>{seg.text}</mark
									>
								{:else}
									<span>{seg.text}</span>
								{/if}
							{/each}
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

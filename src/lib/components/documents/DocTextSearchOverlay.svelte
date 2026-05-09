<script lang="ts">
	let {
		content,
		onclose,
		onscrollto
	}: {
		content: string;
		onclose: () => void;
		onscrollto: (blockIndex: number) => void;
	} = $props();

	let query = $state('');
	let currentMatch = $state(0);

	function normalize(s: string) {
		return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
	}

	const allParas = $derived(
		content
			.split(/\n\n+/)
			.map((s) => s.trim())
			.filter(Boolean)
	);

	const matches = $derived.by(() => {
		const q = normalize(query.trim());
		if (!q) return [] as number[];
		return allParas.reduce<number[]>((acc, para, i) => {
			if (normalize(para).includes(q)) acc.push(i);
			return acc;
		}, []);
	});

	function oninput() {
		currentMatch = 0;
		const m = matches;
		if (m.length > 0) onscrollto(m[0]);
	}

	function next() {
		if (!matches.length) return;
		const n = (currentMatch + 1) % matches.length;
		currentMatch = n;
		onscrollto(matches[n]);
	}

	function prev() {
		if (!matches.length) return;
		const p = (currentMatch - 1 + matches.length) % matches.length;
		currentMatch = p;
		onscrollto(matches[p]);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onclose();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (e.shiftKey) prev();
			else next();
		}
	}
</script>

<!-- backdrop -->
<div
	class="fixed inset-0 z-50"
	role="presentation"
	onpointerdown={(e) => {
		if (e.target === e.currentTarget) onclose();
	}}
>
	<!-- find bar panel -->
	<div
		class="absolute top-16 left-1/2 flex w-full max-w-lg -translate-x-1/2 items-center gap-2 rounded-xl border border-paper-border bg-paper px-3 py-2.5 shadow-2xl dark:border-dark-paper-border dark:bg-dark-paper"
	>
		<!-- magnifier icon -->
		<svg
			class="h-4 w-4 shrink-0 text-ink-faint dark:text-dark-ink-faint"
			viewBox="0 0 20 20"
			fill="currentColor"
			aria-hidden="true"
		>
			<path
				fill-rule="evenodd"
				d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
				clip-rule="evenodd"
			/>
		</svg>

		<input
			{@attach (node) => node.focus()}
			bind:value={query}
			{oninput}
			{onkeydown}
			type="text"
			placeholder="Find in document…"
			class="min-w-0 flex-1 bg-transparent font-sans text-sm text-ink placeholder:text-ink-faint focus:outline-none dark:text-dark-ink dark:placeholder:text-dark-ink-faint"
		/>

		<!-- match counter -->
		<span class="shrink-0 font-sans text-xs text-ink-faint tabular-nums dark:text-dark-ink-faint">
			{#if query.trim()}
				{matches.length === 0 ? 'No results' : `${currentMatch + 1} / ${matches.length}`}
			{/if}
		</span>

		<!-- prev -->
		<button
			type="button"
			onclick={prev}
			disabled={matches.length === 0}
			title="Previous match (Shift+Enter)"
			class="rounded p-1 text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink disabled:opacity-30 dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
		>
			<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
				<path
					fill-rule="evenodd"
					d="M7.47 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1-1.06 1.06L8 4.81 4.28 8.53a.75.75 0 0 1-1.06-1.06l4.25-4.25Z"
					clip-rule="evenodd"
				/>
			</svg>
		</button>

		<!-- next -->
		<button
			type="button"
			onclick={next}
			disabled={matches.length === 0}
			title="Next match (Enter)"
			class="rounded p-1 text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink disabled:opacity-30 dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
		>
			<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
				<path
					fill-rule="evenodd"
					d="M8.53 12.78a.75.75 0 0 1-1.06 0L3.22 8.53a.75.75 0 0 1 1.06-1.06L8 11.19l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25Z"
					clip-rule="evenodd"
				/>
			</svg>
		</button>

		<!-- close -->
		<button
			type="button"
			onclick={onclose}
			title="Close (Escape)"
			class="rounded p-1 text-ink-faint transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-faint dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
		>
			<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
				<path
					d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"
				/>
			</svg>
		</button>
	</div>
</div>

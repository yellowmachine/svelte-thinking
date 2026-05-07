<script lang="ts">
	import { trpc } from '$lib/utils/trpc';
	import { AI_TASKS, MODEL_SHORT_LABEL } from '$lib/ai-config';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	import { resolve } from '$app/paths';
	type Props =
		| {
				mode: 'personal';
				ownedOrgs?: { id: string; name: string }[];
		  }
		| {
				mode: 'org';
				orgId: string;
				orgName: string;
		  };

	let props: Props = $props();

	// ── Date range ────────────────────────────────────────────────────────────

	type Preset = '7d' | '30d' | '90d' | 'custom';
	let preset = $state<Preset>('30d');

	function presetDates(p: Preset): { from: Date; to: Date } {
		const to = new Date();
		to.setHours(23, 59, 59, 999);
		const from = new Date();
		from.setHours(0, 0, 0, 0);
		if (p === '7d') from.setDate(from.getDate() - 6);
		else if (p === '30d') from.setDate(from.getDate() - 29);
		else if (p === '90d') from.setDate(from.getDate() - 89);
		return { from, to };
	}

	let customFrom = $state(
		(() => {
			const d = new Date();
			d.setDate(d.getDate() - 29);
			return d.toISOString().slice(0, 10);
		})()
	);
	let customTo = $state(new Date().toISOString().slice(0, 10));

	const dateRange = $derived(
		preset === 'custom'
			? { from: new Date(customFrom + 'T00:00:00'), to: new Date(customTo + 'T23:59:59') }
			: presetDates(preset)
	);

	// ── Data fetching ─────────────────────────────────────────────────────────

	type PersonalData = Awaited<ReturnType<typeof trpc.usage.personal.query>>;
	type OrgData = Awaited<ReturnType<typeof trpc.usage.org.query>>;
	type UsageData = PersonalData | OrgData;
	let data = $state<UsageData | null>(null);
	let loading = $state(false);
	let loadError = $state('');

	async function load() {
		loading = true;
		loadError = '';
		try {
			const input = { from: dateRange.from.toISOString(), to: dateRange.to.toISOString() };
			if (props.mode === 'personal') {
				data = await trpc.usage.personal.query(input);
			} else {
				data = await trpc.usage.org.query({ ...input, orgId: props.orgId });
			}
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Error loading usage data';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		// Re-fetch when date range changes — touch both to track reactivity
		void dateRange.from;
		void dateRange.to;
		load();
	});

	// ── Formatting ────────────────────────────────────────────────────────────

	function fmtEur(v: string | number | null | undefined): string {
		const n = Number(v ?? 0);
		if (n === 0) return '€0.00';
		if (n < 0.001) return `€${n.toFixed(6)}`;
		if (n < 1) return `€${n.toFixed(4)}`;
		return `€${n.toFixed(2)}`;
	}

	function fmtTokens(v: string | number | null | undefined): string {
		const n = Number(v ?? 0);
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
		return String(n);
	}

	function fmtNum(v: string | number | null | undefined): string {
		return Number(v ?? 0).toLocaleString();
	}

	function taskLabel(task: string | null): string {
		return AI_TASKS.find((t) => t.id === task)?.label ?? task ?? '—';
	}

	function modelLabel(model: string): string {
		return MODEL_SHORT_LABEL[model] ?? model.split('/')[1] ?? model;
	}

	// ── SVG line chart ────────────────────────────────────────────────────────

	const CHART_W = 800;
	const CHART_H = 160;
	const PAD = { top: 10, right: 10, bottom: 30, left: 52 };

	const chartData = $derived.by(() => {
		if (!data?.byDay?.length) return null;
		const days = data.byDay;
		const maxCost = Math.max(...days.map((d) => Number(d.costEur)));
		if (maxCost === 0) return null;

		const innerW = CHART_W - PAD.left - PAD.right;
		const innerH = CHART_H - PAD.top - PAD.bottom;

		const xScale = (i: number) => PAD.left + (i / (days.length - 1 || 1)) * innerW;
		const yScale = (v: number) => PAD.top + innerH - (v / maxCost) * innerH;

		const points = days.map((d, i) => ({ x: xScale(i), y: yScale(Number(d.costEur)), ...d }));
		const path = points
			.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
			.join(' ');

		// y-axis ticks (3 ticks)
		const yTicks = [0, maxCost / 2, maxCost].map((v) => ({
			y: yScale(v),
			label: fmtEur(v)
		}));

		// x-axis: show first, last, and a few middle dates
		const step = Math.max(1, Math.floor(days.length / 5));
		const xTicks = days
			.map((d, i) => ({ i, label: d.date.slice(5) })) // MM-DD
			.filter((_, i) => i % step === 0 || i === days.length - 1);

		return { points, path, yTicks, xTicks, maxCost };
	});

	// ── Horizontal bar helpers ────────────────────────────────────────────────

	function maxOf(arr: { costEur: string }[]): number {
		return Math.max(...arr.map((r) => Number(r.costEur)), 0.000001);
	}
</script>

<div class="mx-auto max-w-5xl px-6 py-8">
	<!-- Header -->
	<div class="mb-8 flex flex-wrap items-start justify-between gap-4">
		<div>
			{#if props.mode === 'personal'}
				<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">AI Usage</h1>
				{#if props.ownedOrgs?.length}
					<div class="mt-1 flex flex-wrap gap-2">
						{#each props.ownedOrgs as org (org.id)}
							<a
								href={resolve(`/usage/org/${org.id}`)}
								class="font-sans text-xs text-accent underline decoration-dotted">{org.name} →</a
							>
						{/each}
					</div>
				{/if}
			{:else}
				<a
					href={resolve('/usage')}
					class="mb-2 flex items-center gap-1 font-sans text-sm text-ink-muted hover:text-ink dark:text-dark-ink-muted"
				>
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none"
						><path
							d="M10 12L6 8l4-4"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/></svg
					>
					My usage
				</a>
				<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
					{props.orgName}
				</h1>
				<p class="mt-0.5 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					Organization AI usage
				</p>
			{/if}
		</div>

		<!-- Date range controls -->
		<div class="flex flex-wrap items-center gap-2">
			{#each ['7d', '30d', '90d', 'custom'] as Preset[] as p (p)}
				<button
					type="button"
					onclick={() => (preset = p)}
					class="rounded-md px-3 py-1.5 font-sans text-sm transition-colors {preset === p
						? 'bg-accent text-white'
						: 'border border-paper-border text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted'}"
				>
					{p === 'custom'
						? 'Custom'
						: p === '7d'
							? 'Last 7 days'
							: p === '30d'
								? 'Last 30 days'
								: 'Last 90 days'}
				</button>
			{/each}
			{#if preset === 'custom'}
				<div class="flex items-center gap-1">
					<input
						type="date"
						bind:value={customFrom}
						max={customTo}
						class="rounded-md border border-paper-border bg-paper px-2 py-1.5 font-sans text-sm text-ink dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
					/>
					<span class="font-sans text-sm text-ink-muted">–</span>
					<input
						type="date"
						bind:value={customTo}
						min={customFrom}
						max={new Date().toISOString().slice(0, 10)}
						class="rounded-md border border-paper-border bg-paper px-2 py-1.5 font-sans text-sm text-ink dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
					/>
				</div>
			{/if}
		</div>
	</div>

	{#if loadError}
		<div
			class="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-400"
		>
			{loadError}
		</div>
	{/if}

	{#if loading && !data}
		<div class="flex items-center justify-center py-24">
			<Spinner size="lg" class="text-accent" />
		</div>
	{:else if data}
		<!-- KPI Cards -->
		<div class="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
			{#each [{ label: 'Total cost', value: fmtEur(data.summary?.totalCostEur) }, { label: 'API calls', value: fmtNum(data.summary?.totalCalls) }, { label: 'Input tokens', value: fmtTokens(data.summary?.totalInputTokens) }, { label: 'Output tokens', value: fmtTokens(data.summary?.totalOutputTokens) }] as card (card.label)}
				<div
					class="rounded-xl border border-paper-border bg-paper p-4 dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<p class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted">{card.label}</p>
					<p class="mt-1 font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
						{card.value}
					</p>
				</div>
			{/each}
		</div>

		<!-- Daily cost chart -->
		{#if chartData}
			<div
				class="mb-8 rounded-xl border border-paper-border bg-paper p-5 dark:border-dark-paper-border dark:bg-dark-paper"
			>
				<h2 class="mb-4 font-sans text-sm font-medium text-ink-muted dark:text-dark-ink-muted">
					Cost over time
				</h2>
				<div class="overflow-x-auto">
					<svg viewBox="0 0 {CHART_W} {CHART_H}" class="w-full" style="min-width:320px">
						<!-- Grid lines -->
						{#each chartData.yTicks as tick, i (i)}
							<line
								x1={PAD.left}
								y1={tick.y}
								x2={CHART_W - PAD.right}
								y2={tick.y}
								stroke="currentColor"
								stroke-width="0.5"
								class="text-paper-border dark:text-dark-paper-border"
								stroke-dasharray="4 4"
							/>
							<text
								x={PAD.left - 4}
								y={tick.y + 4}
								text-anchor="end"
								class="fill-ink-faint dark:fill-dark-ink-faint"
								font-size="10"
								font-family="sans-serif"
							>
								{tick.label}
							</text>
						{/each}

						<!-- Area fill -->
						<path
							d="{chartData.path} L{chartData.points.at(-1)!.x},{PAD.top +
								CHART_H -
								PAD.top -
								PAD.bottom} L{chartData.points[0].x},{PAD.top + CHART_H - PAD.top - PAD.bottom} Z"
							fill="currentColor"
							class="text-accent/10"
							opacity="0.8"
						/>

						<!-- Line -->
						<path
							d={chartData.path}
							fill="none"
							stroke="currentColor"
							class="text-accent"
							stroke-width="1.5"
							stroke-linejoin="round"
						/>

						<!-- Dots -->
						{#each chartData.points as p, i (i)}
							<circle cx={p.x} cy={p.y} r="2.5" fill="currentColor" class="text-accent" />
						{/each}

						<!-- X axis labels -->
						{#each chartData.xTicks as t (t.i)}
							<text
								x={chartData.points[t.i]?.x ?? 0}
								y={CHART_H - 6}
								text-anchor="middle"
								class="fill-ink-faint dark:fill-dark-ink-faint"
								font-size="10"
								font-family="sans-serif">{t.label}</text
							>
						{/each}
					</svg>
				</div>
			</div>
		{/if}

		<!-- Breakdown grid -->
		<div class="mb-8 grid gap-6 md:grid-cols-2">
			<!-- By task -->
			{#if data.byTask?.length}
				<div
					class="rounded-xl border border-paper-border bg-paper p-5 dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<h2 class="mb-4 font-sans text-sm font-medium text-ink-muted dark:text-dark-ink-muted">
						Cost by task
					</h2>
					<div class="space-y-2.5">
						{#each data.byTask as row (row.task)}
							{@const pct = (Number(row.costEur) / maxOf(data.byTask)) * 100}
							<div>
								<div class="mb-0.5 flex items-center justify-between gap-2">
									<span class="font-sans text-sm text-ink dark:text-dark-ink"
										>{taskLabel(row.task)}</span
									>
									<span class="shrink-0 font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
										>{fmtEur(row.costEur)} · {fmtNum(row.calls)} calls</span
									>
								</div>
								<div
									class="h-1.5 w-full overflow-hidden rounded-full bg-paper-ui dark:bg-dark-paper-ui"
								>
									<div
										class="h-full rounded-full bg-accent transition-all"
										style="width:{pct}%"
									></div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- By model -->
			{#if data.byModel?.length}
				<div
					class="rounded-xl border border-paper-border bg-paper p-5 dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<h2 class="mb-4 font-sans text-sm font-medium text-ink-muted dark:text-dark-ink-muted">
						Cost by model
					</h2>
					<div class="space-y-2.5">
						{#each data.byModel as row (row.model)}
							{@const pct = (Number(row.costEur) / maxOf(data.byModel)) * 100}
							<div>
								<div class="mb-0.5 flex items-center justify-between gap-2">
									<span class="truncate font-sans text-sm text-ink dark:text-dark-ink"
										>{modelLabel(row.model)}</span
									>
									<span class="shrink-0 font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
										>{fmtEur(row.costEur)}</span
									>
								</div>
								<div
									class="h-1.5 w-full overflow-hidden rounded-full bg-paper-ui dark:bg-dark-paper-ui"
								>
									<div
										class="h-full rounded-full bg-accent/70 transition-all"
										style="width:{pct}%"
									></div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- By project -->
			{#if data.byProject?.length}
				<div
					class="rounded-xl border border-paper-border bg-paper p-5 dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<h2 class="mb-4 font-sans text-sm font-medium text-ink-muted dark:text-dark-ink-muted">
						Top projects
					</h2>
					<div class="space-y-2.5">
						{#each data.byProject as row (row.projectId)}
							{@const pct = (Number(row.costEur) / maxOf(data.byProject)) * 100}
							<div>
								<div class="mb-0.5 flex items-center justify-between gap-2">
									<a
										href={resolve(`/projects/${row.projectId}`)}
										class="truncate font-sans text-sm text-ink hover:text-accent dark:text-dark-ink"
									>
										{row.title ?? row.projectId}
									</a>
									<span class="shrink-0 font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
										>{fmtEur(row.costEur)} · {fmtNum(row.calls)}</span
									>
								</div>
								<div
									class="h-1.5 w-full overflow-hidden rounded-full bg-paper-ui dark:bg-dark-paper-ui"
								>
									<div
										class="h-full rounded-full bg-accent/50 transition-all"
										style="width:{pct}%"
									></div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- By user (org only) -->
			{#if props.mode === 'org'}
				{@const orgData = data as OrgData}
				{#if orgData.byUser?.length}
					<div
						class="rounded-xl border border-paper-border bg-paper p-5 dark:border-dark-paper-border dark:bg-dark-paper"
					>
						<h2 class="mb-4 font-sans text-sm font-medium text-ink-muted dark:text-dark-ink-muted">
							Top users
						</h2>
						<div class="space-y-2.5">
							{#each orgData.byUser as row (row.userId)}
								{@const pct = (Number(row.costEur) / maxOf(orgData.byUser)) * 100}
								<div>
									<div class="mb-0.5 flex items-center justify-between gap-2">
										<span class="truncate font-sans text-sm text-ink dark:text-dark-ink"
											>{row.name ?? row.userId}</span
										>
										<span class="shrink-0 font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
											>{fmtEur(row.costEur)} · {fmtNum(row.calls)}</span
										>
									</div>
									<div
										class="h-1.5 w-full overflow-hidden rounded-full bg-paper-ui dark:bg-dark-paper-ui"
									>
										<div
											class="h-full rounded-full bg-accent/40 transition-all"
											style="width:{pct}%"
										></div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			{/if}
		</div>

		{#if Number(data.summary?.totalCalls) === 0}
			<div
				class="rounded-xl border border-dashed border-paper-border py-16 text-center dark:border-dark-paper-border"
			>
				<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					No AI usage in this period.
				</p>
			</div>
		{/if}
	{/if}
</div>

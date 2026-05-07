<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let templates = $derived(data.templates);

	// New template form state
	let showForm = $state(false);
	let saving = $state(false);
	let saveError = $state('');
	let name = $state('');
	let description = $state('');
	let type = $state<'describe' | 'ttest'>('describe');
	let isPublic = $state(false);

	// ttest params
	let ttestType = $state<'independent' | 'paired' | 'one_sample'>('independent');
	let ttestColumnA = $state('');
	let ttestColumnB = $state('');
	let ttestAlternative = $state<'two-sided' | 'less' | 'greater'>('two-sided');
	let ttestAlpha = $state(0.05);

	function buildParameters() {
		if (type === 'ttest') {
			return {
				test_type: ttestType,
				column_a: ttestColumnA,
				column_b: ttestColumnB || undefined,
				alternative: ttestAlternative,
				alpha: ttestAlpha
			};
		}
		return {};
	}

	async function save() {
		if (!name.trim()) return;
		saving = true;
		saveError = '';

		const res = await fetch(`/api/projects/${data.project.id}/templates`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, description, type, parameters: buildParameters(), isPublic })
		});

		if (res.ok) {
			await invalidateAll();
			showForm = false;
			name = '';
			description = '';
			type = 'describe';
			isPublic = false;
		} else {
			const body = await res.json().catch(() => ({}));
			saveError = body.message ?? 'Save failed';
		}
		saving = false;
	}

	async function deleteTemplate(templateId: string) {
		const res = await fetch(`/api/projects/${data.project.id}/templates?templateId=${templateId}`, {
			method: 'DELETE'
		});
		if (res.ok) await invalidateAll();
	}

	async function useTemplate(template: (typeof data.templates)[0]) {
		window.location.href = `/project/${data.project.id}/analyses/new?templateId=${template.id}`;
	}
</script>

<div class="p-8">
	<div class="flex items-center justify-between">
		<div>
			<a
				href="/project/{data.project.id}"
				class="text-sm text-ink-faint hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
			>
				← {data.project.title}
			</a>
			<h1 class="mt-1 text-2xl font-semibold text-ink dark:text-dark-ink">Templates</h1>
		</div>

		<button
			onclick={() => (showForm = !showForm)}
			class="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90 dark:bg-dark-ink dark:text-dark-paper"
		>
			{showForm ? 'Cancel' : 'New template'}
		</button>
	</div>

	<!-- New template form -->
	{#if showForm}
		<div class="mt-6 rounded-lg border border-paper-border p-6 dark:border-dark-paper-border">
			<h2 class="text-sm font-medium text-ink dark:text-dark-ink">New template</h2>

			<div class="mt-4 space-y-4">
				<div>
					<label for="tpl-name" class="block text-sm font-medium text-ink dark:text-dark-ink"
						>Name</label
					>
					<input
						id="tpl-name"
						type="text"
						bind:value={name}
						placeholder="e.g. Standard descriptive stats"
						class="mt-1 w-full rounded-md border border-paper-border bg-paper px-3 py-2 text-sm text-ink dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
					/>
				</div>

				<div>
					<label for="tpl-description" class="block text-sm font-medium text-ink dark:text-dark-ink"
						>Description <span class="text-ink-faint">(optional)</span></label
					>
					<input
						id="tpl-description"
						type="text"
						bind:value={description}
						placeholder="What does this template do?"
						class="mt-1 w-full rounded-md border border-paper-border bg-paper px-3 py-2 text-sm text-ink dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
					/>
				</div>

				<div>
					<p
						id="template-analysis-type-label"
						class="block text-sm font-medium text-ink dark:text-dark-ink"
					>
						Analysis type
					</p>
					<div class="mt-2 flex gap-3" role="group" aria-labelledby="template-analysis-type-label">
						<button
							class="rounded-md border px-4 py-2 text-sm transition-colors"
							class:border-ink={type === 'describe'}
							class:bg-ink={type === 'describe'}
							class:text-paper={type === 'describe'}
							class:border-paper-border={type !== 'describe'}
							class:text-ink-faint={type !== 'describe'}
							onclick={() => (type = 'describe')}
						>
							Descriptive stats
						</button>
						<button
							class="rounded-md border px-4 py-2 text-sm transition-colors"
							class:border-ink={type === 'ttest'}
							class:bg-ink={type === 'ttest'}
							class:text-paper={type === 'ttest'}
							class:border-paper-border={type !== 'ttest'}
							class:text-ink-faint={type !== 'ttest'}
							onclick={() => (type = 'ttest')}
						>
							t-test
						</button>
					</div>
				</div>

				{#if type === 'ttest'}
					<div
						class="space-y-3 rounded-lg border border-paper-border p-4 dark:border-dark-paper-border"
					>
						<div>
							<label
								for="tpl-ttest-type"
								class="block text-sm font-medium text-ink dark:text-dark-ink">Test type</label
							>
							<select
								id="tpl-ttest-type"
								bind:value={ttestType}
								class="mt-1 w-full rounded-md border border-paper-border bg-paper px-3 py-2 text-sm text-ink dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
							>
								<option value="independent">Independent samples</option>
								<option value="paired">Paired samples</option>
								<option value="one_sample">One sample</option>
							</select>
						</div>
						<div class="flex gap-4">
							<div class="flex-1">
								<label
									for="tpl-ttest-col-a"
									class="block text-sm font-medium text-ink dark:text-dark-ink">Column A</label
								>
								<input
									id="tpl-ttest-col-a"
									type="text"
									bind:value={ttestColumnA}
									placeholder="e.g. control"
									class="mt-1 w-full rounded-md border border-paper-border bg-paper px-3 py-2 text-sm text-ink dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
								/>
							</div>
							{#if ttestType !== 'one_sample'}
								<div class="flex-1">
									<label
										for="tpl-ttest-col-b"
										class="block text-sm font-medium text-ink dark:text-dark-ink">Column B</label
									>
									<input
										id="tpl-ttest-col-b"
										type="text"
										bind:value={ttestColumnB}
										placeholder="e.g. treatment"
										class="mt-1 w-full rounded-md border border-paper-border bg-paper px-3 py-2 text-sm text-ink dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
									/>
								</div>
							{/if}
						</div>
						<div class="flex gap-4">
							<div class="flex-1">
								<label
									for="tpl-ttest-alt"
									class="block text-sm font-medium text-ink dark:text-dark-ink">Alternative</label
								>
								<select
									id="tpl-ttest-alt"
									bind:value={ttestAlternative}
									class="mt-1 w-full rounded-md border border-paper-border bg-paper px-3 py-2 text-sm text-ink dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
								>
									<option value="two-sided">Two-sided</option>
									<option value="less">Less</option>
									<option value="greater">Greater</option>
								</select>
							</div>
							<div class="w-24">
								<label
									for="tpl-ttest-alpha"
									class="block text-sm font-medium text-ink dark:text-dark-ink">α</label
								>
								<input
									id="tpl-ttest-alpha"
									type="number"
									bind:value={ttestAlpha}
									min="0.001"
									max="0.1"
									step="0.005"
									class="mt-1 w-full rounded-md border border-paper-border bg-paper px-3 py-2 text-sm text-ink dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
								/>
							</div>
						</div>
					</div>
				{/if}

				<label class="flex items-center gap-2 text-sm text-ink dark:text-dark-ink">
					<input type="checkbox" bind:checked={isPublic} class="rounded" />
					Share publicly in the community hub
				</label>

				{#if saveError}
					<p class="text-sm text-red-600 dark:text-red-400">{saveError}</p>
				{/if}

				<button
					onclick={save}
					disabled={saving || !name.trim()}
					class="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-50 dark:bg-dark-ink dark:text-dark-paper"
				>
					{saving ? 'Saving…' : 'Save template'}
				</button>
			</div>
		</div>
	{/if}

	<!-- Template list -->
	<div class="mt-6">
		{#if templates.length === 0}
			<p class="text-sm text-ink-faint dark:text-dark-ink-faint">
				No templates yet. Save an analysis configuration to reuse it later.
			</p>
		{:else}
			<div class="space-y-3">
				{#each templates as template (template.id)}
					<div
						class="flex items-start justify-between rounded-lg border border-paper-border p-4 dark:border-dark-paper-border"
					>
						<div>
							<div class="flex items-center gap-2">
								<span translate="no" class="font-medium text-ink dark:text-dark-ink"
									>{template.name}</span
								>
								<span class="font-mono text-xs text-ink-faint dark:text-dark-ink-faint"
									>{template.type}</span
								>
								{#if template.isPublic}
									<span
										class="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900 dark:text-green-300"
									>
										public
									</span>
								{/if}
							</div>
							{#if template.description}
								<p translate="no" class="mt-1 text-sm text-ink-faint dark:text-dark-ink-faint">
									{template.description}
								</p>
							{/if}
						</div>
						<div class="flex items-center gap-3">
							<button
								onclick={() => useTemplate(template)}
								class="text-sm text-ink-faint underline decoration-dotted hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
							>
								Use
							</button>
							{#if template.createdBy === data.userId}
								<button
									onclick={() => deleteTemplate(template.id)}
									class="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
								>
									Delete
								</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

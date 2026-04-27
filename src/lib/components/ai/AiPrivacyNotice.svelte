<script lang="ts">
	const PRIVACY_KEY = 'scholio_ai_privacy_seen';

	let visible = $state(
		typeof localStorage !== 'undefined' && !localStorage.getItem(PRIVACY_KEY)
	);

	function dismiss() {
		localStorage.setItem(PRIVACY_KEY, '1');
		visible = false;
	}
</script>

{#if visible}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-labelledby="privacy-notice-title"
	>
		<div
			class="w-full max-w-md rounded-2xl border border-paper-border bg-paper p-6 shadow-xl dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<div class="flex items-start gap-3">
				<div
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950"
				>
					<svg
						class="h-5 w-5 text-blue-600 dark:text-blue-400"
						viewBox="0 0 24 24"
						fill="none"
						aria-hidden="true"
					>
						<path
							d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linejoin="round"
						/>
					</svg>
				</div>
				<div>
					<h2
						id="privacy-notice-title"
						class="font-serif text-base font-semibold text-ink dark:text-dark-ink"
					>
						Your documents are private
					</h2>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						When you use the AI assistant, the content of your documents is sent to OpenRouter <strong
							class="font-medium text-ink dark:text-dark-ink">only to process your query</strong
						>.
					</p>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						None of these providers use data sent via API to train their models. Your research stays
						within the query.
					</p>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						You can review the privacy policy at
						<a
							href="https://openrouter.ai/privacy"
							target="_blank"
							rel="noopener noreferrer"
							class="text-accent underline underline-offset-2">OpenRouter</a
						>.
					</p>
				</div>
			</div>
			<div class="mt-5 flex justify-end">
				<button
					onclick={dismiss}
					class="rounded-lg bg-accent px-5 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover"
				>
					Got it
				</button>
			</div>
		</div>
	</div>
{/if}

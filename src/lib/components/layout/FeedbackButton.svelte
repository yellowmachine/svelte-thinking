<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import X from '@lucide/svelte/icons/x';
	import { trpc } from '$lib/utils/trpc';

	import { resolve } from '$app/paths';
	let open = $state(false);
	let message = $state('');
	let showName = $state(false);
	let submitting = $state(false);
	let done = $state(false);
	let error = $state('');

	async function submit() {
		if (!message.trim()) return;
		submitting = true;
		error = '';
		try {
			await trpc.feedback.submit.mutate({ message: message.trim(), showName });
			done = true;
			message = '';
			showName = false;
			setTimeout(() => {
				open = false;
				done = false;
			}, 2000);
		} catch {
			error = 'Failed to send. Please try again.';
		} finally {
			submitting = false;
		}
	}

	function close() {
		open = false;
		done = false;
		error = '';
	}
</script>

<!-- Floating button -->
<button
	onclick={() => (open = true)}
	class="fixed right-6 bottom-6 z-40 hidden items-center gap-2 rounded-full bg-accent px-4 py-2.5 font-sans text-sm font-medium text-white shadow-lg transition-all hover:bg-accent-hover hover:shadow-xl sm:flex"
	aria-label="Send feedback"
>
	<MessageSquare size={14} strokeWidth={1.75} aria-hidden="true" />
	Feedback
</button>

<!-- Modal -->
{#if open}
	<div class="fixed inset-0 z-50 flex items-end justify-end p-6 sm:items-center sm:justify-center">
		<!-- Backdrop -->
		<button class="absolute inset-0 bg-black/30 backdrop-blur-sm" onclick={close} aria-label="Close"
		></button>

		<div
			class="relative w-full max-w-md rounded-2xl border border-paper-border bg-paper shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="feedback-dialog-title"
		>
			<div class="flex items-center justify-between border-b border-paper-border px-5 py-4">
				<div>
					<h2 id="feedback-dialog-title" class="font-serif text-base font-semibold text-ink">
						Leave feedback
					</h2>
					<p class="mt-0.5 font-sans text-xs text-ink-faint">
						We're in beta — your feedback shapes Scholio.
					</p>
				</div>
				<button
					onclick={close}
					class="rounded-md p-1 text-ink-muted hover:bg-paper-ui"
					aria-label="Close"
				>
					<X size={14} strokeWidth={1.75} aria-hidden="true" />
				</button>
			</div>

			<div class="p-5">
				{#if done}
					<div class="flex flex-col items-center gap-2 py-6 text-center">
						<Check size={32} strokeWidth={1.75} class="text-success" aria-hidden="true" />
						<p class="font-serif text-base font-medium text-ink">Thank you!</p>
						<p class="font-sans text-sm text-ink-muted">Your feedback has been published.</p>
					</div>
				{:else}
					<textarea
						bind:value={message}
						rows="4"
						placeholder="What would you improve? What's missing? Anything not working well?"
						class="w-full resize-none rounded-lg border border-paper-border bg-paper-ui px-3 py-2.5 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
					></textarea>

					<div class="mt-3 rounded-lg border border-warning-border bg-warning-bg px-3 py-2">
						<p class="font-sans text-xs text-warning">
							Feedback is public and visible at <a
								href={resolve('/feedback')}
								class="underline hover:no-underline">/feedback</a
							>.
						</p>
					</div>

					<label class="mt-3 flex cursor-pointer items-center gap-2.5">
						<input
							type="checkbox"
							bind:checked={showName}
							class="h-4 w-4 rounded border-paper-border accent-accent"
						/>
						<span class="font-sans text-sm text-ink-muted">Show my name alongside the feedback</span
						>
					</label>

					{#if error}
						<p class="mt-2 font-sans text-sm text-danger">{error}</p>
					{/if}

					<div class="mt-4 flex justify-end gap-2">
						<button
							onclick={close}
							class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui"
						>
							Cancel
						</button>
						<button
							onclick={submit}
							disabled={submitting || !message.trim()}
							class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
						>
							{submitting ? 'Sending…' : 'Send'}
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

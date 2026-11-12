<script lang="ts">
	import { navigating } from '$app/state';
</script>

{#if navigating.to}
	<!-- Starts transparent and fades in after 150 ms (CSS), so fast navigations don't flash a bar. -->
	<div
		class="nav-progress-track pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5 overflow-hidden"
		role="progressbar"
		aria-label="Loading page"
	>
		<div class="nav-progress-bar h-full w-1/3 bg-accent"></div>
	</div>
{/if}

<style>
	.nav-progress-track {
		opacity: 0;
		animation: nav-progress-appear 0s linear 150ms forwards;
	}
	.nav-progress-bar {
		animation: nav-progress-slide 1.1s ease-in-out infinite;
	}
	@keyframes nav-progress-appear {
		to {
			opacity: 1;
		}
	}
	@keyframes nav-progress-slide {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(300%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.nav-progress-bar {
			animation: none;
			width: 100%;
			opacity: 0.6;
		}
	}
</style>

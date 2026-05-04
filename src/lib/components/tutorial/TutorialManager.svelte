<script lang="ts">
	import { onMount } from 'svelte';
	import { driver } from 'driver.js';
	import 'driver.js/dist/driver.css';
	import type { DriveStep } from 'driver.js';
	import { trpc } from '$lib/utils/trpc';

	interface Props {
		slug:
			| 'projects'
			| 'project'
			| 'document'
			| 'bib'
			| 'project-bib'
			| 'settings'
			| 'project-review'
			| 'project-search'
			| 'project-issues';
		completedTutorials: string[];
		steps: DriveStep[];
		minWidth?: number;
	}

	let { slug, completedTutorials, steps, minWidth }: Props = $props();

	onMount(() => {
		if (completedTutorials.includes(slug)) return;
		if (minWidth !== undefined && window.innerWidth < minWidth) return;

		const tour = driver({
			showProgress: true,
			allowClose: true,
			steps,
			onDestroyed: () => {
				trpc.users.completeTutorial.mutate(slug).catch(console.error);
			}
		});

		tour.drive();
	});
</script>

<script lang="ts">
	import type { PageData } from './$types';

	let { data } = $props();
</script>

<div class="mx-auto max-w-3xl px-6 py-10">
	<h1 class="mb-2 font-serif text-3xl font-semibold text-ink dark:text-dark-ink">Admin</h1>
	<p class="mb-8 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
		Panel de administración de Scholio.
	</p>

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<a
			href="/admin/waitlist"
			class="group rounded-xl border border-paper-border bg-paper p-5 transition-colors hover:border-accent dark:border-dark-paper-border dark:bg-dark-paper dark:hover:border-accent"
		>
			<p
				class="font-sans text-xs font-medium tracking-wider text-ink-faint uppercase dark:text-dark-ink-faint"
			>
				Waitlist
			</p>
			<p class="mt-1 font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
				{data.pendingWaitlist}
				<span class="font-sans text-sm font-normal text-ink-muted dark:text-dark-ink-muted"
					>pendientes</span
				>
			</p>
			<p
				class="mt-3 font-sans text-xs text-accent opacity-0 transition-opacity group-hover:opacity-100"
			>
				Ver waitlist →
			</p>
		</a>

		<a
			href="/admin/users"
			class="group rounded-xl border border-paper-border bg-paper p-5 transition-colors hover:border-accent dark:border-dark-paper-border dark:bg-dark-paper dark:hover:border-accent"
		>
			<p
				class="font-sans text-xs font-medium tracking-wider text-ink-faint uppercase dark:text-dark-ink-faint"
			>
				Usuarios
			</p>
			<p class="mt-1 font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
				{data.totalUsers}
				<span class="font-sans text-sm font-normal text-ink-muted dark:text-dark-ink-muted"
					>registrados</span
				>
			</p>
			<p
				class="mt-3 font-sans text-xs text-accent opacity-0 transition-opacity group-hover:opacity-100"
			>
				Buscar usuarios →
			</p>
		</a>

		<a
			href="/admin/activity"
			class="group rounded-xl border border-paper-border bg-paper p-5 transition-colors hover:border-accent dark:border-dark-paper-border dark:bg-dark-paper dark:hover:border-accent"
		>
			<p
				class="font-sans text-xs font-medium tracking-wider text-ink-faint uppercase dark:text-dark-ink-faint"
			>
				Actividad
			</p>
			<p class="mt-1 font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
				{data.recentlyActive}
				<span class="font-sans text-sm font-normal text-ink-muted dark:text-dark-ink-muted"
					>últimos {data.activityDays}d</span
				>
			</p>
			<p
				class="mt-3 font-sans text-xs text-accent opacity-0 transition-opacity group-hover:opacity-100"
			>
				Ver actividad →
			</p>
		</a>

		<a
			href="/admin/panics3"
			class="group rounded-xl border border-paper-border bg-paper p-5 transition-colors hover:border-accent dark:border-dark-paper-border dark:bg-dark-paper dark:hover:border-accent"
		>
			<p
				class="font-sans text-xs font-medium tracking-wider text-ink-faint uppercase dark:text-dark-ink-faint"
			>
				Storage
			</p>
			<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Gestión de almacenamiento interno (S3).
			</p>
			<p
				class="mt-3 font-sans text-xs text-accent opacity-0 transition-opacity group-hover:opacity-100"
			>
				Ver storage →
			</p>
		</a>

		<a
			href="/admin/notifications"
			class="group rounded-xl border border-paper-border bg-paper p-5 transition-colors hover:border-accent dark:border-dark-paper-border dark:bg-dark-paper dark:hover:border-accent"
		>
			<p
				class="font-sans text-xs font-medium tracking-wider text-ink-faint uppercase dark:text-dark-ink-faint"
			>
				Notifications
			</p>
			<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Banners informativos para todos los usuarios.
			</p>
			<p
				class="mt-3 font-sans text-xs text-accent opacity-0 transition-opacity group-hover:opacity-100"
			>
				Manage →
			</p>
		</a>
	</div>
</div>

import type { User, Session } from 'better-auth/minimal';
import type { Db } from '$lib/server/db';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user?: User;
			session?: Session;
			/**
			 * true si el usuario autenticado tiene user_profile en scholio.
			 * false si existe en public.user (e.g. usuario de Librarian) pero no en Scholio.
			 */
			hasScholioProfile: boolean;
			/**
			 * Ejecuta `fn` dentro de una transacción con `app.current_user_id` seteado.
			 * Las políticas RLS de PostgreSQL usan esa variable para filtrar filas.
			 * Lanza UNAUTHORIZED si no hay usuario autenticado.
			 */
			withRLS: <T>(fn: (db: Db) => Promise<T>) => Promise<T>;
		}

		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};

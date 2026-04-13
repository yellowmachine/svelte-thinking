import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { user } from '$lib/server/db/auth.schema';
import { INTERNAL_STORAGE_QUOTA_BYTES } from '$lib/server/storage';
import { db } from '$lib/server/db';

const withAdminRLS = <T>(fn: (tx: typeof db) => Promise<T>): Promise<T> =>
	db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.is_admin', 'true', true)`);
		await tx.execute(sql`SET LOCAL search_path = scholio, public`);
		return fn(tx as unknown as typeof db);
	});

export const load: PageServerLoad = async () => {
	const rows = await withAdminRLS((db) =>
		db
			.select({
				userId: userProfile.userId,
				name: user.name,
				email: user.email,
				usedBytes: userProfile.internalStorageUsedBytes
			})
			.from(userProfile)
			.innerJoin(user, eq(user.id, userProfile.userId))
			.where(eq(userProfile.useInternalStorage, true))
	);

	const totalUsedBytes = rows.reduce((acc, r) => acc + (r.usedBytes ?? 0), 0);

	return {
		users: rows,
		totalUsedBytes,
		quotaBytes: INTERNAL_STORAGE_QUOTA_BYTES
	};
};

export const actions: Actions = {
	disableUser: async ({ request }) => {
		const data = await request.formData();
		const userId = data.get('userId')?.toString();
		if (!userId) return fail(400, { error: 'userId required' });

		await withAdminRLS((db) =>
			db
				.update(userProfile)
				.set({ useInternalStorage: false, updatedAt: new Date() })
				.where(eq(userProfile.userId, userId))
		);

		return { ok: true };
	},

	disableAll: async () => {
		await withAdminRLS((db) =>
			db
				.update(userProfile)
				.set({ useInternalStorage: false, updatedAt: new Date() })
				.where(eq(userProfile.useInternalStorage, true))
		);

		return { ok: true };
	}
};

import { TRPCError } from '@trpc/server';
import {
	isUniqueViolation,
	isForeignKeyViolation,
	isRlsViolation,
	constraintName
} from './detect-db-error';

type Entity = 'document' | 'project' | 'membership';

interface Meta {
	entity: Entity;
	operation: string;
	/** Constraint-specific overrides: maps constraint name → human message */
	constraints?: Record<string, string>;
}

export function mapDbError(err: unknown, meta: Meta): TRPCError {
	if (isUniqueViolation(err)) {
		const constraint = constraintName(err);
		const message =
			(constraint && meta.constraints?.[constraint]) ??
			`Ya existe un ${meta.entity} con esos datos`;
		return new TRPCError({ code: 'CONFLICT', message });
	}

	if (isRlsViolation(err)) {
		return new TRPCError({
			code: 'FORBIDDEN',
			message: 'No tienes permisos para realizar esta operación'
		});
	}

	if (isForeignKeyViolation(err)) {
		return new TRPCError({
			code: 'BAD_REQUEST',
			message: 'La referencia relacionada no existe o no es válida'
		});
	}

	return new TRPCError({
		code: 'INTERNAL_SERVER_ERROR',
		message: `Unexpected database error during ${meta.operation}`,
		cause: err
	});
}

import type { IncomingStockOperation } from './sync-handlers';

/**
 * Server-side input validation (KTD7): client records are proposals, not
 * authority. Every mutation is checked against an allow-listed shape and
 * sane bounds before it is ever handed to a D1 statement, independent of
 * parameterized-query safety.
 */

const ALLOWED_REASONS = new Set(['sale', 'restock', 'adjustment', 'return']);
const MAX_ABS_QUANTITY_CHANGE = 1_000_000;
const MAX_ID_LENGTH = 128;

export type ValidationResult =
    | { ok: true; value: IncomingStockOperation }
    | { ok: false; error: string };

export function validateIncomingOperation(raw: unknown): ValidationResult {
    if (typeof raw !== 'object' || raw === null) {
        return { ok: false, error: 'operation must be an object' };
    }

    const op = raw as Record<string, unknown>;

    if (typeof op.id !== 'string' || op.id.length === 0 || op.id.length > MAX_ID_LENGTH) {
        return { ok: false, error: 'id must be a non-empty string' };
    }

    if (typeof op.productId !== 'number' || !Number.isInteger(op.productId) || op.productId <= 0) {
        return { ok: false, error: 'productId must be a positive integer' };
    }

    if (
        typeof op.quantityChange !== 'number' ||
        !Number.isFinite(op.quantityChange) ||
        !Number.isInteger(op.quantityChange) ||
        op.quantityChange === 0 ||
        Math.abs(op.quantityChange) > MAX_ABS_QUANTITY_CHANGE
    ) {
        return { ok: false, error: 'quantityChange must be a nonzero, bounded integer' };
    }

    if (typeof op.timestamp !== 'string' || op.timestamp.length === 0 || Number.isNaN(Date.parse(op.timestamp))) {
        return { ok: false, error: 'timestamp must be a parseable date string' };
    }

    if (op.reason !== undefined && (typeof op.reason !== 'string' || !ALLOWED_REASONS.has(op.reason))) {
        return { ok: false, error: 'reason must be one of sale, restock, adjustment, return' };
    }

    return {
        ok: true,
        value: {
            id: op.id,
            productId: op.productId,
            quantityChange: op.quantityChange,
            timestamp: op.timestamp,
            reason: op.reason as IncomingStockOperation['reason']
        }
    };
}

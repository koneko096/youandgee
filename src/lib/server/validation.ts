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

    if (typeof op.productUuid !== 'string' || op.productUuid.length === 0 || op.productUuid.length > MAX_ID_LENGTH) {
        return { ok: false, error: 'productUuid must be a non-empty string' };
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
            productUuid: op.productUuid,
            quantityChange: op.quantityChange,
            timestamp: op.timestamp,
            reason: op.reason as IncomingStockOperation['reason']
        }
    };
}

const MAX_PRICE_MINOR_UNITS = 1_000_000_000; // 10,000,000.00 in the smallest displayed currency unit
const MAX_NAME_LENGTH = 200;

export interface IncomingProduct {
    uuid: string;
    name: string;
    price: number;
    archived: boolean;
    updatedAt: string;
}

export type ProductValidationResult =
    | { ok: true; value: IncomingProduct }
    | { ok: false; error: string };

export function validateIncomingProduct(raw: unknown): ProductValidationResult {
    if (typeof raw !== 'object' || raw === null) {
        return { ok: false, error: 'product must be an object' };
    }

    const p = raw as Record<string, unknown>;

    if (typeof p.uuid !== 'string' || p.uuid.length === 0 || p.uuid.length > MAX_ID_LENGTH) {
        return { ok: false, error: 'uuid must be a non-empty string' };
    }

    if (typeof p.name !== 'string' || p.name.trim().length === 0 || p.name.length > MAX_NAME_LENGTH) {
        return { ok: false, error: 'name must be a non-empty string' };
    }

    if (
        typeof p.price !== 'number' ||
        !Number.isInteger(p.price) ||
        p.price < 0 ||
        p.price > MAX_PRICE_MINOR_UNITS
    ) {
        return { ok: false, error: 'price must be a non-negative, bounded integer (minor units)' };
    }

    if (typeof p.archived !== 'boolean') {
        return { ok: false, error: 'archived must be a boolean' };
    }

    if (typeof p.updatedAt !== 'string' || p.updatedAt.length === 0 || Number.isNaN(Date.parse(p.updatedAt))) {
        return { ok: false, error: 'updatedAt must be a parseable date string' };
    }

    return {
        ok: true,
        value: {
            uuid: p.uuid,
            name: p.name,
            price: p.price,
            archived: p.archived,
            updatedAt: p.updatedAt
        }
    };
}

const MAX_ORDER_ITEMS = 500;
const MAX_CUSTOMER_NAME_LENGTH = 200;

export interface IncomingOrderItem {
    name: string;
    price: number;
    quantity: number;
}

export interface IncomingOrder {
    uuid: string;
    date: string;
    customerName: string | undefined;
    total: number;
    items: IncomingOrderItem[];
}

export type OrderValidationResult =
    | { ok: true; value: IncomingOrder }
    | { ok: false; error: string };

function validateIncomingOrderItem(raw: unknown): IncomingOrderItem | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const item = raw as Record<string, unknown>;

    if (typeof item.name !== 'string' || item.name.trim().length === 0 || item.name.length > MAX_NAME_LENGTH) return null;
    if (typeof item.price !== 'number' || !Number.isInteger(item.price) || item.price < 0 || item.price > MAX_PRICE_MINOR_UNITS) return null;
    if (typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity <= 0) return null;

    return { name: item.name, price: item.price, quantity: item.quantity };
}

export function validateIncomingOrder(raw: unknown): OrderValidationResult {
    if (typeof raw !== 'object' || raw === null) {
        return { ok: false, error: 'order must be an object' };
    }

    const o = raw as Record<string, unknown>;

    if (typeof o.uuid !== 'string' || o.uuid.length === 0 || o.uuid.length > MAX_ID_LENGTH) {
        return { ok: false, error: 'uuid must be a non-empty string' };
    }

    if (typeof o.date !== 'string' || o.date.length === 0 || Number.isNaN(Date.parse(o.date))) {
        return { ok: false, error: 'date must be a parseable date string' };
    }

    if (o.customerName !== undefined && (typeof o.customerName !== 'string' || o.customerName.length > MAX_CUSTOMER_NAME_LENGTH)) {
        return { ok: false, error: 'customerName must be a string' };
    }

    if (
        typeof o.total !== 'number' ||
        !Number.isInteger(o.total) ||
        o.total < 0 ||
        o.total > MAX_PRICE_MINOR_UNITS
    ) {
        return { ok: false, error: 'total must be a non-negative, bounded integer (minor units)' };
    }

    if (!Array.isArray(o.items) || o.items.length === 0 || o.items.length > MAX_ORDER_ITEMS) {
        return { ok: false, error: `items must be a non-empty array of at most ${MAX_ORDER_ITEMS} entries` };
    }

    const items: IncomingOrderItem[] = [];
    for (const raw of o.items) {
        const item = validateIncomingOrderItem(raw);
        if (!item) {
            return { ok: false, error: 'every item needs a non-empty name, a non-negative integer price, and a positive integer quantity' };
        }
        items.push(item);
    }

    return {
        ok: true,
        value: {
            uuid: o.uuid,
            date: o.date,
            customerName: o.customerName as string | undefined,
            total: o.total,
            items
        }
    };
}

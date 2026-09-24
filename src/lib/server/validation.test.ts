import { describe, expect, it } from 'vitest';
import { validateIncomingOperation, validateIncomingOrder, validateIncomingProduct } from './validation';

const VALID = {
    id: 'op-1',
    productUuid: 'product-uuid-1',
    quantityChange: -2,
    timestamp: '2026-01-01T00:00:00.000Z',
    reason: 'sale'
};

describe('validateIncomingOperation', () => {
    it('accepts a well-formed operation', () => {
        const result = validateIncomingOperation(VALID);
        expect(result).toEqual({ ok: true, value: VALID });
    });

    it('accepts an operation with no reason (defaulted downstream)', () => {
        const withoutReason: Record<string, unknown> = { ...VALID };
        delete withoutReason.reason;
        const result = validateIncomingOperation(withoutReason);
        expect(result.ok).toBe(true);
    });

    it('rejects a non-object payload', () => {
        expect(validateIncomingOperation(null).ok).toBe(false);
        expect(validateIncomingOperation('op-1').ok).toBe(false);
        expect(validateIncomingOperation(42).ok).toBe(false);
    });

    it('rejects a missing or empty id', () => {
        expect(validateIncomingOperation({ ...VALID, id: '' }).ok).toBe(false);
        expect(validateIncomingOperation({ ...VALID, id: undefined }).ok).toBe(false);
    });

    it('rejects a missing, empty, or non-string productUuid', () => {
        expect(validateIncomingOperation({ ...VALID, productUuid: '' }).ok).toBe(false);
        expect(validateIncomingOperation({ ...VALID, productUuid: undefined }).ok).toBe(false);
        expect(validateIncomingOperation({ ...VALID, productUuid: 1 }).ok).toBe(false);
    });

    it('rejects a zero, non-finite, non-integer, or out-of-bounds quantityChange', () => {
        expect(validateIncomingOperation({ ...VALID, quantityChange: 0 }).ok).toBe(false);
        expect(validateIncomingOperation({ ...VALID, quantityChange: NaN }).ok).toBe(false);
        expect(validateIncomingOperation({ ...VALID, quantityChange: Infinity }).ok).toBe(false);
        expect(validateIncomingOperation({ ...VALID, quantityChange: 1.5 }).ok).toBe(false);
        expect(validateIncomingOperation({ ...VALID, quantityChange: 10_000_000 }).ok).toBe(false);
    });

    it('rejects an unparseable timestamp', () => {
        expect(validateIncomingOperation({ ...VALID, timestamp: 'not-a-date' }).ok).toBe(false);
        expect(validateIncomingOperation({ ...VALID, timestamp: '' }).ok).toBe(false);
    });

    it('rejects a reason outside the allowed set', () => {
        expect(validateIncomingOperation({ ...VALID, reason: 'refund' }).ok).toBe(false);
    });
});

const VALID_PRODUCT = {
    uuid: 'product-uuid-1',
    name: 'Widget',
    price: 1000,
    archived: false,
    updatedAt: '2026-01-01T00:00:00.000Z'
};

describe('validateIncomingProduct', () => {
    it('accepts a well-formed product', () => {
        expect(validateIncomingProduct(VALID_PRODUCT)).toEqual({ ok: true, value: VALID_PRODUCT });
    });

    it('rejects a non-object payload', () => {
        expect(validateIncomingProduct(null).ok).toBe(false);
        expect(validateIncomingProduct('p-1').ok).toBe(false);
    });

    it('rejects a missing, empty, or blank name', () => {
        expect(validateIncomingProduct({ ...VALID_PRODUCT, name: '' }).ok).toBe(false);
        expect(validateIncomingProduct({ ...VALID_PRODUCT, name: '   ' }).ok).toBe(false);
        expect(validateIncomingProduct({ ...VALID_PRODUCT, name: undefined }).ok).toBe(false);
    });

    it('rejects a negative, non-integer, or out-of-bounds price', () => {
        expect(validateIncomingProduct({ ...VALID_PRODUCT, price: -1 }).ok).toBe(false);
        expect(validateIncomingProduct({ ...VALID_PRODUCT, price: 1.5 }).ok).toBe(false);
        expect(validateIncomingProduct({ ...VALID_PRODUCT, price: 10_000_000_000 }).ok).toBe(false);
    });

    it('rejects a non-boolean archived flag', () => {
        expect(validateIncomingProduct({ ...VALID_PRODUCT, archived: 'false' }).ok).toBe(false);
        expect(validateIncomingProduct({ ...VALID_PRODUCT, archived: 0 }).ok).toBe(false);
    });

    it('rejects an unparseable updatedAt', () => {
        expect(validateIncomingProduct({ ...VALID_PRODUCT, updatedAt: 'not-a-date' }).ok).toBe(false);
    });
});

const VALID_ORDER = {
    uuid: 'order-uuid-1',
    date: '2026-01-01T00:00:00.000Z',
    customerName: 'Ada Lovelace',
    total: 3000,
    items: [{ name: 'Widget', price: 1000, quantity: 3 }]
};

describe('validateIncomingOrder', () => {
    it('accepts a well-formed order', () => {
        expect(validateIncomingOrder(VALID_ORDER)).toEqual({ ok: true, value: VALID_ORDER });
    });

    it('rejects a non-object payload', () => {
        expect(validateIncomingOrder(null).ok).toBe(false);
    });

    it('rejects a missing or empty uuid', () => {
        expect(validateIncomingOrder({ ...VALID_ORDER, uuid: '' }).ok).toBe(false);
    });

    it('rejects an unparseable date', () => {
        expect(validateIncomingOrder({ ...VALID_ORDER, date: 'not-a-date' }).ok).toBe(false);
    });

    it('rejects a non-string customerName', () => {
        expect(validateIncomingOrder({ ...VALID_ORDER, customerName: 42 }).ok).toBe(false);
    });

    it('rejects a negative, non-integer, or out-of-bounds total', () => {
        expect(validateIncomingOrder({ ...VALID_ORDER, total: -1 }).ok).toBe(false);
        expect(validateIncomingOrder({ ...VALID_ORDER, total: 1.5 }).ok).toBe(false);
        expect(validateIncomingOrder({ ...VALID_ORDER, total: 10_000_000_000 }).ok).toBe(false);
    });

    it('rejects a non-array, empty, or oversized items list', () => {
        expect(validateIncomingOrder({ ...VALID_ORDER, items: 'not-an-array' }).ok).toBe(false);
        expect(validateIncomingOrder({ ...VALID_ORDER, items: [] }).ok).toBe(false);
        expect(
            validateIncomingOrder({ ...VALID_ORDER, items: Array.from({ length: 501 }, () => ({ name: 'x', price: 1, quantity: 1 })) }).ok
        ).toBe(false);
    });

    it('rejects an item with an invalid name, price, or quantity', () => {
        expect(validateIncomingOrder({ ...VALID_ORDER, items: [{ name: '', price: 1000, quantity: 1 }] }).ok).toBe(false);
        expect(validateIncomingOrder({ ...VALID_ORDER, items: [{ name: 'Widget', price: -1, quantity: 1 }] }).ok).toBe(false);
        expect(validateIncomingOrder({ ...VALID_ORDER, items: [{ name: 'Widget', price: 1000, quantity: 0 }] }).ok).toBe(false);
        expect(validateIncomingOrder({ ...VALID_ORDER, items: [{ name: 'Widget', price: 1000, quantity: 1.5 }] }).ok).toBe(false);
    });
});

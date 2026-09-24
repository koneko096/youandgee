import { describe, expect, it, vi } from 'vitest';
import { pullOrders, pushOrders, type D1Like } from './order-sync';

function fakeDb(overrides: Partial<D1Like> = {}): D1Like {
    return {
        prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue({ results: [] })
        }),
        batch: vi.fn().mockResolvedValue([]),
        ...overrides
    };
}

const VALID_ORDER = {
    uuid: 'order-uuid-1',
    date: '2026-01-01T00:00:00.000Z',
    customerName: 'Ada Lovelace',
    total: 3000,
    items: [{ name: 'Widget', price: 1000, quantity: 3 }]
};

describe('pushOrders', () => {
    it('accepts a well-formed order and reports it processed', async () => {
        const db = fakeDb();
        const result = await pushOrders(db, [VALID_ORDER]);
        expect(result.success).toBe(true);
        expect(result.processedUuids).toEqual(['order-uuid-1']);
        expect(result.rejected).toEqual([]);
    });

    it('rejects an invalid order without writing it', async () => {
        const db = fakeDb();
        const result = await pushOrders(db, [{ ...VALID_ORDER, items: [] }]);
        expect(result.processedUuids).toEqual([]);
        expect(result.rejected).toHaveLength(1);
        expect(result.rejected[0]).toMatchObject({ uuid: 'order-uuid-1' });
        expect(db.batch).not.toHaveBeenCalled();
    });

    it('is insert-only (ON CONFLICT DO NOTHING) — orders are immutable, retrying a push must not alter one', async () => {
        const preparedSql: string[] = [];
        const bind = vi.fn().mockReturnThis();
        const db = fakeDb({
            prepare: vi.fn().mockImplementation((sql: string) => {
                preparedSql.push(sql);
                return { bind, all: vi.fn() };
            })
        });

        await pushOrders(db, [VALID_ORDER]);

        const sql = preparedSql[0];
        expect(sql).toContain('INSERT INTO orders');
        expect(sql).toContain('ON CONFLICT(uuid) DO NOTHING');
        expect(bind).toHaveBeenCalledWith(
            'order-uuid-1',
            '2026-01-01T00:00:00.000Z',
            'Ada Lovelace',
            3000,
            JSON.stringify(VALID_ORDER.items)
        );
    });
});

describe('pullOrders', () => {
    it('returns orders created since the given cursor plus a fresh timestamp, with items parsed back to an array', async () => {
        const row = {
            uuid: 'order-uuid-1',
            date: '2026-01-01T00:00:00.000Z',
            customerName: 'Ada Lovelace',
            total: 3000,
            items: JSON.stringify(VALID_ORDER.items)
        };
        const db = fakeDb({
            prepare: vi.fn().mockReturnValue({
                bind: vi.fn().mockReturnThis(),
                all: vi.fn().mockResolvedValue({ results: [row] })
            })
        });

        const result = await pullOrders(db, '2026-01-01T00:00:00.000Z');

        expect(result.orders).toEqual([{ ...row, items: VALID_ORDER.items }]);
        expect(result.timestamp).toEqual(expect.any(String));
    });

    it('returns an empty array when the query yields no results', async () => {
        const db = fakeDb();
        const result = await pullOrders(db, '2026-01-01T00:00:00.000Z');
        expect(result.orders).toEqual([]);
    });
});

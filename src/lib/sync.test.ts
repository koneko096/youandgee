import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';

function fakeLocalStorage() {
    const store = new Map<string, string>();
    return {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
            store.set(key, value);
        }
    };
}

describe('pullRemoteUpdates', () => {
    beforeEach(async () => {
        await db.products.clear();
        await db.operations.clear();
        vi.stubGlobal('localStorage', fakeLocalStorage());
    });

    it('rebuilds affected product stock from the ledger after applying remote movements', async () => {
        const productId = await db.products.add({
            uuid: 'p-1',
            name: 'Widget',
            price: 1000,
            stock: 0,
            archived: false
        });

        // A remote device recorded a restock this device has never seen.
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    newOperations: [
                        {
                            id: 'remote-op-1',
                            productId,
                            quantityChange: 10,
                            timestamp: '2026-01-01T00:00:00.000Z',
                            reason: 'restock'
                        }
                    ],
                    timestamp: '2026-01-01T00:00:01.000Z'
                })
            })
        );

        const { pullRemoteUpdates } = await import('./sync');
        await pullRemoteUpdates();

        const product = await db.products.get(productId);
        expect(product?.stock).toBe(10);

        const storedOp = await db.operations.get('remote-op-1');
        expect(storedOp?.synced).toBe(1);
    });
});

describe('pushLocalOperations', () => {
    beforeEach(async () => {
        await db.products.clear();
        await db.operations.clear();
    });

    it('marks server-rejected operations as rejected (synced: -1) instead of leaving them pending forever', async () => {
        await db.operations.add({
            id: 'bad-op',
            productId: 1,
            quantityChange: 5,
            timestamp: '2026-01-01T00:00:00.000Z',
            synced: 0,
            reason: 'sale'
        });

        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    success: true,
                    processedIds: [],
                    rejected: [{ id: 'bad-op', error: 'productId must reference an existing product' }]
                })
            })
        );

        const { pushLocalOperations } = await import('./sync');
        await pushLocalOperations();

        const op = await db.operations.get('bad-op');
        expect(op?.synced).toBe(-1);

        // A rejected op must not be picked up by the next sync's pending query.
        const stillPending = await db.operations.where('synced').equals(0).toArray();
        expect(stillPending).toHaveLength(0);
    });
});

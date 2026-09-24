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

    it('resolves a remote movement to this device local product via productUuid and rebuilds its stock', async () => {
        const productId = await db.products.add({
            uuid: 'shared-uuid-1',
            name: 'Widget',
            price: 1000,
            stock: 0,
            archived: false
        });

        // A remote device recorded a restock this device has never seen. The
        // wire payload carries the canonical uuid, not the remote device's
        // own (meaningless here) local numeric id.
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    newOperations: [
                        {
                            id: 'remote-op-1',
                            productUuid: 'shared-uuid-1',
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
        expect(storedOp?.productId).toBe(productId);
        expect(storedOp?.productUuid).toBe('shared-uuid-1');
    });

    it('skips a remote movement whose product does not exist locally rather than storing an unresolvable reference', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    newOperations: [
                        {
                            id: 'remote-op-unknown',
                            productUuid: 'never-synced-uuid',
                            quantityChange: 3,
                            timestamp: '2026-01-01T00:00:00.000Z',
                            reason: 'sale'
                        }
                    ],
                    timestamp: '2026-01-01T00:00:01.000Z'
                })
            })
        );

        const { pullRemoteUpdates } = await import('./sync');
        await pullRemoteUpdates();

        const storedOp = await db.operations.get('remote-op-unknown');
        expect(storedOp).toBeUndefined();
    });
});

describe('pushLocalOperations', () => {
    beforeEach(async () => {
        await db.products.clear();
        await db.operations.clear();
    });

    it('sends productUuid on the wire, never the device-local productId', async () => {
        await db.operations.add({
            id: 'op-1',
            productId: 42,
            productUuid: 'product-uuid-42',
            quantityChange: 5,
            timestamp: '2026-01-01T00:00:00.000Z',
            synced: 0,
            reason: 'sale'
        });

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, processedIds: ['op-1'], rejected: [] })
        });
        vi.stubGlobal('fetch', fetchMock);

        const { pushLocalOperations } = await import('./sync');
        await pushLocalOperations();

        const [, requestInit] = fetchMock.mock.calls[0];
        const sentBody = JSON.parse(requestInit.body as string);
        expect(sentBody.operations).toEqual([
            { id: 'op-1', productUuid: 'product-uuid-42', quantityChange: 5, timestamp: '2026-01-01T00:00:00.000Z', reason: 'sale' }
        ]);
    });

    it('marks server-rejected operations as rejected (synced: -1) instead of leaving them pending forever', async () => {
        await db.operations.add({
            id: 'bad-op',
            productId: 1,
            productUuid: 'product-uuid-1',
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

describe('recordStockOperation', () => {
    beforeEach(async () => {
        await db.products.clear();
        await db.operations.clear();
        vi.stubGlobal('navigator', { onLine: false });
    });

    it('stamps the movement with the product canonical uuid, not just its local id', async () => {
        const productId = (await db.products.add({
            uuid: 'product-uuid-99',
            name: 'Widget',
            price: 1000,
            stock: 5,
            archived: false
        })) as number;

        const { recordStockOperation } = await import('./sync');
        await recordStockOperation(productId, -2, 'sale');

        const ops = await db.operations.where('productId').equals(productId).toArray();
        expect(ops).toHaveLength(1);
        expect(ops[0].productUuid).toBe('product-uuid-99');
    });

    it('does nothing when the product does not exist locally', async () => {
        const { recordStockOperation } = await import('./sync');
        await recordStockOperation(9999, 1, 'restock');

        const ops = await db.operations.toArray();
        expect(ops).toHaveLength(0);
    });
});

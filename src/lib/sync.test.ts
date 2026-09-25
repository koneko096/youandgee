import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';

// Seeded logged-in by default — most sync behavior under test here is
// orthogonal to auth, and the dedicated auth-handling tests override this
// explicitly (an absent or cleared token, a 401 response).
function fakeLocalStorage(seed: Record<string, string> = { session_token: 'test-token' }) {
    const store = new Map<string, string>(Object.entries(seed));
    return {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
            store.set(key, value);
        },
        removeItem: (key: string) => {
            store.delete(key);
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
            archived: false,
            synced: 1,
            updatedAt: '2026-01-01T00:00:00.000Z'
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
        vi.stubGlobal('localStorage', fakeLocalStorage());
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
            archived: false,
            synced: 1,
            updatedAt: '2026-01-01T00:00:00.000Z'
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

describe('createOrder', () => {
    beforeEach(async () => {
        await db.orders.clear();
        vi.stubGlobal('navigator', { onLine: false });
    });

    it('creates an order stamped as pending sync', async () => {
        const { createOrder } = await import('./sync');
        const id = await createOrder({
            uuid: 'order-1',
            date: new Date('2026-01-01T00:00:00.000Z'),
            items: [{ name: 'Widget', price: 1000, quantity: 2 }],
            total: 2000,
            customerName: 'Ada Lovelace'
        });

        const order = await db.orders.get(id);
        expect(order).toMatchObject({ uuid: 'order-1', total: 2000, customerName: 'Ada Lovelace', synced: 0 });
    });
});

describe('createProduct / updateProductFields', () => {
    beforeEach(async () => {
        await db.products.clear();
        vi.stubGlobal('navigator', { onLine: false });
    });

    it('creates a product stamped as pending sync', async () => {
        const { createProduct } = await import('./sync');
        const id = await createProduct({ uuid: 'p-1', name: 'Widget', price: 1000, archived: false });

        const product = await db.products.get(id);
        expect(product).toMatchObject({ uuid: 'p-1', name: 'Widget', price: 1000, stock: 0, archived: false, synced: 0 });
        expect(Number.isNaN(Date.parse(product?.updatedAt ?? ''))).toBe(false);
    });

    it('marks an updated product pending sync again, even if it was already synced', async () => {
        const id = (await db.products.add({
            uuid: 'p-1',
            name: 'Widget',
            price: 1000,
            stock: 0,
            archived: false,
            synced: 1,
            updatedAt: '2020-01-01T00:00:00.000Z'
        })) as number;

        const { updateProductFields } = await import('./sync');
        await updateProductFields(id, { price: 2000 });

        const product = await db.products.get(id);
        expect(product?.price).toBe(2000);
        expect(product?.synced).toBe(0);
        expect(product?.updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
    });
});

describe('pushLocalProducts', () => {
    beforeEach(async () => {
        await db.products.clear();
        vi.stubGlobal('localStorage', fakeLocalStorage());
    });

    it('sends only wire-safe fields and marks processed products synced', async () => {
        const id = (await db.products.add({
            uuid: 'p-1',
            name: 'Widget',
            price: 1000,
            stock: 7,
            archived: false,
            synced: 0,
            updatedAt: '2026-01-01T00:00:00.000Z'
        })) as number;

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, processedUuids: ['p-1'], rejected: [] })
        });
        vi.stubGlobal('fetch', fetchMock);

        const { pushLocalProducts } = await import('./sync');
        await pushLocalProducts();

        const [, requestInit] = fetchMock.mock.calls[0];
        const sentBody = JSON.parse(requestInit.body as string);
        expect(sentBody.products).toEqual([
            { uuid: 'p-1', name: 'Widget', price: 1000, archived: false, updatedAt: '2026-01-01T00:00:00.000Z' }
        ]);

        const product = await db.products.get(id);
        expect(product?.synced).toBe(1);
    });

    it('marks server-rejected products rejected (synced: -1) rather than retrying forever', async () => {
        await db.products.add({
            uuid: 'bad',
            name: '',
            price: 1000,
            stock: 0,
            archived: false,
            synced: 0,
            updatedAt: '2026-01-01T00:00:00.000Z'
        });

        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ success: true, processedUuids: [], rejected: [{ uuid: 'bad', error: 'name must be a non-empty string' }] })
            })
        );

        const { pushLocalProducts } = await import('./sync');
        await pushLocalProducts();

        const product = await db.products.where('uuid').equals('bad').first();
        expect(product?.synced).toBe(-1);
    });

    it('sends the stored session token as a bearer header', async () => {
        await db.products.add({
            uuid: 'p-1',
            name: 'Widget',
            price: 1000,
            stock: 0,
            archived: false,
            synced: 0,
            updatedAt: '2026-01-01T00:00:00.000Z'
        });

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, processedUuids: ['p-1'], rejected: [] })
        });
        vi.stubGlobal('fetch', fetchMock);

        const { pushLocalProducts } = await import('./sync');
        await pushLocalProducts();

        const [, requestInit] = fetchMock.mock.calls[0];
        expect((requestInit.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
    });

    it('skips the request entirely and leaves work pending when not logged in', async () => {
        await db.products.add({
            uuid: 'p-1',
            name: 'Widget',
            price: 1000,
            stock: 0,
            archived: false,
            synced: 0,
            updatedAt: '2026-01-01T00:00:00.000Z'
        });

        vi.stubGlobal('localStorage', fakeLocalStorage({}));
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const { pushLocalProducts } = await import('./sync');
        await pushLocalProducts();

        expect(fetchMock).not.toHaveBeenCalled();
        const product = await db.products.where('uuid').equals('p-1').first();
        expect(product?.synced).toBe(0);
    });

    it('clears the stored session token when the server reports it as unauthorized', async () => {
        await db.products.add({
            uuid: 'p-1',
            name: 'Widget',
            price: 1000,
            stock: 0,
            archived: false,
            synced: 0,
            updatedAt: '2026-01-01T00:00:00.000Z'
        });

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) }));

        const { pushLocalProducts } = await import('./sync');
        await pushLocalProducts();

        expect(localStorage.getItem('session_token')).toBeNull();
    });
});

describe('pullRemoteProducts', () => {
    beforeEach(async () => {
        await db.products.clear();
        vi.stubGlobal('localStorage', fakeLocalStorage());
    });

    it('inserts a product this device has never seen, defaulting stock to zero (a rebuildable projection)', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    products: [{ uuid: 'remote-p-1', name: 'Remote Widget', price: 500, archived: false, updatedAt: '2026-01-01T00:00:00.000Z' }],
                    timestamp: '2026-01-01T00:00:01.000Z'
                })
            })
        );

        const { pullRemoteProducts } = await import('./sync');
        await pullRemoteProducts();

        const product = await db.products.where('uuid').equals('remote-p-1').first();
        expect(product).toMatchObject({ name: 'Remote Widget', price: 500, stock: 0, synced: 1 });
    });

    it('skips the request entirely when not logged in', async () => {
        vi.stubGlobal('localStorage', fakeLocalStorage({}));
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const { pullRemoteProducts } = await import('./sync');
        await pullRemoteProducts();

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('applies a remote update only when it is newer than the local one (last-write-wins)', async () => {
        await db.products.add({
            uuid: 'p-1',
            name: 'Local Name',
            price: 1000,
            stock: 3,
            archived: false,
            synced: 1,
            updatedAt: '2026-06-01T00:00:00.000Z'
        });

        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    products: [{ uuid: 'p-1', name: 'Stale Remote Name', price: 999, archived: false, updatedAt: '2026-01-01T00:00:00.000Z' }],
                    timestamp: '2026-06-02T00:00:00.000Z'
                })
            })
        );

        const { pullRemoteProducts } = await import('./sync');
        await pullRemoteProducts();

        const product = await db.products.where('uuid').equals('p-1').first();
        // Stale remote write must not clobber the newer local one, and stock
        // (never part of the sync payload) must be untouched either way.
        expect(product?.name).toBe('Local Name');
        expect(product?.stock).toBe(3);
    });
});

describe('pushLocalOrders', () => {
    beforeEach(async () => {
        await db.orders.clear();
        vi.stubGlobal('localStorage', fakeLocalStorage());
    });

    it('sends wire-safe fields with an ISO date string and marks processed orders synced', async () => {
        const id = (await db.orders.add({
            uuid: 'order-1',
            date: new Date('2026-01-01T00:00:00.000Z'),
            items: [{ name: 'Widget', price: 1000, quantity: 2 }],
            total: 2000,
            customerName: 'Ada Lovelace',
            synced: 0
        })) as number;

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, processedUuids: ['order-1'], rejected: [] })
        });
        vi.stubGlobal('fetch', fetchMock);

        const { pushLocalOrders } = await import('./sync');
        await pushLocalOrders();

        const [, requestInit] = fetchMock.mock.calls[0];
        const sentBody = JSON.parse(requestInit.body as string);
        expect(sentBody.orders).toEqual([
            {
                uuid: 'order-1',
                date: '2026-01-01T00:00:00.000Z',
                items: [{ name: 'Widget', price: 1000, quantity: 2 }],
                total: 2000,
                customerName: 'Ada Lovelace'
            }
        ]);

        const order = await db.orders.get(id);
        expect(order?.synced).toBe(1);
    });

    it('marks server-rejected orders rejected (synced: -1) rather than retrying forever', async () => {
        await db.orders.add({
            uuid: 'bad-order',
            date: new Date('2026-01-01T00:00:00.000Z'),
            items: [{ name: 'Widget', price: 1000, quantity: 2 }],
            total: 2000,
            customerName: 'Ada Lovelace',
            synced: 0
        });

        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ success: true, processedUuids: [], rejected: [{ uuid: 'bad-order', error: 'total does not match items' }] })
            })
        );

        const { pushLocalOrders } = await import('./sync');
        await pushLocalOrders();

        const order = await db.orders.where('uuid').equals('bad-order').first();
        expect(order?.synced).toBe(-1);
    });
});

describe('pullRemoteOrders', () => {
    beforeEach(async () => {
        await db.orders.clear();
        vi.stubGlobal('localStorage', fakeLocalStorage());
    });

    it('inserts an order from another device as already-synced, parsing the date back to a Date', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    orders: [
                        {
                            uuid: 'remote-order-1',
                            date: '2026-01-01T00:00:00.000Z',
                            items: [{ name: 'Widget', price: 1000, quantity: 1 }],
                            total: 1000,
                            customerName: 'Remote Customer'
                        }
                    ],
                    timestamp: '2026-01-01T00:00:01.000Z'
                })
            })
        );

        const { pullRemoteOrders } = await import('./sync');
        await pullRemoteOrders();

        const order = await db.orders.where('uuid').equals('remote-order-1').first();
        expect(order?.synced).toBe(1);
        expect(order?.date).toBeInstanceOf(Date);
        expect(order?.total).toBe(1000);
    });

    it('does not insert an order this device already has (orders are immutable, so no update is ever needed)', async () => {
        await db.orders.add({
            uuid: 'order-1',
            date: new Date('2026-01-01T00:00:00.000Z'),
            items: [{ name: 'Widget', price: 1000, quantity: 1 }],
            total: 1000,
            customerName: 'Local Customer',
            synced: 1
        });

        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    orders: [{ uuid: 'order-1', date: '2026-01-01T00:00:00.000Z', items: [], total: 1000, customerName: 'Should Not Apply' }],
                    timestamp: '2026-01-01T00:00:01.000Z'
                })
            })
        );

        const { pullRemoteOrders } = await import('./sync');
        await pullRemoteOrders();

        const orders = await db.orders.where('uuid').equals('order-1').toArray();
        expect(orders).toHaveLength(1);
        expect(orders[0].customerName).toBe('Local Customer');
    });
});

import { Dexie } from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';

const DB_NAME = 'HomePOS';

describe('canonical uuid migration (U2b)', () => {
    afterEach(async () => {
        await Dexie.delete(DB_NAME);
    });

    it('backfills a uuid for products and orders that predate canonical identity', async () => {
        // Simulate a legacy (pre-migration) local database at version 3.
        const legacy = new Dexie(DB_NAME);
        legacy.version(3).stores({
            products: '++id, name',
            operations: 'id, productId, timestamp, synced',
            orders: '++id, date'
        });
        await legacy.open();
        const productId = (await legacy.table('products').add({ name: 'Legacy Widget', price: 500, stock: 3 })) as number;
        const orderId = (await legacy.table('orders').add({
            date: new Date(),
            items: [{ name: 'Legacy Widget', price: 500, quantity: 1 }],
            total: 500,
            customerName: 'Legacy Customer'
        })) as number;
        legacy.close();

        // Re-import the app's database module fresh so its constructor (and
        // the version(4) upgrade it registers) runs against the legacy data.
        vi.resetModules();
        const { db } = await import('./db');

        const product = await db.products.get(productId);
        const order = await db.orders.get(orderId);

        expect(product?.uuid).toBeTruthy();
        expect(order?.uuid).toBeTruthy();

        await db.close();
    });
});

describe('integer minor-unit money migration (U2c)', () => {
    afterEach(async () => {
        await Dexie.delete(DB_NAME);
    });

    it('converts existing float major-unit prices and totals to integer minor units', async () => {
        // Simulate a pre-U2c local database (version 4) storing money as
        // float major units, the way the UI used to write it.
        const legacy = new Dexie(DB_NAME);
        legacy.version(4).stores({
            products: '++id, name, uuid',
            operations: 'id, productId, timestamp, synced',
            orders: '++id, date, uuid'
        });
        await legacy.open();
        const productId = (await legacy.table('products').add({
            uuid: 'p-1',
            name: 'Legacy Widget',
            price: 19.5,
            stock: 3
        })) as number;
        const orderId = (await legacy.table('orders').add({
            uuid: 'o-1',
            date: new Date(),
            items: [{ name: 'Legacy Widget', price: 19.5, quantity: 2 }],
            total: 39,
            customerName: 'Legacy Customer'
        })) as number;
        legacy.close();

        vi.resetModules();
        const { db } = await import('./db');

        const product = await db.products.get(productId);
        const order = await db.orders.get(orderId);

        expect(product?.price).toBe(1950);
        expect(order?.total).toBe(3900);
        expect(order?.items[0].price).toBe(1950);

        await db.close();
    });
});

describe('archived-product lifecycle migration (U2c)', () => {
    afterEach(async () => {
        await Dexie.delete(DB_NAME);
    });

    it('backfills archived: false for products that predate the archive flag', async () => {
        const legacy = new Dexie(DB_NAME);
        legacy.version(5).stores({
            products: '++id, name, uuid',
            operations: 'id, productId, timestamp, synced',
            orders: '++id, date, uuid'
        });
        await legacy.open();
        const productId = (await legacy.table('products').add({
            uuid: 'p-1',
            name: 'Legacy Widget',
            price: 1950,
            stock: 3
        })) as number;
        legacy.close();

        vi.resetModules();
        const { db } = await import('./db');

        const product = await db.products.get(productId);
        expect(product?.archived).toBe(false);

        await db.close();
    });
});

describe('stock-movement product uuid migration (U3 prep)', () => {
    afterEach(async () => {
        await Dexie.delete(DB_NAME);
    });

    it('backfills productUuid on existing stock movements from the referenced product', async () => {
        const legacy = new Dexie(DB_NAME);
        legacy.version(6).stores({
            products: '++id, name, uuid, archived',
            operations: 'id, productId, timestamp, synced',
            orders: '++id, date, uuid'
        });
        await legacy.open();
        const productId = (await legacy.table('products').add({
            uuid: 'product-uuid-1',
            name: 'Legacy Widget',
            price: 1950,
            stock: 5,
            archived: false
        })) as number;
        await legacy.table('operations').add({
            id: 'op-1',
            productId,
            quantityChange: 5,
            timestamp: '2026-01-01T00:00:00.000Z',
            synced: 1,
            reason: 'restock'
        });
        legacy.close();

        vi.resetModules();
        const { db } = await import('./db');

        const op = await db.operations.get('op-1');
        expect(op?.productUuid).toBe('product-uuid-1');

        await db.close();
    });

    it('leaves productUuid empty for a movement whose product no longer exists', async () => {
        const legacy = new Dexie(DB_NAME);
        legacy.version(6).stores({
            products: '++id, name, uuid, archived',
            operations: 'id, productId, timestamp, synced',
            orders: '++id, date, uuid'
        });
        await legacy.open();
        await legacy.table('operations').add({
            id: 'op-orphan',
            productId: 999,
            quantityChange: 1,
            timestamp: '2026-01-01T00:00:00.000Z',
            synced: 1,
            reason: 'adjustment'
        });
        legacy.close();

        vi.resetModules();
        const { db } = await import('./db');

        const op = await db.operations.get('op-orphan');
        expect(op?.productUuid).toBe('');

        await db.close();
    });
});

describe('product sync metadata migration (U3)', () => {
    afterEach(async () => {
        await Dexie.delete(DB_NAME);
    });

    it('backfills synced: 0 and a parseable updatedAt for products that predate sync metadata', async () => {
        const legacy = new Dexie(DB_NAME);
        legacy.version(7).stores({
            products: '++id, name, uuid, archived',
            operations: 'id, productId, productUuid, timestamp, synced',
            orders: '++id, date, uuid'
        });
        await legacy.open();
        const productId = (await legacy.table('products').add({
            uuid: 'product-uuid-1',
            name: 'Legacy Widget',
            price: 1950,
            stock: 5,
            archived: false
        })) as number;
        legacy.close();

        vi.resetModules();
        const { db } = await import('./db');

        const product = await db.products.get(productId);
        expect(product?.synced).toBe(0);
        expect(Number.isNaN(Date.parse(product?.updatedAt ?? ''))).toBe(false);

        await db.close();
    });
});

describe('order sync metadata migration (U3)', () => {
    afterEach(async () => {
        await Dexie.delete(DB_NAME);
    });

    it('backfills synced: 0 for orders that predate sync metadata', async () => {
        const legacy = new Dexie(DB_NAME);
        legacy.version(8).stores({
            products: '++id, name, uuid, archived, synced',
            operations: 'id, productId, productUuid, timestamp, synced',
            orders: '++id, date, uuid'
        });
        await legacy.open();
        const orderId = (await legacy.table('orders').add({
            uuid: 'order-uuid-1',
            date: new Date('2026-01-01T00:00:00.000Z'),
            items: [{ name: 'Widget', price: 1000, quantity: 2 }],
            total: 2000,
            customerName: 'Ada Lovelace'
        })) as number;
        legacy.close();

        vi.resetModules();
        const { db } = await import('./db');

        const order = await db.orders.get(orderId);
        expect(order?.synced).toBe(0);

        await db.close();
    });
});

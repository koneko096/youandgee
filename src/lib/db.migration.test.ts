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

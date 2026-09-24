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

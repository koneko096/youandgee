import { describe, expect, it, beforeEach } from 'vitest';
import { db } from './db';

describe('db (smoke)', () => {
    beforeEach(async () => {
        await db.products.clear();
        await db.orders.clear();
        await db.operations.clear();
    });

    it('opens the local Dexie database and round-trips a product', async () => {
        const id = await db.products.add({ name: 'Widget', price: 1000, stock: 5 });
        const product = await db.products.get(id);
        expect(product).toMatchObject({ name: 'Widget', price: 1000, stock: 5 });
    });
});

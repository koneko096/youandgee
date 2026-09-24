import { describe, expect, it, beforeEach } from 'vitest';
import { db } from './db';

describe('db (smoke)', () => {
    beforeEach(async () => {
        await db.products.clear();
        await db.orders.clear();
        await db.operations.clear();
    });

    it('opens the local Dexie database and round-trips a product', async () => {
        const uuid = 'e2c1f1c0-0000-4000-8000-000000000000';
        const id = await db.products.add({
            uuid,
            name: 'Widget',
            price: 1000,
            stock: 5,
            archived: false,
            synced: 0,
            updatedAt: '2026-01-01T00:00:00.000Z'
        });
        const product = await db.products.get(id);
        expect(product).toMatchObject({ uuid, name: 'Widget', price: 1000, stock: 5, archived: false });
    });
});

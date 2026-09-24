import { Dexie, type EntityTable } from 'dexie';
import { generateId } from './domain/id';
import { toMinorUnits } from './domain/money';

interface Product {
    id?: number; // Auto-incremented local key
    uuid: string; // Canonical cross-device identity (KTD1)
    name: string;
    price: number; // Integer minor units (KTD3) — see src/lib/domain/money.ts
    stock: number; // Current stock (read-only from ledger summary)
    archived: boolean; // Archived products are hidden from sale but never deleted, preserving historical orders and stock movements that reference them (R5)
}

interface StockOperation {
    id?: string;              // Client-generated UUID
    productId: number;        // Reference to product
    quantityChange: number;   // e.g., +50 (restock), -2 (sale)
    timestamp: string;        // ISO String
    synced: number;           // 0 = false, 1 = true
    reason?: 'sale' | 'restock' | 'adjustment' | 'return'; // Optional metadata
}

interface Order {
    id?: number;
    uuid: string; // Canonical cross-device identity (KTD1)
    date: Date;
    items: { name: string; price: number; quantity: number }[]; // price: integer minor units (KTD3)
    total: number; // Integer minor units (KTD3)
    customerName: string;
}

// Subclass Dexie for better type support
class MyDatabase extends Dexie {
    products!: EntityTable<Product, 'id'>;
    orders!: EntityTable<Order, 'id'>;
    operations!: EntityTable<StockOperation, 'id'>;

    constructor() {
        super('HomePOS');

        // Version 1: Initial schema
        this.version(1).stores({
            products: '++id, name',
            operations: '++id, productId, timestamp, synced',
            orders: '++id, date'
        });

        // Version 2: Add customerName to orders
        this.version(2).stores({
            products: '++id, name',
            orders: '++id, date'
        }).upgrade(async (tx) => {
            // Backfill existing orders with "Test" as customer name
            const orders = await tx.table('orders').toArray();
            for (const order of orders) {
                if (!order.customerName) {
                    await tx.table('orders').update(order.id, { customerName: 'Test' });
                }
            }
        });

        // Version 3: Event sourcing ledger - operations table with id as string (UUID)
        this.version(3).stores({
            products: '++id, name',
            operations: 'id, productId, timestamp, synced',
            orders: '++id, date'
        }).upgrade(async (tx) => {
            // Migration: Keep existing operations but change id to string for new ones
            // Existing numeric IDs will be converted to strings
            const ops = await tx.table('operations').toArray();
            for (const op of ops) {
                if (typeof op.id === 'number') {
                    await tx.table('operations').delete(op.id);
                    await tx.table('operations').add({
                        ...op,
                        id: op.id.toString()
                    });
                }
            }
        });

        // Version 4: canonical UUID identity for products and orders (KTD1).
        // Stock operations already carry a UUID id; this backfills the same
        // cross-device identity onto the two entities that still relied on
        // Dexie's device-local auto-increment key.
        this.version(4).stores({
            products: '++id, name, uuid',
            operations: 'id, productId, timestamp, synced',
            orders: '++id, date, uuid'
        }).upgrade(async (tx) => {
            const products = await tx.table('products').toArray();
            for (const product of products) {
                if (!product.uuid) {
                    await tx.table('products').update(product.id, { uuid: generateId() });
                }
            }

            const orders = await tx.table('orders').toArray();
            for (const order of orders) {
                if (!order.uuid) {
                    await tx.table('orders').update(order.id, { uuid: generateId() });
                }
            }
        });

        // Version 5: store money as integer minor units instead of float
        // major units (KTD3) — floating-point totals cannot be the authority
        // for historical receipts and exports.
        this.version(5).stores({
            products: '++id, name, uuid',
            operations: 'id, productId, timestamp, synced',
            orders: '++id, date, uuid'
        }).upgrade(async (tx) => {
            const products = await tx.table('products').toArray();
            for (const product of products) {
                await tx.table('products').update(product.id, { price: toMinorUnits(product.price) });
            }

            const orders = await tx.table('orders').toArray();
            for (const order of orders) {
                await tx.table('orders').update(order.id, {
                    total: toMinorUnits(order.total),
                    items: order.items.map((item: { name: string; price: number; quantity: number }) => ({
                        ...item,
                        price: toMinorUnits(item.price)
                    }))
                });
            }
        });

        // Version 6: archived-product lifecycle (R5). Deleting a product row
        // would orphan the stock movements and (pre-U2b) references that
        // still point at it; archiving hides it from sale while keeping
        // history intact.
        this.version(6).stores({
            products: '++id, name, uuid, archived',
            operations: 'id, productId, timestamp, synced',
            orders: '++id, date, uuid'
        }).upgrade(async (tx) => {
            const products = await tx.table('products').toArray();
            for (const product of products) {
                if (product.archived === undefined) {
                    await tx.table('products').update(product.id, { archived: false });
                }
            }
        });
    }
}

const db = new MyDatabase();

export { db, type Product, type Order, type StockOperation };
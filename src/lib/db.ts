import { Dexie, type EntityTable } from 'dexie';

interface Product {
    id?: number; // Auto-incremented
    name: string;
    price: number;
    stock: number; // Current stock (read-only from ledger summary)
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
    date: Date;
    items: { name: string; price: number; quantity: number }[];
    total: number;
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
    }
}

const db = new MyDatabase();

export { db, type Product, type Order, type StockOperation };
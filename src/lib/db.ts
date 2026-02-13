import { Dexie, type EntityTable } from 'dexie';

interface Product {
    id?: number; // Auto-incremented
    name: string;
    price: number;
    stock: number;
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

    constructor() {
        super('HomePOS');

        // Version 1: Initial schema
        this.version(1).stores({
            products: '++id, name',
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
    }
}

const db = new MyDatabase();

export { db, type Product, type Order };
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
}

// Subclass Dexie for better type support
class MyDatabase extends Dexie {
    products!: EntityTable<Product, 'id'>;
    orders!: EntityTable<Order, 'id'>;

    constructor() {
        super('HomePOS');
        this.version(1).stores({
            products: '++id, name', // Primary key and index
            orders: '++id, date'
        });
    }
}

const db = new MyDatabase();

export { db, type Product, type Order };
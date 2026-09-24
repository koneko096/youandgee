import { validateIncomingProduct, type IncomingProduct } from './validation';

/**
 * Product sync business logic (U3): products are their own syncable record,
 * separate from stock movements. Deliberately excludes stock — that stays a
 * rebuildable projection over stock_ledger, never a second authority a
 * product row could disagree with.
 */

export interface D1LikeStatement {
    bind(...values: unknown[]): D1LikeStatement;
    all<T = unknown>(): Promise<{ results?: T[] }>;
    first<T = unknown>(): Promise<T | null>;
}

export interface D1Like {
    prepare(sql: string): D1LikeStatement;
    batch(statements: D1LikeStatement[]): Promise<unknown[]>;
}

export interface RejectedProduct {
    uuid: string | undefined;
    error: string;
}

export async function pushProducts(db: D1Like, rawProducts: unknown[]) {
    const products: IncomingProduct[] = [];
    const rejected: RejectedProduct[] = [];

    for (const raw of rawProducts) {
        const result = validateIncomingProduct(raw);
        if (result.ok) {
            products.push(result.value);
        } else {
            const uuid = typeof raw === 'object' && raw !== null && typeof (raw as Record<string, unknown>).uuid === 'string'
                ? ((raw as Record<string, unknown>).uuid as string)
                : undefined;
            rejected.push({ uuid, error: result.error });
        }
    }

    if (!products.length) {
        return { success: true as const, processedUuids: [] as string[], rejected };
    }

    // Last-write-wins (KTD7): an incoming row only overwrites the stored one
    // when it is strictly newer, so a stale push from a device that has been
    // offline a while cannot clobber a more recent edit from elsewhere.
    const statements = products.map((p) =>
        db
            .prepare(
                `INSERT INTO products (uuid, name, price, archived, updated_at)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(uuid) DO UPDATE SET
                     name = excluded.name,
                     price = excluded.price,
                     archived = excluded.archived,
                     updated_at = excluded.updated_at
                 WHERE products.updated_at < excluded.updated_at`
            )
            .bind(p.uuid, p.name, p.price, p.archived ? 1 : 0, p.updatedAt)
    );
    await db.batch(statements);

    return { success: true as const, processedUuids: products.map((p) => p.uuid), rejected };
}

export async function pullProducts(db: D1Like, since: string) {
    const result = await db
        .prepare(
            `SELECT uuid, name, price, archived, updated_at as updatedAt
             FROM products
             WHERE updated_at > ?
             ORDER BY updated_at ASC`
        )
        .bind(since)
        .all();

    return {
        products: result.results ?? [],
        timestamp: new Date().toISOString()
    };
}

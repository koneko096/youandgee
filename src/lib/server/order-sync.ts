import { validateIncomingOrder, type IncomingOrder } from './validation';

/**
 * Order sync business logic (U3). Orders are immutable once created (R3),
 * so unlike products this is append-only: push is an insert that silently
 * no-ops on an id it has already seen (idempotent under retry, AE2), never
 * an update.
 */

export interface D1LikeStatement {
    bind(...values: unknown[]): D1LikeStatement;
    all<T = unknown>(): Promise<{ results?: T[] }>;
}

export interface D1Like {
    prepare(sql: string): D1LikeStatement;
    batch(statements: D1LikeStatement[]): Promise<unknown[]>;
}

export interface RejectedOrder {
    uuid: string | undefined;
    error: string;
}

export async function pushOrders(db: D1Like, rawOrders: unknown[]) {
    const orders: IncomingOrder[] = [];
    const rejected: RejectedOrder[] = [];

    for (const raw of rawOrders) {
        const result = validateIncomingOrder(raw);
        if (result.ok) {
            orders.push(result.value);
        } else {
            const uuid = typeof raw === 'object' && raw !== null && typeof (raw as Record<string, unknown>).uuid === 'string'
                ? ((raw as Record<string, unknown>).uuid as string)
                : undefined;
            rejected.push({ uuid, error: result.error });
        }
    }

    if (!orders.length) {
        return { success: true as const, processedUuids: [] as string[], rejected };
    }

    const statements = orders.map((o) =>
        db
            .prepare(
                `INSERT INTO orders (uuid, date, customer_name, total, items)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(uuid) DO NOTHING`
            )
            .bind(o.uuid, o.date, o.customerName ?? null, o.total, JSON.stringify(o.items))
    );
    await db.batch(statements);

    return { success: true as const, processedUuids: orders.map((o) => o.uuid), rejected };
}

export async function pullOrders(db: D1Like, since: string) {
    const result = await db
        .prepare(
            `SELECT uuid, date, customer_name as customerName, total, items
             FROM orders
             WHERE created_at > ?
             ORDER BY created_at ASC`
        )
        .bind(since)
        .all<{ uuid: string; date: string; customerName: string | null; total: number; items: string }>();

    const orders = (result.results ?? []).map((row) => ({
        ...row,
        items: JSON.parse(row.items)
    }));

    return {
        orders,
        timestamp: new Date().toISOString()
    };
}

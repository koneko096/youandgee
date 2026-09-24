import { validateIncomingOperation } from './validation';

/**
 * Sync ledger business logic, shared by every place that serves it (currently
 * the Cloudflare Pages Functions in `functions/api/`). Kept independent of any
 * specific runtime binding shape so it can be unit tested with a plain fake.
 */

export interface D1LikeStatement {
    bind(...values: unknown[]): D1LikeStatement;
    all<T = unknown>(): Promise<{ results?: T[] }>;
}

export interface D1Like {
    prepare(sql: string): D1LikeStatement;
    batch(statements: D1LikeStatement[]): Promise<unknown[]>;
}

export interface IncomingStockOperation {
    id: string;
    productUuid: string;
    quantityChange: number;
    timestamp: string;
    reason?: 'sale' | 'restock' | 'adjustment' | 'return';
}

export interface RejectedOperation {
    id: string | undefined;
    error: string;
}

export async function pushStockOperations(db: D1Like, rawOperations: unknown[]) {
    const operations: IncomingStockOperation[] = [];
    const rejected: RejectedOperation[] = [];

    for (const raw of rawOperations) {
        const result = validateIncomingOperation(raw);
        if (result.ok) {
            operations.push(result.value);
        } else {
            const id = typeof raw === 'object' && raw !== null && typeof (raw as Record<string, unknown>).id === 'string'
                ? ((raw as Record<string, unknown>).id as string)
                : undefined;
            rejected.push({ id, error: result.error });
        }
    }

    if (!operations.length) {
        return { success: true as const, processedIds: [] as string[], rejected };
    }

    const ledgerStatements = operations.map((op) =>
        db
            .prepare(
                `INSERT INTO stock_ledger (id, product_uuid, quantity_change, created_at, reason)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO NOTHING`
            )
            .bind(op.id, op.productUuid, op.quantityChange, op.timestamp, op.reason ?? 'adjustment')
    );
    await db.batch(ledgerStatements);

    const updatedAt = new Date().toISOString();
    const summaryStatements = operations.map((op) =>
        db
            .prepare(
                `INSERT INTO product_stock_summary (product_uuid, current_stock, updated_at)
                 VALUES (?, ?, ?)
                 ON CONFLICT(product_uuid) DO UPDATE SET
                     current_stock = current_stock + excluded.current_stock,
                     updated_at = excluded.updated_at`
            )
            .bind(op.productUuid, op.quantityChange, updatedAt)
    );
    await db.batch(summaryStatements);

    return { success: true as const, processedIds: operations.map((op) => op.id), rejected };
}

export async function pullStockOperations(db: D1Like, since: string) {
    const result = await db
        .prepare(
            `SELECT id, product_uuid as productUuid, quantity_change as quantityChange, created_at as timestamp, reason
             FROM stock_ledger
             WHERE created_at > ?
             ORDER BY created_at ASC`
        )
        .bind(since)
        .all();

    return {
        newOperations: result.results ?? [],
        timestamp: new Date().toISOString()
    };
}

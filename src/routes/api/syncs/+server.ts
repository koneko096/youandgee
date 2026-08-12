import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, platform }) => {
    const { operations } = await request.json(); // Array of unsynced operations from Device 1
    const db = platform?.env?.DB; // Cloudflare D1 binding

    if (!operations.length) {
        return new Response(JSON.stringify({ success: true, processedIds: [] }), { status: 200 });
    }

    try {
        // Prepare batched D1 inserts (Transactional)
        const statements = operations.map((op: any) =>
            db.prepare(`
                INSERT INTO stock_ledger (id, product_id, quantity_change, created_at, reason)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO NOTHING
            `).bind(op.id, op.productId, op.quantityChange, op.timestamp, op.reason || 'adjustment')
        );

        // Execute batch transaction atomically in D1
        await db.batch(statements);

        // Also update the materialized summary table for fast O(1) stock lookups
        const summaryStatements = operations.map((op: any) =>
            db.prepare(`
                INSERT INTO product_stock_summary (product_id, current_stock)
                VALUES (?, ?)
                ON CONFLICT(product_id) DO UPDATE SET
                    current_stock = current_stock + excluded.current_stock
            `).bind(op.productId, op.quantityChange)
        );

        await db.batch(summaryStatements);

        // Return successfully applied IDs back to the client
        const processedIds = operations.map((op: any) => op.id);
        return new Response(JSON.stringify({ success: true, processedIds }), { status: 200 });
    } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
    }
};
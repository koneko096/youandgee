import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, platform }) => {
    const db = platform?.env?.DB; // Cloudflare D1 binding
    const since = url.searchParams.get('since') || '1970-01-01T00:00:00.000Z';

    try {
        // Fetch new operations from D1 created by other devices since last sync
        const result = await db.prepare(`
            SELECT id, product_id as productId, quantity_change as quantityChange, created_at as timestamp, reason
            FROM stock_ledger
            WHERE created_at > ?
            ORDER BY created_at ASC
        `).bind(since).all();

        const newOperations = result.results || [];
        const timestamp = new Date().toISOString();

        return new Response(JSON.stringify({ newOperations, timestamp }), { status: 200 });
    } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
    }
};
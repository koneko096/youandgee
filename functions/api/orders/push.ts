import { pushOrders } from '../../../src/lib/server/order-sync';

interface Env {
    DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: 'request body must be valid JSON' }), { status: 400 });
    }

    const orders = (body as { orders?: unknown })?.orders;
    if (!Array.isArray(orders)) {
        return new Response(JSON.stringify({ error: 'orders must be an array' }), { status: 400 });
    }

    try {
        const result = await pushOrders(env.DB, orders);
        return new Response(JSON.stringify(result), { status: 200 });
    } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
    }
};

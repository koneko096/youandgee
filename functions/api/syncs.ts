import { pushStockOperations } from '../../src/lib/server/sync-handlers';

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

    const operations = (body as { operations?: unknown })?.operations;
    if (!Array.isArray(operations)) {
        return new Response(JSON.stringify({ error: 'operations must be an array' }), { status: 400 });
    }

    try {
        const result = await pushStockOperations(env.DB, operations);
        return new Response(JSON.stringify(result), { status: 200 });
    } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
    }
};

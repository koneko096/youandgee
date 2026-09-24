import { pushStockOperations, type IncomingStockOperation } from '../../src/lib/server/sync-handlers';

interface Env {
    DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    const { operations } = (await request.json()) as { operations: IncomingStockOperation[] };

    try {
        const result = await pushStockOperations(env.DB, operations);
        return new Response(JSON.stringify(result), { status: 200 });
    } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
    }
};

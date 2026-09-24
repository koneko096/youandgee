import { pullProducts } from '../../../src/lib/server/product-sync';

interface Env {
    DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
    const since = new URL(request.url).searchParams.get('since') || '1970-01-01T00:00:00.000Z';

    try {
        const result = await pullProducts(env.DB, since);
        return new Response(JSON.stringify(result), { status: 200 });
    } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
    }
};

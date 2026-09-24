import { pushProducts } from '../../../src/lib/server/product-sync';

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

    const products = (body as { products?: unknown })?.products;
    if (!Array.isArray(products)) {
        return new Response(JSON.stringify({ error: 'products must be an array' }), { status: 400 });
    }

    try {
        const result = await pushProducts(env.DB, products);
        return new Response(JSON.stringify(result), { status: 200 });
    } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
    }
};

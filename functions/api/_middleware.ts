import { extractBearerToken, verifySessionToken } from '../../src/lib/server/auth';

interface Env {
    SESSION_SECRET: string;
}

// Every /api/* route requires a valid session token except login itself —
// everything else (products/orders/stock-movement push+pull) is otherwise
// wide open to anyone who finds the URL.
const PUBLIC_PATHS = new Set(['/api/auth/login']);

export const onRequest: PagesFunction<Env> = async (context) => {
    const url = new URL(context.request.url);
    if (PUBLIC_PATHS.has(url.pathname)) {
        return context.next();
    }

    const token = extractBearerToken(context.request);
    if (!token || !(await verifySessionToken(token, context.env.SESSION_SECRET))) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
    }

    return context.next();
};

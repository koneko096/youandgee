import { handleLogin } from '../../../src/lib/server/login-handler';

interface Env {
    DB: D1Database;
    SESSION_SECRET: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: 'request body must be valid JSON' }), { status: 400 });
    }

    const { username, password } = (body as { username?: unknown; password?: unknown }) ?? {};
    const result = await handleLogin(env.DB, env.SESSION_SECRET, username, password);

    if (!result.ok) {
        return new Response(JSON.stringify({ error: result.error }), { status: 401 });
    }

    return new Response(JSON.stringify({ token: result.token }), { status: 200 });
};

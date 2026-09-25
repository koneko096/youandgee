import { createSessionToken, verifyPassword } from './auth';

export interface D1LikeStatement {
    bind(...values: unknown[]): D1LikeStatement;
    first<T = unknown>(): Promise<T | null>;
}

export interface D1Like {
    prepare(sql: string): D1LikeStatement;
}

export type LoginResult = { ok: true; token: string } | { ok: false; error: string };

const GENERIC_ERROR = 'invalid credentials';

export async function handleLogin(db: D1Like, sessionSecret: string, username: unknown, password: unknown): Promise<LoginResult> {
    if (typeof username !== 'string' || username.length === 0 || typeof password !== 'string' || password.length === 0) {
        return { ok: false, error: GENERIC_ERROR };
    }

    const row = await db
        .prepare('SELECT username, password_salt, password_hash FROM credentials WHERE username = ?')
        .bind(username)
        .first<{ username: string; password_salt: string; password_hash: string }>();

    // Same generic error whether the username doesn't exist or the password
    // is wrong — never confirm which one to an unauthenticated caller.
    if (!row || !(await verifyPassword(password, row.password_salt, row.password_hash))) {
        return { ok: false, error: GENERIC_ERROR };
    }

    const token = await createSessionToken(sessionSecret);
    return { ok: true, token };
}

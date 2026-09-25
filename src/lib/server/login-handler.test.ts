import { describe, expect, it, vi } from 'vitest';
import { hashPassword } from './auth';
import { handleLogin, type D1Like } from './login-handler';

function fakeDb(row: unknown): D1Like {
    return {
        prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue(row)
        })
    };
}

describe('handleLogin', () => {
    it('returns a token for a matching username/password', async () => {
        const { salt, hash } = await hashPassword('correct horse battery staple');
        const db = fakeDb({ username: 'operator', password_salt: salt, password_hash: hash });

        const result = await handleLogin(db, 'session-secret', 'operator', 'correct horse battery staple');

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(typeof result.token).toBe('string');
            expect(result.token.split('.')).toHaveLength(2);
        }
    });

    it('rejects an unknown username without revealing whether the username exists', async () => {
        const db = fakeDb(null);
        const result = await handleLogin(db, 'session-secret', 'nobody', 'whatever');
        expect(result).toEqual({ ok: false, error: 'invalid credentials' });
    });

    it('rejects a wrong password with the same generic error as an unknown username', async () => {
        const { salt, hash } = await hashPassword('correct horse battery staple');
        const db = fakeDb({ username: 'operator', password_salt: salt, password_hash: hash });

        const result = await handleLogin(db, 'session-secret', 'operator', 'wrong password');
        expect(result).toEqual({ ok: false, error: 'invalid credentials' });
    });

    it('rejects a missing or non-string username/password', async () => {
        const db = fakeDb(null);
        expect(await handleLogin(db, 'session-secret', '', 'password')).toEqual({ ok: false, error: 'invalid credentials' });
        expect(await handleLogin(db, 'session-secret', 'operator', '')).toEqual({ ok: false, error: 'invalid credentials' });
    });
});

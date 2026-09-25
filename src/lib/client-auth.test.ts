import { beforeEach, describe, expect, it, vi } from 'vitest';

function fakeLocalStorage() {
    const store = new Map<string, string>();
    return {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
            store.set(key, value);
        },
        removeItem: (key: string) => {
            store.delete(key);
        }
    };
}

describe('client-auth', () => {
    beforeEach(() => {
        vi.stubGlobal('localStorage', fakeLocalStorage());
    });

    it('has no token and reports logged out before any login', async () => {
        const { getAuthToken, isLoggedIn } = await import('./client-auth');
        expect(getAuthToken()).toBeNull();
        expect(isLoggedIn()).toBe(false);
    });

    it('stores the token and reports logged in after a successful login', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: 'session-token-abc' }) })
        );

        const { login, getAuthToken, isLoggedIn } = await import('./client-auth');
        const result = await login('operator', 'correct horse battery staple');

        expect(result).toEqual({ ok: true });
        expect(getAuthToken()).toBe('session-token-abc');
        expect(isLoggedIn()).toBe(true);
    });

    it('does not store a token and reports the server error on failed login', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'invalid credentials' }) })
        );

        const { login, getAuthToken } = await import('./client-auth');
        const result = await login('operator', 'wrong password');

        expect(result).toEqual({ ok: false, error: 'invalid credentials' });
        expect(getAuthToken()).toBeNull();
    });

    it('reports a generic error when the login request itself fails (offline)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

        const { login } = await import('./client-auth');
        const result = await login('operator', 'password');

        expect(result.ok).toBe(false);
    });

    it('clears the token on logout', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: 'session-token-abc' }) })
        );

        const { login, logout, getAuthToken, isLoggedIn } = await import('./client-auth');
        await login('operator', 'password');
        logout();

        expect(getAuthToken()).toBeNull();
        expect(isLoggedIn()).toBe(false);
    });
});

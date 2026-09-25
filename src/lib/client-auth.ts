// Session token storage and login for the single operator credential.
// Local POS operation (cart, checkout, stock edits) never needs this — only
// the network sync calls in sync.ts do, so being logged out never blocks
// offline use.

const TOKEN_KEY = 'session_token';

export function getAuthToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function isLoggedIn(): boolean {
    return getAuthToken() !== null;
}

export function logout(): void {
    localStorage.removeItem(TOKEN_KEY);
}

export async function login(username: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const body = await response.json();

        if (!response.ok || !body.token) {
            return { ok: false, error: body.error || 'Login failed' };
        }

        localStorage.setItem(TOKEN_KEY, body.token);
        return { ok: true };
    } catch {
        return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
    }
}

import { describe, expect, it } from 'vitest';
import { createSessionToken, extractBearerToken, hashPassword, verifyPassword, verifySessionToken } from './auth';

describe('hashPassword / verifyPassword', () => {
    it('verifies the correct password against its own hash', async () => {
        const { salt, hash } = await hashPassword('correct horse battery staple');
        expect(await verifyPassword('correct horse battery staple', salt, hash)).toBe(true);
    });

    it('rejects an incorrect password', async () => {
        const { salt, hash } = await hashPassword('correct horse battery staple');
        expect(await verifyPassword('wrong password', salt, hash)).toBe(false);
    });

    it('produces a different salt (and hash) on every call, even for the same password', async () => {
        const a = await hashPassword('same password');
        const b = await hashPassword('same password');
        expect(a.salt).not.toBe(b.salt);
        expect(a.hash).not.toBe(b.hash);
    });

    it('never stores the plaintext password in the output', async () => {
        const { salt, hash } = await hashPassword('correct horse battery staple');
        expect(salt).not.toContain('correct horse battery staple');
        expect(hash).not.toContain('correct horse battery staple');
    });
});

describe('createSessionToken / verifySessionToken', () => {
    it('verifies a freshly created token against the same secret', async () => {
        const token = await createSessionToken('server-secret');
        expect(await verifySessionToken(token, 'server-secret')).toBe(true);
    });

    it('rejects a token signed with a different secret', async () => {
        const token = await createSessionToken('server-secret');
        expect(await verifySessionToken(token, 'wrong-secret')).toBe(false);
    });

    it('rejects a tampered payload even if the signature portion is untouched', async () => {
        const token = await createSessionToken('server-secret');
        const [, sig] = token.split('.');
        const tampered = `${btoa(JSON.stringify({ exp: 9_999_999_999 }))}.${sig}`;
        expect(await verifySessionToken(tampered, 'server-secret')).toBe(false);
    });

    it('rejects a garbage or empty token', async () => {
        expect(await verifySessionToken('not-a-token', 'server-secret')).toBe(false);
        expect(await verifySessionToken('', 'server-secret')).toBe(false);
    });

    it('rejects an expired token', async () => {
        const token = await createSessionToken('server-secret', -1);
        expect(await verifySessionToken(token, 'server-secret')).toBe(false);
    });
});

describe('extractBearerToken', () => {
    it('extracts the token from a well-formed Authorization header', () => {
        const request = new Request('https://example.com', { headers: { Authorization: 'Bearer abc.def' } });
        expect(extractBearerToken(request)).toBe('abc.def');
    });

    it('returns null when there is no Authorization header', () => {
        const request = new Request('https://example.com');
        expect(extractBearerToken(request)).toBeNull();
    });

    it('returns null for a header that is not a Bearer token', () => {
        const request = new Request('https://example.com', { headers: { Authorization: 'Basic abc123' } });
        expect(extractBearerToken(request)).toBeNull();
    });
});

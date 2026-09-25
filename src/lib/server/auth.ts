/**
 * Password hashing and session tokens for the single operator credential.
 * Uses only Web Crypto (available natively in both the Workers runtime and
 * modern Node) so this has no dependency, and the exact same code path
 * produces/verifies hashes whether it runs in a Pages Function or in the
 * local `scripts/generate-credential-sql.mjs` used to seed the row.
 */

const PBKDF2_ITERATIONS = 100_000;
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function toBase64(bytes: Uint8Array | ArrayBuffer): string {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let binary = '';
    for (const byte of arr) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function derivePbkdf2(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
        'deriveBits'
    ]);
    return crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        keyMaterial,
        256
    );
}

export async function hashPassword(password: string): Promise<{ salt: string; hash: string }> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const derived = await derivePbkdf2(password, salt);
    return { salt: toBase64(salt), hash: toBase64(derived) };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
    const derived = await derivePbkdf2(password, fromBase64(salt));
    return toBase64(derived) === expectedHash;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
        'sign',
        'verify'
    ]);
}

export async function createSessionToken(secret: string, ttlSeconds = DEFAULT_SESSION_TTL_SECONDS): Promise<string> {
    const payload = JSON.stringify({ exp: Math.floor(Date.now() / 1000) + ttlSeconds });
    const payloadB64 = toBase64(new TextEncoder().encode(payload));
    const key = await hmacKey(secret);
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
    return `${payloadB64}.${toBase64(signature)}`;
}

export async function verifySessionToken(token: string, secret: string): Promise<boolean> {
    const [payloadB64, sigB64] = token.split('.');
    if (!payloadB64 || !sigB64) return false;

    let signatureBytes: Uint8Array;
    try {
        signatureBytes = fromBase64(sigB64);
    } catch {
        return false;
    }

    const key = await hmacKey(secret);
    const validSignature = await crypto.subtle.verify(
        'HMAC',
        key,
        signatureBytes as BufferSource,
        new TextEncoder().encode(payloadB64)
    );
    if (!validSignature) return false;

    try {
        const payload = JSON.parse(new TextDecoder().decode(fromBase64(payloadB64)));
        return typeof payload.exp === 'number' && payload.exp > Math.floor(Date.now() / 1000);
    } catch {
        return false;
    }
}

export function extractBearerToken(request: Request): string | null {
    const header = request.headers.get('Authorization');
    if (!header?.startsWith('Bearer ')) return null;
    const token = header.slice('Bearer '.length).trim();
    return token.length > 0 ? token : null;
}

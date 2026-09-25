#!/usr/bin/env node
// Prints the INSERT statement for the `credentials` table (migration
// 0005), hashed with the exact same PBKDF2 parameters as
// src/lib/server/auth.ts#hashPassword — that file has no build step of its
// own, so this is a plain-JS reimplementation, not an import. If you ever
// change the algorithm/iteration count there, change it here too.
//
// Usage: node scripts/generate-credential-sql.mjs <username> <password>
// Prints SQL to run yourself:
//   npx wrangler d1 execute youandgee-db --remote --command "<printed SQL>"
//
// The password appears in your shell history this way. If that matters to
// you, prefix the command with a space — most shells (bash with
// HISTCONTROL=ignorespace, zsh with HIST_IGNORE_SPACE) skip history for a
// space-prefixed command — or clear the relevant history entry afterward.

const PBKDF2_ITERATIONS = 100_000;

function toBase64(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return Buffer.from(binary, 'binary').toString('base64');
}

async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
        'deriveBits'
    ]);
    const derived = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        keyMaterial,
        256
    );
    return { salt: toBase64(salt), hash: toBase64(new Uint8Array(derived)) };
}

const [username, password] = process.argv.slice(2);

if (!username || !password) {
    console.error('Usage: node scripts/generate-credential-sql.mjs <username> <password>');
    process.exit(1);
}

const { salt, hash } = await hashPassword(password);
const escapedUsername = username.replace(/'/g, "''");

console.log('\nRun this yourself against production (never pasted/committed anywhere):\n');
console.log(
    `npx wrangler d1 execute youandgee-db --remote --command "INSERT INTO credentials (username, password_salt, password_hash) VALUES ('${escapedUsername}', '${salt}', '${hash}')"`
);

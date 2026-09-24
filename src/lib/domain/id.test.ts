import { describe, expect, it } from 'vitest';
import { generateId } from './id';

describe('generateId', () => {
    it('returns a well-formed v4 UUID', () => {
        const id = generateId();
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('returns a distinct id on every call', () => {
        expect(generateId()).not.toBe(generateId());
    });
});

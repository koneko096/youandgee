import { describe, expect, it } from 'vitest';
import { rebuildStockBalance } from './stock-projection';

describe('rebuildStockBalance', () => {
    it('starts from zero and sums ordered movements', () => {
        expect(
            rebuildStockBalance([
                { quantityChange: 50, timestamp: '2026-01-01T00:00:00.000Z' },
                { quantityChange: -3, timestamp: '2026-01-02T00:00:00.000Z' }
            ])
        ).toBe(47);
    });

    it('clamps at zero after each movement, matching recordStockOperation', () => {
        // A -5 then +3 should land on 3 (clamped after the first step), not -2
        // (a plain unclamped sum) — the projection must replay the same
        // clamping behavior the write path already applies.
        expect(
            rebuildStockBalance([
                { quantityChange: -5, timestamp: '2026-01-01T00:00:00.000Z' },
                { quantityChange: 3, timestamp: '2026-01-02T00:00:00.000Z' }
            ])
        ).toBe(3);
    });

    it('replays movements in timestamp order regardless of input order', () => {
        expect(
            rebuildStockBalance([
                { quantityChange: -5, timestamp: '2026-01-02T00:00:00.000Z' },
                { quantityChange: 10, timestamp: '2026-01-01T00:00:00.000Z' }
            ])
        ).toBe(5);
    });

    it('returns zero for no movements', () => {
        expect(rebuildStockBalance([])).toBe(0);
    });
});

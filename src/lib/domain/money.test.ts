import { describe, expect, it } from 'vitest';
import { formatMoney, toMajorUnits, toMinorUnits } from './money';

describe('toMinorUnits', () => {
    it('converts a whole major-unit amount to integer minor units', () => {
        expect(toMinorUnits(1000)).toBe(100000);
    });

    it('rounds fractional major-unit input to the nearest minor unit', () => {
        expect(toMinorUnits(19.995)).toBe(2000); // 1999.5 -> rounds to 2000
        expect(toMinorUnits(0.001)).toBe(0);
    });

    it('rejects negative amounts', () => {
        expect(() => toMinorUnits(-5)).toThrow();
    });
});

describe('toMajorUnits', () => {
    it('converts integer minor units back to a major-unit number', () => {
        expect(toMajorUnits(100000)).toBe(1000);
        expect(toMajorUnits(1999)).toBeCloseTo(19.99);
    });
});

describe('formatMoney', () => {
    it('formats integer minor units as a two-decimal currency string', () => {
        expect(formatMoney(100000)).toBe('Rp 1000.00');
        expect(formatMoney(1999)).toBe('Rp 19.99');
        expect(formatMoney(0)).toBe('Rp 0.00');
    });

    it('supports a custom currency prefix', () => {
        expect(formatMoney(500, '$')).toBe('$ 5.00');
    });
});

import { describe, expect, it } from 'vitest';
import { buildProductStockReport } from './stock-report';

describe('buildProductStockReport', () => {
    it('computes opening balance from movements strictly before the range', () => {
        const movements = [
            { quantityChange: 10, timestamp: '2026-01-01T00:00:00.000Z', reason: 'restock' as const },
            { quantityChange: -3, timestamp: '2026-01-02T00:00:00.000Z', reason: 'sale' as const }
        ];

        const report = buildProductStockReport(movements, '2026-01-05T00:00:00.000Z', '2026-01-10T00:00:00.000Z');

        expect(report.openingBalance).toBe(7);
        expect(report.closingBalance).toBe(7);
    });

    it('folds in-range movements onto the opening balance to produce the closing balance', () => {
        const movements = [
            { quantityChange: 10, timestamp: '2026-01-01T00:00:00.000Z', reason: 'restock' as const },
            { quantityChange: -3, timestamp: '2026-01-05T12:00:00.000Z', reason: 'sale' as const },
            { quantityChange: 2, timestamp: '2026-01-06T00:00:00.000Z', reason: 'return' as const }
        ];

        const report = buildProductStockReport(movements, '2026-01-05T00:00:00.000Z', '2026-01-10T00:00:00.000Z');

        expect(report.openingBalance).toBe(10);
        expect(report.closingBalance).toBe(9);
        expect(report.netChange).toBe(-1);
    });

    it('sums sold as an absolute quantity but reports restock/adjustment/return with their sign', () => {
        const movements = [
            { quantityChange: 20, timestamp: '2026-01-05T00:00:00.000Z', reason: 'restock' as const },
            { quantityChange: -5, timestamp: '2026-01-06T00:00:00.000Z', reason: 'sale' as const },
            { quantityChange: -2, timestamp: '2026-01-07T00:00:00.000Z', reason: 'adjustment' as const },
            { quantityChange: 1, timestamp: '2026-01-08T00:00:00.000Z', reason: 'return' as const }
        ];

        const report = buildProductStockReport(movements, '2026-01-01T00:00:00.000Z', '2026-01-10T00:00:00.000Z');

        expect(report.sold).toBe(5);
        expect(report.restocked).toBe(20);
        expect(report.adjusted).toBe(-2);
        expect(report.returned).toBe(1);
    });

    it('is inclusive of movements exactly at the range boundaries', () => {
        const movements = [
            { quantityChange: 5, timestamp: '2026-01-05T00:00:00.000Z', reason: 'restock' as const },
            { quantityChange: -1, timestamp: '2026-01-10T23:59:59.999Z', reason: 'sale' as const }
        ];

        const report = buildProductStockReport(movements, '2026-01-05T00:00:00.000Z', '2026-01-10T23:59:59.999Z');

        expect(report.closingBalance).toBe(4);
    });

    it('returns a flat all-zero report for a product with no history at all', () => {
        const report = buildProductStockReport([], '2026-01-01T00:00:00.000Z', '2026-01-31T00:00:00.000Z');

        expect(report).toEqual({
            openingBalance: 0,
            closingBalance: 0,
            sold: 0,
            restocked: 0,
            adjusted: 0,
            returned: 0,
            netChange: 0
        });
    });

    it('never lets the closing balance go negative, matching the live write path clamping', () => {
        const movements = [{ quantityChange: -100, timestamp: '2026-01-05T00:00:00.000Z', reason: 'sale' as const }];
        const report = buildProductStockReport(movements, '2026-01-01T00:00:00.000Z', '2026-01-10T00:00:00.000Z');
        expect(report.closingBalance).toBe(0);
    });
});

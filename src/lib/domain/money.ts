/**
 * Money is persisted and computed as an integer number of minor units (100ths
 * of the display unit). Floating-point major-unit amounts are only ever
 * produced at the UI edge (an input field, a formatted label) — never summed
 * or persisted (KTD3).
 */

export function toMinorUnits(major: number): number {
    if (major < 0) {
        throw new Error(`toMinorUnits: amount must not be negative (got ${major})`);
    }
    return Math.round(major * 100);
}

export function toMajorUnits(minor: number): number {
    return minor / 100;
}

export function formatMoney(minor: number, currencyPrefix = 'Rp'): string {
    return `${currencyPrefix} ${toMajorUnits(minor).toFixed(2)}`;
}

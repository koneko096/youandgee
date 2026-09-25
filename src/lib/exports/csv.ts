/**
 * A minimal, correctly-escaped CSV builder. Handles the three RFC 4180
 * quoting cases (comma, quote, newline) and neutralizes spreadsheet formula
 * injection: a string cell beginning with =, +, -, or @ can execute as a
 * formula when the file is opened in Excel/Sheets — a well-known CSV export
 * vulnerability whenever a cell holds free-text user input (a customer or
 * product name). Numeric cells are never neutralized; a real negative
 * number is not untrusted text.
 */

const FORMULA_MARKER = /^[=+\-@]/;

function escapeCell(value: string | number): string {
    let str: string;

    if (typeof value === 'number') {
        str = String(value);
    } else {
        str = FORMULA_MARKER.test(value) ? `'${value}` : value;
    }

    if (/[",\r\n]/.test(str)) {
        str = `"${str.replace(/"/g, '""')}"`;
    }

    return str;
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
    const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(','));
    return lines.join('\r\n');
}

import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
    it('joins headers and rows with commas and CRLF line endings', () => {
        expect(toCsv(['Name', 'Qty'], [['Widget', 3], ['Gadget', 5]])).toBe('Name,Qty\r\nWidget,3\r\nGadget,5');
    });

    it('quotes a cell containing a comma', () => {
        expect(toCsv(['Name'], [['Widget, Deluxe']])).toBe('Name\r\n"Widget, Deluxe"');
    });

    it('quotes a cell containing a newline', () => {
        expect(toCsv(['Note'], [['line one\nline two']])).toBe('Note\r\n"line one\nline two"');
    });

    it('escapes an internal double quote by doubling it, and wraps the cell in quotes', () => {
        expect(toCsv(['Name'], [['12" pipe']])).toBe('Name\r\n"12"" pipe"');
    });

    it('leaves plain alphanumeric cells unquoted', () => {
        expect(toCsv(['Name'], [['Widget']])).toBe('Name\r\nWidget');
    });

    it('produces just the header row for an empty result set, never an empty string', () => {
        expect(toCsv(['Name', 'Qty'], [])).toBe('Name,Qty');
    });

    it('neutralizes a leading formula marker so a spreadsheet cannot execute it', () => {
        expect(toCsv(['Name'], [['=cmd|/c calc']])).toBe("Name\r\n'=cmd|/c calc");
        expect(toCsv(['Name'], [['+1+1']])).toBe("Name\r\n'+1+1");
        expect(toCsv(['Name'], [['-1']])).toBe("Name\r\n'-1");
        expect(toCsv(['Name'], [['@SUM(A1)']])).toBe("Name\r\n'@SUM(A1)");
    });

    it('quotes a neutralized cell that also contains a comma', () => {
        expect(toCsv(['Name'], [['=SUM(A1), extra']])).toBe('Name\r\n"\'=SUM(A1), extra"');
    });

    it('does not neutralize a normal negative number or hyphenated word', () => {
        // Neutralization is a security measure for text fields (names,
        // customer input), not a data-integrity feature — numeric columns
        // should be passed as actual numbers, not formula-marker-prefixed
        // strings, and callers are expected to do that.
        expect(toCsv(['Qty'], [[-5]])).toBe('Qty\r\n-5');
    });
});

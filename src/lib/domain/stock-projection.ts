/**
 * Stock balance is a rebuildable projection over the ordered movement
 * ledger (KTD1, KTD2) — never the sole record of truth. Replays movements in
 * timestamp order, clamping at zero after each step exactly like
 * recordStockOperation's live write does, so a rebuild always matches what
 * incremental application would have produced.
 */

export interface StockMovementLike {
    quantityChange: number;
    timestamp: string;
}

export function rebuildStockBalance(movements: StockMovementLike[]): number {
    const ordered = [...movements].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return ordered.reduce((stock, movement) => Math.max(0, stock + movement.quantityChange), 0);
}

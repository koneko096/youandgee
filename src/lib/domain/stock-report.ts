import { rebuildStockBalance, type StockMovementLike } from './stock-projection';

export interface ReportableMovement extends StockMovementLike {
    reason?: 'sale' | 'restock' | 'adjustment' | 'return';
}

export interface ProductStockReport {
    openingBalance: number;
    closingBalance: number;
    sold: number;
    restocked: number;
    adjusted: number;
    returned: number;
    netChange: number;
}

/**
 * Builds a date-range stock report for one product from its *entire*
 * movement history (not pre-filtered to the range) — the opening balance
 * needs everything before the range to be correct, matching how
 * rebuildStockBalance replays from zero rather than from an arbitrary
 * starting point.
 */
export function buildProductStockReport(allMovements: ReportableMovement[], rangeStart: string, rangeEnd: string): ProductStockReport {
    const before = allMovements.filter((m) => m.timestamp < rangeStart);
    const openingBalance = rebuildStockBalance(before);

    const within = [...allMovements]
        .filter((m) => m.timestamp >= rangeStart && m.timestamp <= rangeEnd)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    let closingBalance = openingBalance;
    let sold = 0;
    let restocked = 0;
    let adjusted = 0;
    let returned = 0;

    for (const movement of within) {
        closingBalance = Math.max(0, closingBalance + movement.quantityChange);

        switch (movement.reason) {
            case 'sale':
                sold += Math.abs(movement.quantityChange);
                break;
            case 'restock':
                restocked += movement.quantityChange;
                break;
            case 'adjustment':
                adjusted += movement.quantityChange;
                break;
            case 'return':
                returned += movement.quantityChange;
                break;
        }
    }

    return {
        openingBalance,
        closingBalance,
        sold,
        restocked,
        adjusted,
        returned,
        netChange: closingBalance - openingBalance
    };
}

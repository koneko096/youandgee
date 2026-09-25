/**
 * Reduces raw pending/rejected counts across products, orders, and stock
 * movements into one status a cashier or operator can act on at a glance
 * (R9). A rejected record always needs attention, regardless of
 * connectivity or how much else is still pending.
 */

export interface SyncCounts {
    pending: number;
    rejected: number;
}

export type SyncStatus = 'synced' | 'pending' | 'error' | 'offline';

export function summarizeSyncStatus(counts: SyncCounts, isOnline: boolean): SyncStatus {
    if (counts.rejected > 0) return 'error';
    if (!isOnline) return 'offline';
    if (counts.pending > 0) return 'pending';
    return 'synced';
}

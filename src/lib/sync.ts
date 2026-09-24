// src/lib/sync.ts
import { db } from '$lib/db';
import { rebuildStockBalance } from '$lib/domain/stock-projection';

export async function syncLedgerWithCloud() {
    if (!navigator.onLine) return;

    // 1. Push local unsynced operations to Cloudflare D1
    await pushLocalOperations();

    // 2. Pull remote updates from Cloudflare D1
    await pullRemoteUpdates();
}

export async function pushLocalOperations() {
    const unsyncedOps = await db.operations.where('synced').equals(0).toArray();

    if (unsyncedOps.length === 0) return;

    // The wire payload carries the canonical productUuid; the device-local
    // numeric productId has no meaning on the receiving device and is never
    // sent (KTD1).
    const wireOps = unsyncedOps.map((op) => ({
        id: op.id,
        productUuid: op.productUuid,
        quantityChange: op.quantityChange,
        timestamp: op.timestamp,
        reason: op.reason
    }));

    try {
        const response = await fetch('/api/syncs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operations: wireOps })
        });

        const { success, processedIds, rejected, error } = await response.json();

        if (!success) {
            throw new Error(error || 'Sync failed');
        }

        // Mark processed logs as synced locally
        if (processedIds && processedIds.length > 0) {
            await db.operations
                .where('id')
                .anyOf(processedIds)
                .modify({ synced: 1 });
        }

        // The server rejected these as invalid — they will never become
        // valid on retry, so mark them rejected (synced: -1) instead of
        // leaving them at 0, where they would be resent every sync forever.
        if (rejected && rejected.length > 0) {
            const rejectedIds = rejected.map((r: { id?: string }) => r.id).filter(Boolean);
            if (rejectedIds.length > 0) {
                await db.operations.where('id').anyOf(rejectedIds).modify({ synced: -1 });
            }
            console.error('Server rejected local operations as invalid:', rejected);
        }
    } catch (err) {
        console.error('Push sync failed, will retry when online:', err);
    }
}

export async function pullRemoteUpdates() {
    const lastSyncTime = localStorage.getItem('last_sync_timestamp') || '1970-01-01T00:00:00.000Z';

    try {
        const res = await fetch(`/api/sync/pull?since=${encodeURIComponent(lastSyncTime)}`);

        if (!res.ok) {
            throw new Error(`Pull failed: ${res.status}`);
        }

        const { newOperations, timestamp } = await res.json();

        const touchedProductIds = new Set<number>();

        if (newOperations && newOperations.length > 0) {
            // Use bulkPut with conflict resolution - local wins for same ID (shouldn't happen with UUIDs)
            // But we only insert if not already present locally
            for (const op of newOperations) {
                const existing = await db.operations.get(op.id);
                if (existing) continue;

                // Resolve the wire-carried productUuid to this device's own
                // local product row. A movement for a product this device
                // has never seen (products don't sync yet — U3) cannot be
                // reliably applied, so it is skipped rather than stored with
                // a dangling or guessed productId.
                const product = await db.products.where('uuid').equals(op.productUuid).first();
                if (!product?.id) {
                    console.warn('Skipping remote stock movement for unknown product uuid:', op.productUuid);
                    continue;
                }

                await db.operations.add({ ...op, productId: product.id, synced: 1 });
                touchedProductIds.add(product.id);
            }
        }

        // A remote movement changes stock for a product this device never
        // wrote itself — rebuild its balance from the now-complete local
        // ledger rather than leaving the stale value already on screen.
        for (const productId of touchedProductIds) {
            const movements = await db.operations.where('productId').equals(productId).toArray();
            await db.products.update(productId, { stock: rebuildStockBalance(movements) });
        }

        localStorage.setItem('last_sync_timestamp', timestamp);
    } catch (err) {
        console.error('Pull sync failed:', err);
    }
}

// Helper to record a stock operation locally and trigger sync
export async function recordStockOperation(
    productId: number,
    quantityChange: number,
    reason: 'sale' | 'restock' | 'adjustment' | 'return' = 'adjustment'
) {
    const product = await db.products.get(productId);
    if (!product) return;

    const operation = {
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        productId,
        productUuid: product.uuid,
        quantityChange,
        timestamp: new Date().toISOString(),
        synced: 0,
        reason
    };

    await db.operations.add(operation);

    // Also update local product stock immediately for UI
    await db.products.update(productId, {
        stock: Math.max(0, product.stock + quantityChange)
    });

    // Try to sync immediately if online
    if (navigator.onLine) {
        await syncLedgerWithCloud();
    }
}
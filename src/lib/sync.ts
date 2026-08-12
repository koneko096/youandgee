// src/lib/sync.ts
import { db } from '$lib/db';

export async function syncLedgerWithCloud() {
    if (!navigator.onLine) return;

    // 1. Push local unsynced operations to Cloudflare D1
    await pushLocalOperations();

    // 2. Pull remote updates from Cloudflare D1
    await pullRemoteUpdates();
}

async function pushLocalOperations() {
    const unsyncedOps = await db.operations.where('synced').equals(0).toArray();

    if (unsyncedOps.length === 0) return;

    try {
        const response = await fetch('/api/syncs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operations: unsyncedOps })
        });

        const { success, processedIds, error } = await response.json();

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
    } catch (err) {
        console.error('Push sync failed, will retry when online:', err);
    }
}

async function pullRemoteUpdates() {
    const lastSyncTime = localStorage.getItem('last_sync_timestamp') || '1970-01-01T00:00:00.000Z';

    try {
        const res = await fetch(`/api/sync/pull?since=${encodeURIComponent(lastSyncTime)}`);

        if (!res.ok) {
            throw new Error(`Pull failed: ${res.status}`);
        }

        const { newOperations, timestamp } = await res.json();

        if (newOperations && newOperations.length > 0) {
            // Use bulkPut with conflict resolution - local wins for same ID (shouldn't happen with UUIDs)
            // But we only insert if not already present locally
            for (const op of newOperations) {
                const existing = await db.operations.get(op.id);
                if (!existing) {
                    await db.operations.add({ ...op, synced: 1 });
                }
            }
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
    const operation = {
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        productId,
        quantityChange,
        timestamp: new Date().toISOString(),
        synced: 0,
        reason
    };

    await db.operations.add(operation);

    // Also update local product stock immediately for UI
    const product = await db.products.get(productId);
    if (product) {
        await db.products.update(productId, {
            stock: Math.max(0, product.stock + quantityChange)
        });
    }

    // Try to sync immediately if online
    if (navigator.onLine) {
        await syncLedgerWithCloud();
    }
}
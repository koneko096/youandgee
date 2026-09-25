// src/lib/sync.ts
import { db, type Order, type Product } from '$lib/db';
import { rebuildStockBalance } from '$lib/domain/stock-projection';
import { getAuthToken, logout } from '$lib/client-auth';

/**
 * Every sync call goes through this — attaches the bearer token, and if the
 * server ever reports 401 the stored token is cleared immediately rather
 * than kept around to fail the same way on every subsequent sync attempt
 * until the operator happens to log in again.
 *
 * Returns null (rather than throwing) when there is no token at all, so
 * callers can skip the request entirely instead of making a doomed one.
 */
async function authedFetch(url: string, init: RequestInit = {}): Promise<Response | null> {
    const token = getAuthToken();
    if (!token) return null;

    const response = await fetch(url, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}` }
    });

    if (response.status === 401) {
        logout();
    }

    return response;
}

export async function syncWithCloud() {
    if (!navigator.onLine) return;

    // Products before stock movements: a movement for a product this device
    // has not seen yet can only resolve once the product itself has synced.
    await pushLocalProducts();
    await pullRemoteProducts();

    await pushLocalOperations();
    await pullRemoteUpdates();

    await pushLocalOrders();
    await pullRemoteOrders();
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
        const response = await authedFetch('/api/syncs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operations: wireOps })
        });
        if (!response) {
            console.warn('Not logged in — stock movement sync deferred.');
            return;
        }

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
        const res = await authedFetch(`/api/sync/pull?since=${encodeURIComponent(lastSyncTime)}`);
        if (!res) {
            console.warn('Not logged in — stock movement pull deferred.');
            return;
        }

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
                // local product row. A movement for a product not yet
                // present locally (e.g. its own push/pull hasn't landed)
                // cannot be reliably applied, so it is skipped rather than
                // stored with a dangling or guessed productId.
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

export async function pushLocalProducts() {
    const unsyncedProducts = await db.products.where('synced').equals(0).toArray();

    if (unsyncedProducts.length === 0) return;

    // Stock is never part of the sync payload — it stays a rebuildable
    // projection over stock movements, never a second authority a synced
    // product row could disagree with.
    const wireProducts = unsyncedProducts.map((p) => ({
        uuid: p.uuid,
        name: p.name,
        price: p.price,
        archived: p.archived,
        updatedAt: p.updatedAt
    }));

    try {
        const response = await authedFetch('/api/products/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ products: wireProducts })
        });
        if (!response) {
            console.warn('Not logged in — product sync deferred.');
            return;
        }

        const { success, processedUuids, rejected, error } = await response.json();

        if (!success) {
            throw new Error(error || 'Product sync failed');
        }

        if (processedUuids && processedUuids.length > 0) {
            await db.products.where('uuid').anyOf(processedUuids).modify({ synced: 1 });
        }

        // A server-rejected product will never become valid on retry with
        // the same content, so mark it rejected instead of resending it
        // (and blocking every other pending product behind it) forever.
        if (rejected && rejected.length > 0) {
            const rejectedUuids = rejected.map((r: { uuid?: string }) => r.uuid).filter(Boolean);
            if (rejectedUuids.length > 0) {
                await db.products.where('uuid').anyOf(rejectedUuids).modify({ synced: -1 });
            }
            console.error('Server rejected local products as invalid:', rejected);
        }
    } catch (err) {
        console.error('Product push sync failed, will retry when online:', err);
    }
}

export async function pullRemoteProducts() {
    const lastSyncTime = localStorage.getItem('last_product_sync_timestamp') || '1970-01-01T00:00:00.000Z';

    try {
        const res = await authedFetch(`/api/products/pull?since=${encodeURIComponent(lastSyncTime)}`);
        if (!res) {
            console.warn('Not logged in — product pull deferred.');
            return;
        }

        if (!res.ok) {
            throw new Error(`Product pull failed: ${res.status}`);
        }

        const { products, timestamp } = await res.json();

        if (products && products.length > 0) {
            for (const remote of products as (Pick<Product, 'uuid' | 'name' | 'price' | 'archived'> & { updatedAt: string })[]) {
                const existing = await db.products.where('uuid').equals(remote.uuid).first();

                // Last-write-wins (KTD7): a stale remote row — e.g. from a
                // device that has been offline — must not clobber a newer
                // local edit that simply hasn't pushed yet.
                if (existing && existing.updatedAt >= remote.updatedAt) continue;

                if (existing?.id) {
                    await db.products.update(existing.id, {
                        name: remote.name,
                        price: remote.price,
                        archived: remote.archived,
                        updatedAt: remote.updatedAt,
                        synced: 1
                    });
                } else {
                    // A product this device has never seen — stock starts at
                    // zero and stays a rebuildable projection; any of its
                    // history arrives separately as stock movements.
                    await db.products.add({
                        uuid: remote.uuid,
                        name: remote.name,
                        price: remote.price,
                        stock: 0,
                        archived: remote.archived,
                        updatedAt: remote.updatedAt,
                        synced: 1
                    });
                }
            }
        }

        localStorage.setItem('last_product_sync_timestamp', timestamp);
    } catch (err) {
        console.error('Product pull sync failed:', err);
    }
}

// Create an order locally, stamped pending sync, and try to push it now.
// Orders are immutable once created (R3) — there is no matching "update"
// helper, only create.
export async function createOrder(fields: Omit<Order, 'id' | 'synced'>) {
    const id = (await db.orders.add({ ...fields, synced: 0 })) as number;

    if (navigator.onLine) {
        await syncWithCloud();
    }

    return id;
}

// Create a product locally, stamped pending sync, and try to push it now.
export async function createProduct(fields: { uuid: string; name: string; price: number; archived: boolean }) {
    const id = (await db.products.add({
        ...fields,
        stock: 0,
        synced: 0,
        updatedAt: new Date().toISOString()
    })) as number;

    if (navigator.onLine) {
        await syncWithCloud();
    }

    return id;
}

// Update a product's syncable fields locally, marking it pending sync again
// even if it was already synced, and try to push the change now.
export async function updateProductFields(
    id: number,
    changes: Partial<Pick<Product, 'name' | 'price' | 'archived'>>
) {
    await db.products.update(id, {
        ...changes,
        synced: 0,
        updatedAt: new Date().toISOString()
    });

    if (navigator.onLine) {
        await syncWithCloud();
    }
}

export async function pushLocalOrders() {
    const unsyncedOrders = await db.orders.where('synced').equals(0).toArray();

    if (unsyncedOrders.length === 0) return;

    const wireOrders = unsyncedOrders.map((o) => ({
        uuid: o.uuid,
        date: o.date.toISOString(),
        items: o.items,
        total: o.total,
        customerName: o.customerName
    }));

    try {
        const response = await authedFetch('/api/orders/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orders: wireOrders })
        });
        if (!response) {
            console.warn('Not logged in — order sync deferred.');
            return;
        }

        const { success, processedUuids, rejected, error } = await response.json();

        if (!success) {
            throw new Error(error || 'Order sync failed');
        }

        if (processedUuids && processedUuids.length > 0) {
            await db.orders.where('uuid').anyOf(processedUuids).modify({ synced: 1 });
        }

        if (rejected && rejected.length > 0) {
            const rejectedUuids = rejected.map((r: { uuid?: string }) => r.uuid).filter(Boolean);
            if (rejectedUuids.length > 0) {
                await db.orders.where('uuid').anyOf(rejectedUuids).modify({ synced: -1 });
            }
            console.error('Server rejected local orders as invalid:', rejected);
        }
    } catch (err) {
        console.error('Order push sync failed, will retry when online:', err);
    }
}

export async function pullRemoteOrders() {
    const lastSyncTime = localStorage.getItem('last_order_sync_timestamp') || '1970-01-01T00:00:00.000Z';

    try {
        const res = await authedFetch(`/api/orders/pull?since=${encodeURIComponent(lastSyncTime)}`);
        if (!res) {
            console.warn('Not logged in — order pull deferred.');
            return;
        }

        if (!res.ok) {
            throw new Error(`Order pull failed: ${res.status}`);
        }

        const { orders, timestamp } = await res.json();

        if (orders && orders.length > 0) {
            for (const remote of orders as (Pick<Order, 'uuid' | 'items' | 'total' | 'customerName'> & { date: string })[]) {
                // Orders are immutable (R3) — one this device already has
                // needs no update, ever.
                const existing = await db.orders.where('uuid').equals(remote.uuid).first();
                if (existing) continue;

                await db.orders.add({
                    uuid: remote.uuid,
                    date: new Date(remote.date),
                    items: remote.items,
                    total: remote.total,
                    customerName: remote.customerName,
                    synced: 1
                });
            }
        }

        localStorage.setItem('last_order_sync_timestamp', timestamp);
    } catch (err) {
        console.error('Order pull sync failed:', err);
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
        await syncWithCloud();
    }
}
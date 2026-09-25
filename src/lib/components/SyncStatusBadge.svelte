<script lang="ts">
    import { onMount } from "svelte";
    import { liveQuery } from "dexie";
    import { db } from "$lib/db";
    import { summarizeSyncStatus, type SyncCounts } from "$lib/domain/sync-status";

    let isOnline = $state(true);

    onMount(() => {
        isOnline = navigator.onLine;
        const update = () => { isOnline = navigator.onLine; };
        window.addEventListener("online", update);
        window.addEventListener("offline", update);
        return () => {
            window.removeEventListener("online", update);
            window.removeEventListener("offline", update);
        };
    });

    // Pending/rejected local work across every synced entity — a cashier or
    // operator needs one answer, not three (R9).
    let counts = $state(liveQuery<SyncCounts>(async () => {
        const [productsPending, productsRejected, ordersPending, ordersRejected, opsPending, opsRejected] = await Promise.all([
            db.products.where("synced").equals(0).count(),
            db.products.where("synced").equals(-1).count(),
            db.orders.where("synced").equals(0).count(),
            db.orders.where("synced").equals(-1).count(),
            db.operations.where("synced").equals(0).count(),
            db.operations.where("synced").equals(-1).count()
        ]);
        return {
            pending: productsPending + ordersPending + opsPending,
            rejected: productsRejected + ordersRejected + opsRejected
        };
    }));

    let status = $derived(summarizeSyncStatus($counts ?? { pending: 0, rejected: 0 }, isOnline));

    const LABEL: Record<string, string> = {
        synced: "Synced",
        pending: "Syncing…",
        error: "Sync error",
        offline: "Offline"
    };

    const ICON: Record<string, string> = {
        synced: "✓",
        pending: "⏳",
        error: "⚠",
        offline: "📴"
    };
</script>

<div
    class="sync-badge sync-badge--{status}"
    title={status === "error"
        ? `${$counts?.rejected ?? 0} item(s) were rejected by the server and need attention`
        : status === "pending"
            ? `${$counts?.pending ?? 0} item(s) waiting to sync`
            : LABEL[status]}
>
    <span class="icon">{ICON[status]}</span>
    <span class="label">{LABEL[status]}</span>
    {#if status === "pending" && $counts?.pending}
        <span class="count">{$counts.pending}</span>
    {/if}
    {#if status === "error" && $counts?.rejected}
        <span class="count">{$counts.rejected}</span>
    {/if}
</div>

<style>
    .sync-badge {
        position: fixed;
        top: 12px;
        right: 12px;
        z-index: 1000;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 600;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
        pointer-events: none;
    }

    .count {
        background: rgba(0, 0, 0, 0.15);
        border-radius: 999px;
        padding: 0 6px;
        min-width: 16px;
        text-align: center;
    }

    .sync-badge--synced {
        background: #e6fffa;
        color: #285e61;
    }

    .sync-badge--pending {
        background: #fefcbf;
        color: #744210;
    }

    .sync-badge--error {
        background: #fff5f5;
        color: #c53030;
    }

    .sync-badge--offline {
        background: #edf2f7;
        color: #4a5568;
    }
</style>

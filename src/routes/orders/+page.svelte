<script lang="ts">
    import { liveQuery } from "dexie";
    import { db } from "$lib/db";
    import type { Order } from "$lib/db";

    // --- DATA ---
    let orders = $state(liveQuery(() => db.orders.orderBy('date').reverse().toArray()));
    let expandedOrderId = $state<number | null>(null);

    // --- ACTIONS ---
    function toggleOrder(orderId: number | undefined) {
        if (!orderId) return;
        expandedOrderId = expandedOrderId === orderId ? null : orderId;
    }
</script>

<div class="orders-wrapper">
    <div class="header-card card">
        <div class="header-row">
            <h1>Order History</h1>
            <a href="/" class="secondary-btn">← Back to POS</a>
        </div>
    </div>

    <div class="orders-container">
        {#if $orders && $orders.length > 0}
            {#each $orders as order}
            <div class="order-card card">
                <button class="order-header" onclick={() => toggleOrder(order.id)}>
                    <div class="order-info">
                        <div class="order-main">
                            <span class="order-id">Order #{order.id}</span>
                            <span class="customer-badge">{order.customerName}</span>
                        </div>
                        <div class="order-meta">
                            <span class="date">{new Date(order.date).toLocaleString()}</span>
                            <span class="item-count">{order.items.length} items</span>
                        </div>
                    </div>
                    <div class="order-total-section">
                        <span class="total-amount">Rp {order.total.toFixed(2)}</span>
                        <span class="expand-icon">{expandedOrderId === order.id ? '▼' : '▶'}</span>
                    </div>
                </button>

                {#if expandedOrderId === order.id}
                <div class="order-details">
                    <div class="items-list">
                        {#each order.items as item}
                        <div class="item-row">
                            <span class="item-name">{item.name}</span>
                            <span class="item-qty">x{item.quantity}</span>
                            <span class="item-price">Rp {item.price.toFixed(2)}</span>
                            <span class="item-subtotal">Rp {(item.price * item.quantity).toFixed(2)}</span>
                        </div>
                        {/each}
                    </div>
                    <div class="details-footer">
                        <strong>Total:</strong>
                        <strong>Rp {order.total.toFixed(2)}</strong>
                    </div>
                </div>
                {/if}
            </div>
            {/each}
        {:else}
            <div class="empty-state card">
                <p>No orders yet</p>
                <small>Orders will appear here after checkout</small>
            </div>
        {/if}
    </div>
</div>

<style>
    :global(body) {
        margin: 0;
        padding: 0;
        background: #f8f9fa;
        color: #2d3748;
    }

    .orders-wrapper {
        min-height: 100vh;
        font-family: 'Inter', system-ui, sans-serif;
        padding: 20px;
        max-width: 1200px;
        margin: 0 auto;
    }

    .card {
        background: white;
        border-radius: 12px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        border: 1px solid #edf2f7;
    }

    .header-card {
        padding: 20px;
        margin-bottom: 20px;
    }

    .header-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .header-row h1 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 700;
        color: #1a202c;
    }

    .secondary-btn {
        display: inline-block;
        text-decoration: none;
        background: #edf2f7;
        color: #4a5568;
        padding: 10px 20px;
        border-radius: 8px;
        font-weight: 600;
        font-size: 0.9rem;
        border: none;
        cursor: pointer;
        transition: background 0.2s;
    }

    .secondary-btn:hover {
        background: #e2e8f0;
    }

    .orders-container {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .order-card {
        overflow: hidden;
    }

    .order-header {
        width: 100%;
        padding: 20px;
        background: none;
        border: none;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        text-align: left;
        transition: background 0.15s;
    }

    .order-header:hover {
        background: #f8f9fa;
    }

    .order-info {
        flex: 1;
    }

    .order-main {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 8px;
    }

    .order-id {
        font-size: 1rem;
        font-weight: 700;
        color: #1a202c;
    }

    .customer-badge {
        background: #e6fffa;
        color: #234e52;
        padding: 4px 12px;
        border-radius: 999px;
        font-size: 0.85rem;
        font-weight: 600;
    }

    .order-meta {
        display: flex;
        gap: 16px;
        font-size: 0.85rem;
        color: #718096;
    }

    .item-count {
        color: #4a5568;
        font-weight: 500;
    }

    .order-total-section {
        display: flex;
        align-items: center;
        gap: 20px;
    }

    .total-amount {
        font-size: 1.25rem;
        font-weight: 700;
        color: #2b6cb0;
    }

    .expand-icon {
        font-size: 0.75rem;
        color: #a0aec0;
    }

    .order-details {
        border-top: 1px solid #edf2f7;
        padding: 20px;
        background: #f8f9fa;
    }

    .items-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 16px;
    }

    .item-row {
        display: grid;
        grid-template-columns: 2fr auto auto auto;
        gap: 16px;
        align-items: center;
        padding: 12px;
        background: white;
        border-radius: 6px;
        font-size: 0.9rem;
    }

    .item-name {
        font-weight: 600;
        color: #2d3748;
    }

    .item-qty {
        color: #718096;
        text-align: center;
    }

    .item-price {
        color: #4a5568;
        text-align: right;
    }

    .item-subtotal {
        font-weight: 600;
        color: #2b6cb0;
        text-align: right;
    }

    .details-footer {
        display: flex;
        justify-content: space-between;
        padding-top: 16px;
        border-top: 2px solid #cbd5e0;
        font-size: 1.1rem;
        color: #1a202c;
    }

    .empty-state {
        text-align: center;
        padding: 60px 20px;
        color: #a0aec0;
    }

    .empty-state p {
        margin: 0;
        font-weight: 600;
        font-size: 1.1rem;
    }

    .empty-state small {
        font-size: 0.9rem;
    }
</style>

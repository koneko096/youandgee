<script lang="ts">
    import { liveQuery } from "dexie";
    import { db } from "$lib/db";
    import type { StockOperation, Product } from "$lib/db";

    // --- STATE ---
    let reportDate = $state(new Date().toISOString().split('T')[0]);
    let report = $state({
        totalSales: 0,
        totalRestock: 0,
        netChange: 0,
        byProduct: [] as { product: Product; sold: number; restocked: number; net: number }[]
    });
    let allProducts = $state(liveQuery(() => db.products.toArray()));
    let recentOps = $state(liveQuery(() => db.operations.orderBy('timestamp').reverse().limit(50).toArray()));
    let productNames = $state(new Map<number, string>());
    let isLoading = $state(false);

    // Build name lookup reactively
    $effect(() => {
        const products = $allProducts;
        if (products) {
            const m = new Map<number, string>();
            for (const p of products) {
                if (p.id != null) m.set(p.id, p.name);
            }
            productNames = m;
        }
    });

    function getProductName(id: number): string {
        return productNames.get(id) || `Product #${id}`;
    }

    async function generateReport() {
        isLoading = true;

        const dateStr = reportDate;
        const start = `${dateStr}T00:00:00.000Z`;
        const end = `${dateStr}T23:59:59.999Z`;

        // Fetch local operations for the selected date
        const ops = await db.operations
            .where('timestamp')
            .between(start, end, true, true)
            .toArray();

        let sales = 0;
        let restock = 0;
        const productMap = new Map<number, { product: Product; sold: number; restocked: number }>();

        // Initialize product map
        for (const p of ($allProducts || [])) {
            if (p.id != null) {
                productMap.set(p.id, { product: p, sold: 0, restocked: 0 });
            }
        }

        for (const op of ops) {
            if (op.quantityChange < 0) {
                const qty = Math.abs(op.quantityChange);
                sales += qty;
                const entry = productMap.get(op.productId);
                if (entry) entry.sold += qty;
            } else {
                const qty = op.quantityChange;
                restock += qty;
                const entry = productMap.get(op.productId);
                if (entry) entry.restocked += qty;
            }
        }

        const byProduct = Array.from(productMap.values())
            .filter(p => p.sold > 0 || p.restocked > 0)
            .map(p => ({
                product: p.product,
                sold: p.sold,
                restocked: p.restocked,
                net: p.restocked - p.sold
            }));

        report = {
            totalSales: sales,
            totalRestock: restock,
            netChange: restock - sales,
            byProduct
        };

        isLoading = false;
    }

    function formatCurrency(n: number) {
        return `Rp ${n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
</script>

<div class="reports-container">
    <div class="header-card card">
        <div class="header-row">
            <h1>📊 Stock Movement Reports</h1>
            <a href="/" class="secondary-btn">← Back to POS</a>
       </div>
   </div>

    <div class="report-controls card">
        <div class="control-group">
            <label for="reportDate">Report Date</label>
            <input
                id="reportDate"
                type="date"
                bind:value={reportDate}
                onchange={generateReport}
            />
       </div>
        <div class="control-group">
            <button class="primary-btn" onclick={generateReport} disabled={isLoading}>
                {isLoading ? 'Generating...' : 'Generate Report'}
           </button>
       </div>
   </div>

    <div class="summary-grid">
        <div class="summary-card card">
            <h3>Total Restocked</h3>
            <div class="summary-value positive">+{report.totalRestock}</div>
       </div>
        <div class="summary-card card">
            <h3>Total Sold</h3>
            <div class="summary-value negative">-{report.totalSales}</div>
       </div>
        <div class="summary-card card">
            <h3>Net Change</h3>
            <div class="summary-value" class:positive={report.netChange >= 0} class:negative={report.netChange < 0}>
                {report.netChange >= 0 ? '+' : ''}{report.netChange}
           </div>
       </div>
   </div>

    <div class="detail-card card">
        <h2>Breakdown by Product</h2>
        {#if report.byProduct.length > 0}
        <table>
            <thead>
                <tr>
                    <th>Product</th>
                    <th class="numeric">Restocked</th>
                    <th class="numeric">Sold</th>
                    <th class="numeric">Net Change</th>
               </tr>
           </thead>
            <tbody>
                {#each report.byProduct as item (item.product.id)}
                <tr>
                    <td class="name-cell"><strong>{item.product.name}</strong></td>
                    <td class="numeric positive">+{item.restocked}</td>
                    <td class="numeric negative">-{item.sold}</td>
                    <td class="numeric" class:positive={item.net >= 0} class:negative={item.net < 0}>
                        {item.net >= 0 ? '+' : ''}{item.net}
                    </td>
                </tr>
                {/each}
           </tbody>
       </table>
        {:else}
        <div class="empty-state">
            <p>No stock movements for this date</p>
            <small>Select a different date or make some sales/restocks</small>
       </div>
        {/if}
   </div>

    <div class="history-card card">
        <h2>Recent Operations (Last 50</h2>
        <table>
            <thead>
                <tr>
                    <th>Time</th>
                    <th>Product</th>
                    <th>Type</th>
                    <th class="numeric">Qty Change</th>
                    <th>Synced</th>
               </tr>
           </thead>
            <tbody>
                {#if $recentOps}
                    {#each $recentOps as op (op.id)}
                    <tr>
                        <td>{new Date(op.timestamp).toLocaleString()}</td>
                        <td>{getProductName(op.productId)}</td>
                        <td>
                            <span class="reason-badge {op.reason || 'adjustment'}">{op.reason || 'adjustment'}</span>
                       </td>
                        <td class="numeric" class:positive={op.quantityChange > 0} class:negative={op.quantityChange < 0}>
                            {op.quantityChange > 0 ? '+' : ''}{op.quantityChange}
                       </td>
                        <td>
                            <span class="sync-badge" class:synced={op.synced === 1}>
                                {op.synced ? '✓ Synced' : '⏳ Pending'}
                           </span>
                       </td>
                   </tr>
                    {/each}
                {/if}
           </tbody>
       </table>
   </div>
</div>

<style>
    .reports-container {
        padding: 20px;
        max-width: 1000px;
        margin: 0 auto;
        font-family: 'Inter', sans-serif;
        background: #f8f9fa;
        min-height: 100vh;
    }

    .card {
        background: white;
        border-radius: 12px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        border: 1px solid #edf2f7;
        padding: 20px;
        margin-bottom: 20px;
    }

    .header-card {
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
    }

    .secondary-btn:hover {
        background: #e2e8f0;
    }

    .report-controls {
        display: flex;
        gap: 20px;
        align-items: flex-end;
        flex-wrap: wrap;
    }

    .control-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .control-group label {
        font-size: 0.85rem;
        font-weight: 600;
        color: #4a5568;
    }

    .control-group input,
    .control-group select {
        padding: 10px 12px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        font-size: 14px;
        min-width: 200px;
    }

    .primary-btn {
        background: #3182ce;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
    }

    .primary-btn:hover:not(:disabled) {
        background: #2b6cb0;
    }

    .primary-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .summary-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 20px;
        margin-bottom: 20px;
    }

    @media (max-width: 768px) {
        .summary-grid {
            grid-template-columns: 1fr;
        }
        .report-controls {
            flex-direction: column;
            align-items: stretch;
        }
    }

    .summary-card {
        text-align: center;
        padding: 24px;
    }

    .summary-card h3 {
        margin: 0 0 12px 0;
        font-size: 0.9rem;
        color: #718096;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .summary-value {
        font-size: 2rem;
        font-weight: 700;
    }

    .summary-value.positive {
        color: #38a169;
    }

    .summary-value.negative {
        color: #e53e3e;
    }

    .detail-card h2,
    .history-card h2 {
        margin-top: 0;
        margin-bottom: 20px;
        font-size: 1.1rem;
        color: #1a202c;
    }

    table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
    }

    th {
        padding: 12px 15px;
        border-bottom: 2px solid #edf2f7;
        color: #4a5568;
        font-weight: 600;
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    td {
        padding: 12px 15px;
        border-bottom: 1px solid #edf2f7;
        font-size: 0.9rem;
    }

    .name-cell {
        font-weight: 600;
        color: #2d3748;
    }

    .numeric {
        text-align: right;
        font-variant-numeric: tabular-nums;
    }

    .numeric.positive {
        color: #38a169;
        font-weight: 600;
    }

    .numeric.negative {
        color: #e53e3e;
        font-weight: 600;
    }

    .reason-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
    }

    .reason-badge.sale {
        background: #fff5f5;
        color: #c53030;
    }

    .reason-badge.restock {
        background: #f0fff4;
        color: #2f855a;
    }

    .reason-badge.adjustment {
        background: #ebf8ff;
        color: #2b6cb0;
    }

    .reason-badge.return {
        background: #faf5ff;
        color: #805ad5;
    }

    .sync-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 0.7rem;
        font-weight: 600;
    }

    .sync-badge.synced {
        background: #f0fff4;
        color: #2f855a;
    }

    .sync-badge:not(.synced) {
        background: #fffaf0;
        color: #dd6b20;
    }

    .empty-state {
        text-align: center;
        padding: 40px 20px;
        color: #a0aec0;
    }

    .empty-state p {
        margin: 0 0 8px 0;
        font-weight: 600;
    }

    .empty-state small {
        font-size: 0.85rem;
    }

    .detail-card,
    .history-card {
        overflow-x: auto;
    }
</style>
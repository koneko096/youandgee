<script lang="ts">
    import { liveQuery } from "dexie";
    import { db } from "$lib/db";
    import type { Product } from "$lib/db";
    import { SvelteMap } from "svelte/reactivity";
    import { buildProductStockReport, type ProductStockReport } from "$lib/domain/stock-report";
    import { toCsv } from "$lib/exports/csv";

    // --- STATE ---
    const today = new Date().toISOString().split('T')[0];
    let startDate = $state(today);
    let endDate = $state(today);
    let report = $state({
        totalSales: 0,
        totalRestock: 0,
        netChange: 0,
        byProduct: [] as { product: Product; report: ProductStockReport }[]
    });
    let allProducts = $state(liveQuery(() => db.products.toArray()));
    let recentOps = $state(liveQuery(() => db.operations.orderBy('timestamp').reverse().limit(50).toArray()));
    let productNames = new SvelteMap<number, string>();
    let isLoading = $state(false);
    let hasGenerated = $state(false);

    // Build name lookup reactively
    $effect(() => {
        const products = $allProducts;
        if (products) {
            productNames.clear();
            for (const p of products) {
                if (p.id != null) productNames.set(p.id, p.name);
            }
        }
    });

    function getProductName(id: number): string {
        return productNames.get(id) || `Product #${id}`;
    }

    // The report window is timezone-naive (the date input's literal value,
    // treated as UTC midnight-to-midnight) — no local-timezone conversion.
    // Documented here rather than silently assumed, since AE4 requires the
    // window/timezone to be visible.
    function rangeBounds() {
        return {
            start: `${startDate}T00:00:00.000Z`,
            end: `${endDate}T23:59:59.999Z`
        };
    }

    async function generateReport() {
        isLoading = true;

        const { start, end } = rangeBounds();
        const products = $allProducts || [];

        let totalSales = 0;
        let totalRestock = 0;
        const byProduct: { product: Product; report: ProductStockReport }[] = [];

        for (const product of products) {
            if (product.id == null) continue;

            // Opening balance needs the product's entire history, not just
            // what falls inside the selected range.
            const allMovements = await db.operations.where('productId').equals(product.id).toArray();
            const productReport = buildProductStockReport(allMovements, start, end);

            const hasActivity =
                productReport.sold !== 0 ||
                productReport.restocked !== 0 ||
                productReport.adjusted !== 0 ||
                productReport.returned !== 0;

            if (hasActivity) {
                byProduct.push({ product, report: productReport });
                totalSales += productReport.sold;
                totalRestock += productReport.restocked;
            }
        }

        report = {
            totalSales,
            totalRestock,
            netChange: totalRestock - totalSales,
            byProduct
        };

        isLoading = false;
        hasGenerated = true;
    }

    function downloadCsv() {
        const { start, end } = rangeBounds();
        const headers = ['Product', 'Opening Balance', 'Restocked', 'Sold', 'Adjusted', 'Returned', 'Net Change', 'Closing Balance'];

        const rows: (string | number)[][] =
            report.byProduct.length > 0
                ? report.byProduct.map(({ product, report: r }) => [
                      product.name,
                      r.openingBalance,
                      r.restocked,
                      r.sold,
                      r.adjusted,
                      r.returned,
                      r.netChange,
                      r.closingBalance
                  ])
                : [[`No stock movements between ${start} and ${end} (UTC)`, '', '', '', '', '', '', '']];

        const csv = toCsv(headers, rows);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `stock-report-${startDate}-to-${endDate}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
</script>

<div class="reports-container">
    <div class="header-card card">
        <div class="header-row">
            <h1>📊 Stock Movement Reports</h1>
            <a href="/" class="secondary-btn" data-sveltekit-preload-data="hover">← Back to POS</a>
       </div>
   </div>

    <div class="report-controls card">
        <div class="control-group">
            <label for="startDate">From</label>
            <input id="startDate" type="date" bind:value={startDate} onchange={generateReport} />
       </div>
        <div class="control-group">
            <label for="endDate">To</label>
            <input id="endDate" type="date" bind:value={endDate} onchange={generateReport} />
       </div>
        <div class="control-group">
            <button class="primary-btn" onclick={generateReport} disabled={isLoading}>
                {isLoading ? 'Generating...' : 'Generate Report'}
           </button>
       </div>
        <div class="control-group">
            <button class="secondary-btn" onclick={downloadCsv} disabled={!hasGenerated}>
                ⬇️ Download CSV
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
        {#if !hasGenerated}
        <div class="empty-state">
            <p>Choose a range and generate a report</p>
       </div>
        {:else if report.byProduct.length > 0}
        <table>
            <thead>
                <tr>
                    <th>Product</th>
                    <th class="numeric">Opening</th>
                    <th class="numeric">Restocked</th>
                    <th class="numeric">Sold</th>
                    <th class="numeric">Adjusted</th>
                    <th class="numeric">Returned</th>
                    <th class="numeric">Net Change</th>
                    <th class="numeric">Closing</th>
               </tr>
           </thead>
            <tbody>
                {#each report.byProduct as item (item.product.id)}
                <tr>
                    <td class="name-cell"><strong>{item.product.name}</strong></td>
                    <td class="numeric">{item.report.openingBalance}</td>
                    <td class="numeric positive">+{item.report.restocked}</td>
                    <td class="numeric negative">-{item.report.sold}</td>
                    <td class="numeric" class:positive={item.report.adjusted >= 0} class:negative={item.report.adjusted < 0}>
                        {item.report.adjusted >= 0 ? '+' : ''}{item.report.adjusted}
                    </td>
                    <td class="numeric positive">+{item.report.returned}</td>
                    <td class="numeric" class:positive={item.report.netChange >= 0} class:negative={item.report.netChange < 0}>
                        {item.report.netChange >= 0 ? '+' : ''}{item.report.netChange}
                    </td>
                    <td class="numeric"><strong>{item.report.closingBalance}</strong></td>
                </tr>
                {/each}
           </tbody>
       </table>
        {:else}
        <div class="empty-state">
            <p>No stock movements in this date range</p>
            <small>Select a different range or make some sales/restocks</small>
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
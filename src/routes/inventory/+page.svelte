<script lang="ts">
    import { liveQuery } from "dexie";
    import { db } from "$lib/db";
    import { createProduct, recordStockOperation, updateProductFields } from "$lib/sync";
    import { generateId } from "$lib/domain/id";
    import { toMajorUnits, toMinorUnits } from "$lib/domain/money";

    let name = $state("");
    let price = $state(0);
    let stock = $state(0);
    let searchTerm = $state("");

    // Load products reactively
    let products = $state(liveQuery(() => db.products.toArray()));

    let filteredProducts = $derived(
        ($products || []).filter(p =>
            p.name.toLowerCase().includes(searchTerm.toLowerCase())
        )
    );

    async function addProduct() {
        if (!name || price <= 0) return;
        const initialStock = stock;
        const id = await createProduct({ uuid: generateId(), name, price: toMinorUnits(price), archived: false });
        // Record initial stock as a ledger movement rather than setting it
        // directly, so stock projections rebuilt from the ledger match.
        if (initialStock > 0) {
            await recordStockOperation(id, initialStock, 'restock');
        }
        // Reset form
        name = ""; price = 0; stock = 0;
    }

    async function archiveProduct(id: number) {
        if (confirm("Archive this product? It will be hidden from sale but its order and stock history stays intact.")) {
            await updateProductFields(id, { archived: true });
        }
    }

    async function restoreProduct(id: number) {
        await updateProductFields(id, { archived: false });
    }

    async function updateStock(id: number, newStock: number) {
        const product = await db.products.get(id);
        if (!product) return;

        const diff = newStock - product.stock;
        if (diff !== 0) {
            await recordStockOperation(id, diff, diff > 0 ? 'restock' : 'adjustment');
        }
    }

    async function updatePrice(id: number, newMajorPrice: number) {
        await updateProductFields(id, { price: toMinorUnits(newMajorPrice) });
    }
</script>

<div class="inventory-container">
    <div class="header">
        <a href="/" class="back-btn" data-sveltekit-preload-data="hover">← Back to POS</a>
        <h1>Inventory Management</h1>
    </div>

    <div class="tool-bar">
        <div class="add-form card">
            <h3>Add New Product</h3>
            <div class="input-group">
                <input type="text" placeholder="Product Name" bind:value={name} />
                <input type="tel" placeholder="Price" bind:value={price} />
                <input type="number" placeholder="Initial Stock" bind:value={stock} />
                <button class="primary-btn" onclick={addProduct}>Add Item</button>
            </div>
        </div>

        <div class="search-box card">
            <h3>Search Inventory</h3>
            <input type="search" placeholder="🔍 Search product name..." bind:value={searchTerm} />
        </div>
    </div>

    <div class="table-container card">
        {#if $products}
        <table>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Price (Rp)</th>
                    <th>Current Stock</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                {#each filteredProducts as p (p.id)}
                <tr class:archived-row={p.archived}>
                    <td class="name-cell">
                        <strong>{p.name}</strong>
                        {#if p.archived}<span class="archived-badge">Archived</span>{/if}
                    </td>
                    <td class="input-cell">
                        <input type="number" value={toMajorUnits(p.price)} step="0.01" disabled={p.archived} onchange={(e)=> updatePrice(p.id!,
                        parseFloat(e.currentTarget.value))} />
                    </td>
                    <td class="input-cell">
                        <input type="number" value={p.stock} disabled={p.archived} onchange={(e)=> updateStock(p.id!,
                        parseInt(e.currentTarget.value))}
                        class:low-stock={p.stock
                        < 5} />
                    </td>
                    <td>
                        {#if p.archived}
                        <button class="secondary-btn" onclick={()=> restoreProduct(p.id!)}>Restore</button>
                        {:else}
                        <button class="delete-btn" onclick={()=> archiveProduct(p.id!)}>Archive</button>
                        {/if}
                    </td>
                </tr>
                {/each}
            </tbody>
        </table>
        {/if}
    </div>
</div>

<style>
    .inventory-container {
        padding: 20px;
        max-width: 1000px;
        margin: 0 auto;
        font-family: 'Inter', sans-serif;
        background: #f8f9fa;
        min-height: 100vh;
    }

    .header {
        display: flex;
        align-items: center;
        gap: 20px;
        margin-bottom: 30px;
    }

    .back-btn {
        text-decoration: none;
        color: #4a5568;
        font-weight: 500;
        padding: 8px 16px;
        background: #edf2f7;
        border-radius: 6px;
        transition: background 0.2s;
    }

    .back-btn:hover {
        background: #e2e8f0;
    }

    .tool-bar {
        display: flex;
        gap: 20px;
        margin-bottom: 20px;
    }

    @media (max-width: 1024px) {
        .tool-bar {
            flex-direction: column;
        }

        .add-form {
            overflow-x: auto;
        }
    }

    .card {
        background: white;
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .card h3 {
        margin-top: 0;
        font-size: 0.9rem;
        color: #718096;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 15px;
    }

    .input-group {
        display: flex;
        gap: 10px;
    }

    input {
        padding: 10px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        font-size: 14px;
    }

    input:focus {
        outline: none;
        border-color: #3182ce;
        box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.2);
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

    .search-box input {
        width: 100%;
        box-sizing: border-box;
    }

    .table-container {
        overflow-x: auto;
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
    }

    td {
        padding: 10px 15px;
        border-bottom: 1px solid #edf2f7;
    }

    .name-cell {
        font-size: 1rem;
    }

    .input-cell input {
        width: 80px;
        text-align: center;
    }

    .low-stock {
        border-color: #feb2b2 !important;
        background-color: #fff5f5;
        color: #c53030;
        font-weight: bold;
    }

    .delete-btn {
        background: #fff5f5;
        color: #c53030;
        border: 1px solid #feb2b2;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.85rem;
    }

    .delete-btn:hover {
        background: #c53030;
        color: white;
    }

    .secondary-btn {
        background: #edf2f7;
        color: #4a5568;
        border: 1px solid #e2e8f0;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.85rem;
    }

    .secondary-btn:hover {
        background: #e2e8f0;
    }

    .archived-row {
        opacity: 0.6;
    }

    .archived-badge {
        margin-left: 8px;
        padding: 2px 8px;
        border-radius: 999px;
        background: #edf2f7;
        color: #718096;
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
</style>
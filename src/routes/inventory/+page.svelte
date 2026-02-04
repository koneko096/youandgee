<script lang="ts">
    import { liveQuery } from "dexie";
    import { db } from "$lib/db";

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
        await db.products.add({ name, price, stock });
        // Reset form
        name = ""; price = 0; stock = 0;
    }

    async function deleteProduct(id: number) {
        if (confirm("Are you sure you want to delete this product?")) {
            await db.products.delete(id);
        }
    }

    async function updateStock(id: number, newStock: number) {
        await db.products.update(id, { stock: newStock });
    }

    async function updatePrice(id: number, newPrice: number) {
        await db.products.update(id, { price: newPrice });
    }
</script>

<div class="inventory-container">
    <div class="header">
        <a href="/" class="back-btn">← Back to POS</a>
        <h1>Inventory Management</h1>
    </div>

    <div class="tool-bar">
        <div class="add-form card">
            <h3>Add New Product</h3>
            <div class="input-group">
                <input type="text" placeholder="Product Name" bind:value={name} />
                <input type="number" placeholder="Price" bind:value={price} step="0.01" />
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
                    <th>Price ($)</th>
                    <th>Current Stock</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                {#each filteredProducts as p (p.id)}
                <tr>
                    <td class="name-cell"><strong>{p.name}</strong></td>
                    <td class="input-cell">
                        <input type="number" value={p.price} step="0.01" onchange={(e)=> updatePrice(p.id!,
                        parseFloat(e.currentTarget.value))} />
                    </td>
                    <td class="input-cell">
                        <input type="number" value={p.stock} onchange={(e)=> updateStock(p.id!,
                        parseInt(e.currentTarget.value))}
                        class:low-stock={p.stock
                        < 5} />
                    </td>
                    <td>
                        <button class="delete-btn" onclick={()=> deleteProduct(p.id!)}>Delete</button>
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
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: 20px;
        margin-bottom: 20px;
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
</style>
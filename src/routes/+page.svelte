<script lang="ts">
    import { liveQuery } from "dexie";
    import { db } from "$lib/db";
    import type { Product } from "$lib/db";

    // --- DATA ---
    let products = $state(liveQuery(() => db.products.toArray()));
    let searchTerm = $state("");

    // Cart State
    let cart = $state < { product: Product; qty: number }[] > ([]);
    let customerName = $state("");
    let showReceipt = $state(false);
    let lastOrderId = $state < number | null > (null);
    let lastCustomerName = $state("");
    let isCartOpen = $state(false);

    // --- COMPUTED (Derived) ---
    let filteredProducts = $derived(
        ($products || []).filter(p =>
            p.name.toLowerCase().includes(searchTerm.toLowerCase())
        )
    );

    let total = $derived(cart.reduce((sum, item) => sum + (item.product.price * item.qty), 0));

    // --- ACTIONS ---
    function addToCart(p: Product) {
        if (p.stock <= 0) return;

        const existingItem = cart.find(i => i.product.id === p.id);
        const currentQtyInCart = existingItem ? existingItem.qty : 0;

        if (currentQtyInCart + 1 > p.stock) {
            alert(`Only ${p.stock} items left in stock!`);
            return;
        }

        if (existingItem) {
            existingItem.qty++;
        } else {
            cart.push({ product: p, qty: 1 });
        }
    }

    function removeFromCart(index: number) {
        cart.splice(index, 1);
    }

    function updateCartQty(index: number, newQty: number) {
        const item = cart[index];
        if (newQty <= 0) {
            removeFromCart(index);
            return;
        }

        if (newQty > item.product.stock) {
            alert(`Only ${item.product.stock} items left in stock!`);
            item.qty = item.product.stock;
        } else {
            item.qty = newQty;
        }
    }

    async function checkout() {
        if (cart.length === 0) return;
        
        // Validate customer name
        if (!customerName.trim()) {
            alert('Please enter customer name before checkout!');
            return;
        }

        const orderId = await db.orders.add({
            date: new Date(),
            total: total,
            customerName: customerName.trim(),
            items: cart.map(i => ({
                name: i.product.name,
                price: i.product.price,
                quantity: i.qty
            }))
        });

        for (const item of cart) {
            if (item.product.id) {
                const current = await db.products.get(item.product.id);
                if (current) {
                    const newStock = current.stock - item.qty;
                    await db.products.update(item.product.id, {
                        stock: newStock >= 0 ? newStock : 0
                    });
                }
            }
        }

        lastOrderId = orderId as number;
        lastCustomerName = customerName.trim();
        showReceipt = true;
    }

    function printReceipt() {
        window.print();
        cart = [];
        customerName = "";
        showReceipt = false;
        isCartOpen = false;
    }
</script>

{@debug isCartOpen}

<div class="pos-wrapper">
    <!-- LEFT: Catalog -->
    <div class="catalog-section">
        <div class="header-card card">
            <div class="header-row">
                <h1>POS Dashboard</h1>
                <input type="search" placeholder="🔍 Search product..." bind:value={searchTerm} class="search-bar" />
            </div>
        </div>

        <div class="grid">
            {#if $products}
            {#each filteredProducts as p}
            <button class="product-card card" onclick={()=> addToCart(p)}
                disabled={p.stock <= 0} class:out-of-stock={p.stock <=0}>
                    <div class="p-info">
                        <h3>{p.name}</h3>
                        <span class="price">Rp {p.price.toFixed(2)}</span>
                    </div>
                    <small class:warning={p.stock < 5} class="stock-tag">
                        {p.stock > 0 ? `${p.stock} in stock` : 'Out of stock'}
                    </small>
            </button>
            {/each}
            {/if}
        </div>

        <div class="footer-links">
            <a href="/orders" class="secondary-btn">📋 Order History</a>
            <a href="/inventory" class="secondary-btn">⚙️ Manage Inventory</a>
        </div>
    </div>

    <!-- Mobile Backdrop -->
    {#if isCartOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="mobile-backdrop" onclick={() => isCartOpen = false}></div>
    {/if}

    <!-- RIGHT: Cart -->
    <div class="cart-section card" class:open={isCartOpen}>
        <button class="mobile-close-btn" onclick={() => isCartOpen = false} aria-label="Close Cart">✕</button>
        <div class="cart-header">
            <div class="header-content">
                <h2>Current Order</h2>
                <span class="item-count">{cart.length} items</span>
            </div>
        </div>

        <div class="cart-items">
            {#if cart.length === 0}
            <div class="empty-state">
                <p>Your cart is empty</p>
                <small>Select products from the catalog</small>
            </div>
            {/if}
            {#each cart as item, i}
            <div class="cart-row">
                <div class="row-info">
                    <strong>{item.product.name}</strong>
                    <div class="qty-control">
                        <span>Rp {item.product.price.toFixed(2)} ×</span>
                        <input type="number" value={item.qty} min="0" max={item.product.stock} oninput={(e)=>
                        updateCartQty(i, parseInt(e.currentTarget.value) || 0)} />
                    </div>
                </div>
                <div class="row-total">
                    <span class="subtotal">Rp {(item.product.price * item.qty).toFixed(2)}</span>
                    <button class="del-btn" onclick={()=> removeFromCart(i)} title="Remove">✕</button>
                </div>
            </div>
            {/each}
        </div>

        <div class="cart-footer">
            <div class="customer-input">
                <label for="customerName">Customer Name</label>
                <input 
                    id="customerName"
                    type="text" 
                    placeholder="Enter customer name..." 
                    bind:value={customerName}
                    class="customer-name-input"
                />
            </div>
            <div class="summary-line">
                <span>Total Amount:</span>
                <span class="grand-total">Rp {total.toFixed(2)}</span>
            </div>
            <button class="checkout-btn primary-btn" onclick={checkout} disabled={cart.length===0}>
                Place Order & Print Receipt
            </button>
        </div>
    </div>
</div>

<!-- Mobile Cart Toggle -->
<div class="mobile-cart-toggle">
    <button class="primary-btn toggle-btn" onclick={() => isCartOpen = true}>
        <div class="toggle-content">
            <span>🛒 {cart.length} items</span>
            <span class="toggle-total">Rp {total.toFixed(2)}</span>
        </div>
    </button>
</div>

<!-- RECEIPT MODAL -->
{#if showReceipt}
<div class="modal-overlay">
    <div class="receipt-paper">
        <div class="receipt-header">
            <h2>Arafah POS</h2>
            <p class="order-id">Order ID: #{lastOrderId}</p>
            <p class="customer-name">Customer: {lastCustomerName}</p>
            <p class="date">{new Date().toLocaleString()}</p>
        </div>
        <div class="receipt-content">
            {#each cart as item}
            <div class="receipt-row">
                <span>{item.product.name} (x{item.qty})</span>
                <span>Rp {(item.product.price * item.qty).toFixed(2)}</span>
            </div>
            {/each}
        </div>
        <div class="receipt-footer">
            <div class="final-total">
                <span>TOTAL PAID</span>
                <span>Rp {total.toFixed(2)}</span>
            </div>
            <p class="thanks">Thank you for your business!</p>
        </div>
        <div class="no-print actions">
            <button class="primary-btn" onclick={printReceipt}>🖨️ Print</button>
            <button class="secondary-btn" onclick={()=> showReceipt = false}>Close</button>
        </div>
    </div>
</div>
{/if}

<style>
    :global(body) {
        margin: 0;
        padding: 0;
        background: #f8f9fa;
        color: #2d3748;
    }

    .pos-wrapper {
        display: flex;
        height: 100vh;
        font-family: 'Inter', system-ui, sans-serif;
        gap: 20px;
        padding: 20px;
        box-sizing: border-box;
    }

    /* Right Section (Cart) */
    .cart-section {
        width: 400px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .cart-header {
        padding: 24px;
        border-bottom: 1px solid #edf2f7;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .cart-header h2 {
        margin: 0;
        font-size: 1.25rem;
    }

    .header-content {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
    }

    /* Base state: Hidden components */
    .mobile-backdrop,
    .mobile-cart-toggle,
    .mobile-close-btn {
        display: none;
    }

    @media (max-width: 1024px) {
        .pos-wrapper {
            padding: 10px;
            gap: 10px;
            padding-bottom: 80px; 
            /* On mobile, wrapper is just for catalog */
            overflow-x: hidden;
        }

        /* 1. Backdrop */
        .mobile-backdrop {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.6);
            z-index: 9998;
            backdrop-filter: blur(2px);
        }
        
        /* 2. Cart Section (Modal) */
        .cart-section {
            display: none; /* Hidden by default */
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90%;
            height: auto;
            //max-height: 85vh;
            z-index: 9999; /* Topmost */
            margin: 0;
            border-radius: 12px;
            flex-direction: column;
            box-shadow: 0 20px 50px rgba(0,0,0,0.3);
            background: white;
            order: unset; /* Remove order from tablet query inheritance */
        }

        /* SHOW CART WHEN OPEN */
        .cart-section.open {
            display: flex;
        }

        .cart-header {
            padding: 15px;
            background: #fff;
            border-radius: 12px 12px 0 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: relative;
        }

        .header-content {
            padding-right: 40px; 
        }

        /* 3. Close Button (Direct child of cart-section) */
        .mobile-close-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f1f5f9;
            border: 2px solid #fff;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            font-size: 1.25rem;
            cursor: pointer;
            color: #4a5568;
            position: absolute;
            right: 10px;
            top: 10px;
            z-index: 10000;
            pointer-events: auto;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        
        .mobile-close-btn:active {
            background: #e2e8f0;
            transform: scale(0.95);
        }

        /* 4. Toggle Button (Bottom) */
        .mobile-cart-toggle {
            display: block;
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            width: 90%;
            max-width: 400px;
            z-index: 1000;
        }

        .grid {
            grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
            gap: 10px;
        }

        .product-card {
            padding: 12px;
        }
        
        /* Fix overlapping content in catalog */
        .catalog-section {
            order: 1; /* Reset order to normal */
        }

        .toggle-btn {
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .toggle-content {
            display: flex;
            justify-content: space-between;
            width: 100%;
            align-items: center;
        }

        .toggle-total {
            font-size: 1.1em;
            background: rgba(255, 255, 255, 0.2);
            padding: 2px 8px;
            border-radius: 4px;
        }

        .header-card {
            padding: 15px;
        }

        .grid {
            grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
            gap: 10px;
        }

        .product-card {
            padding: 15px;
        }

        .header-row h1 {
            font-size: 1.25rem;
        }
    }

    @media (max-width: 480px) {
        .grid {
            grid-template-columns: repeat(2, 1fr);
        }

        .cart-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 10px;
        }

        .row-total {
            width: 100%;
            justify-content: space-between;
        }

        .footer-links {
            flex-direction: column;
        }

        .secondary-btn {
            width: 100%;
            text-align: center;
        }
    }

    .card {
        background: white;
        border-radius: 12px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        border: 1px solid #edf2f7;
    }

    /* Modal & Receipt */
    .catalog-section {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 20px;
        overflow: hidden;
    }

    .header-card {
        padding: 20px;
    }

    .header-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 20px;
    }

    .header-row h1 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 700;
        color: #1a202c;
    }

    .search-bar {
        flex: 1;
        max-width: 400px;
        padding: 12px 16px;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        font-size: 15px;
        transition: all 0.2s;
    }

    .search-bar:focus {
        outline: none;
        border-color: #3182ce;
        box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.2);
    }

    /* Grid */
    .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 16px;
        overflow-y: auto;
        padding-right: 5px;
    }

    .product-card {
        padding: 20px;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        text-align: left;
        transition: transform 0.15s, border-color 0.15s;
        border: 1px solid #edf2f7;
    }

    .product-card:hover:not(:disabled) {
        border-color: #3182ce;
        transform: translateY(-2px);
    }

    .product-card:active:not(:disabled) {
        transform: scale(0.97);
    }

    .p-info h3 {
        margin: 0 0 8px 0;
        font-size: 1rem;
        color: #2d3748;
    }

    .price {
        font-size: 1.15rem;
        font-weight: 700;
        color: #2b6cb0;
    }

    .stock-tag {
        margin-top: 15px;
        font-size: 0.8rem;
        padding: 4px 8px;
        background: #f1f5f9;
        border-radius: 4px;
        align-self: flex-start;
    }

    .warning {
        background: #fff5f5;
        color: #c53030;
        font-weight: 600;
    }

    .out-of-stock {
        opacity: 0.6;
        cursor: not-allowed;
        background: #f8fafc;
    }

    .item-count {
        background: #edf2f7;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 0.85rem;
        font-weight: 600;
    }

    .cart-items {
        flex: 1;
        padding: 10px 24px;
    }

    .cart-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 0;
        border-bottom: 1px solid #f1f5f9;
    }

    .qty-control {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 5px;
    }

    .qty-control input {
        width: 55px;
        padding: 4px 8px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        font-size: 0.9rem;
        text-align: center;
    }

    .subtotal {
        font-weight: 600;
        font-size: 1rem;
    }

    .row-total {
        display: flex;
        align-items: center;
        gap: 15px;
    }

    .del-btn {
        background: #fff5f5;
        border: none;
        color: #e53e3e;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.75rem;
        transition: all 0.2s;
    }

    .del-btn:hover {
        background: #e53e3e;
        color: white;
    }

    .cart-footer {
        padding: 24px;
        border-top: 1px solid #edf2f7;
        background: #fcfcfd;
    }

    .customer-input {
        margin-bottom: 20px;
    }

    .customer-input label {
        display: block;
        font-size: 0.85rem;
        font-weight: 600;
        color: #4a5568;
        margin-bottom: 8px;
    }

    .customer-name-input {
        width: 100%;
        padding: 12px 16px;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        font-size: 15px;
        transition: all 0.2s;
        box-sizing: border-box;
    }

    .customer-name-input:focus {
        outline: none;
        border-color: #3182ce;
        box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.2);
    }


    .summary-line {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        margin-bottom: 20px;
    }

    .summary-line span:first-child {
        color: #718096;
        font-weight: 500;
    }

    .grand-total {
        font-size: 1.75rem;
        font-weight: 800;
        color: #1a202c;
    }

    .primary-btn {
        width: 100%;
        padding: 14px;
        background: #3182ce;
        color: white;
        border: none;
        border-radius: 10px;
        font-size: 1rem;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.2s;
    }

    .primary-btn:hover:not(:disabled) {
        background: #2b6cb0;
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

    .footer-links {
        padding: 10px 0;
        display: flex;
        gap: 12px;
    }

    .empty-state {
        text-align: center;
        padding: 60px 20px;
        color: #a0aec0;
    }

    .empty-state p {
        margin: 0;
        font-weight: 600;
    }

    /* Modal & Receipt */
    .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }

    .receipt-paper {
        background: white;
        padding: 40px;
        width: 380px;
        border-radius: 4px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        font-family: 'Courier New', Courier, monospace;
    }

    .receipt-header {
        text-align: center;
        border-bottom: 2px dashed #000;
        padding-bottom: 20px;
        margin-bottom: 20px;
    }

    .receipt-header h2 {
        margin: 0;
    }

    .order-id {
        font-size: 0.9rem;
        margin: 5px 0;
    }

    .date {
        font-size: 0.8rem;
        color: #666;
    }

    .receipt-content {
        margin-bottom: 20px;
    }

    .receipt-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
    }

    .receipt-footer {
        border-top: 2px dashed #000;
        padding-top: 20px;
        text-align: center;
    }

    .final-total {
        display: flex;
        justify-content: space-between;
        font-weight: 900;
        font-size: 1.25rem;
        margin-bottom: 20px;
    }

    .thanks {
        font-style: italic;
        margin-top: 20px;
    }

    .actions {
        margin-top: 30px;
        display: flex;
        gap: 12px;
    }

    @media print {
        /* Reset all styling for print */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        html, body {
            width: 100%;
            height: auto;
            margin: 0;
            padding: 0;
            overflow: visible;
        }

        /* Hide everything on the page */
        .pos-wrapper {
            display: none !important;
        }
        
        .mobile-cart-toggle {
            display: none !important;
        }

        /* Show only the receipt */
        .modal-overlay {
            position: static !important;
            background: white !important;
            backdrop-filter: none !important;
            display: block !important;
            width: 100% !important;
            height: auto !important;
            inset: auto !important;
        }

        .receipt-paper {
            width: 100% !important;
            max-width: 80mm !important;
            margin: 0 auto !important;
            padding: 20px !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            page-break-inside: avoid;
        }

        .receipt-header,
        .receipt-content,
        .receipt-footer {
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
        }

        .receipt-row {
            display: flex !important;
            visibility: visible !important;
        }

        /* Hide print/close buttons */
        .no-print {
            display: none !important;
        }

        /* Ensure text is visible */
        .receipt-paper * {
            color: #000 !important;
            background: transparent !important;
        }

        /* Mobile print fixes */
        @page {
            margin: 0.5cm;
            size: auto;
        }
    }
</style>
<script lang="ts">
    import { formatMoney } from "$lib/domain/money";

    let {
        orderId,
        customerName,
        date,
        items,
        total,
        onPrint,
        onClose
    }: {
        orderId: number | string;
        customerName: string;
        date: Date;
        items: { name: string; price: number; quantity: number }[];
        total: number;
        onPrint: () => void;
        onClose: () => void;
    } = $props();
</script>

<!--
    Renders from the order's own immutable snapshot (fields passed in),
    never live cart/product state — a reopened historical order must show
    exactly what it showed at checkout, even if that product's price or
    name has since changed (AE1, R4).
-->
<div class="modal-overlay">
    <div class="receipt-paper">
        <div class="receipt-header">
            <h2>Arafah POS</h2>
            <p class="order-id">Order ID: #{orderId}</p>
            <p class="customer-name">Customer: {customerName}</p>
            <p class="date">{date.toLocaleString()}</p>
        </div>
        <div class="receipt-content">
            {#each items as item}
            <div class="receipt-row">
                <span>{item.name} (x{item.quantity})</span>
                <span>{formatMoney(item.price * item.quantity)}</span>
            </div>
            {/each}
        </div>
        <div class="receipt-footer">
            <div class="final-total">
                <span>TOTAL PAID</span>
                <span>{formatMoney(total)}</span>
            </div>
            <p class="thanks">Thank you for your business!</p>
        </div>
        <div class="no-print actions">
            <button class="primary-btn" onclick={onPrint}>🖨️ Print</button>
            <button class="secondary-btn" onclick={onClose}>Close</button>
        </div>
    </div>
</div>

<style>
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
        max-width: 90vw;
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

    /* Receipt-specific print styling only. Hiding the rest of the host
       page is deliberately NOT done here — this codebase already had a
       fiddly cross-device print history (see git log), and a generic
       visibility:hidden-on-everything trick can leave invisible-but-
       still-laid-out content behind, producing blank extra pages. Each
       host page (checkout, order history) hides its own non-receipt
       content explicitly with display:none in its own print media query,
       same as before this component existed. */
    @media print {
        :global(*) {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        :global(html),
        :global(body) {
            width: 100%;
            height: auto;
            margin: 0;
            padding: 0;
            overflow: visible;
        }

        .modal-overlay {
            position: static !important;
            background: white !important;
            backdrop-filter: none !important;
            display: block !important;
            width: 100% !important;
            height: auto !important;
            inset: auto !important;
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

        .receipt-paper {
            width: 100% !important;
            max-width: 80mm !important;
            margin: 0 auto !important;
            padding: 20px !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            page-break-inside: avoid;
        }

        .no-print {
            display: none !important;
        }

        .receipt-paper * {
            color: #000 !important;
            background: transparent !important;
        }

        @page {
            margin: 0.5cm;
            size: auto;
        }
    }
</style>

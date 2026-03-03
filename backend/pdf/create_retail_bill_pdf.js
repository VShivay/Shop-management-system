const PDFDocument = require('pdfkit');
const db = require('../db');
const { formatCurrency } = require('../utils/formatters');

exports.generateRetailBillPDF = async (req, res) => {
    const { billId } = req.params;

    try {
        const billQuery = `
            SELECT rb.*, c.customer_name, c.phone, c.address, c.email,
                   pm.method_name, u.name AS cashier_name
            FROM retail_bills rb
            LEFT JOIN customers c   ON rb.customer_id        = c.customer_id
            LEFT JOIN payment_methods pm ON rb.payment_method_id = pm.payment_method_id
            LEFT JOIN users u        ON rb.created_by         = u.user_id
            WHERE rb.retail_bill_id = $1`;

        const itemsQuery = `
            SELECT rbi.*, p.product_name, un.unit_name
            FROM retail_bill_items rbi
            JOIN products p      ON rbi.product_id = p.product_id
            LEFT JOIN units un   ON p.unit_id      = un.unit_id
            WHERE rbi.retail_bill_id = $1`;

        const [billRes, itemsRes] = await Promise.all([
            db.query(billQuery,  [billId]),
            db.query(itemsQuery, [billId])
        ]);

        if (billRes.rows.length === 0) return res.status(404).json({ error: 'Bill not found' });

        const bill  = billRes.rows[0];
        const items = itemsRes.rows;

        const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=RetailBill_${bill.bill_number}.pdf`);
        doc.pipe(res);

        buildRetailPDF(doc, bill, items);

        doc.end();

    } catch (err) {
        console.error("PDF Generation Error:", err);
        if (!res.headersSent) res.status(500).send("Could not generate PDF");
    }
};

// ─────────────────────────────────────────────────────────────────────────────
function buildRetailPDF(doc, bill, items) {

    const C = {
        ink:        '#1a1a2e',   // deep navy
        accent:     '#4f46e5',   // indigo
        accentSoft: '#eef2ff',   // light indigo row fill
        success:    '#16a34a',   // green
        danger:     '#dc2626',   // red
        muted:      '#6b7280',   // grey
        border:     '#e5e7eb',
        white:      '#ffffff',
        page:       '#f9fafb',
    };

    // ── PAGE BACKGROUND ──────────────────────────────────────────────────────
    doc.rect(0, 0, 595, 842).fill(C.page);

    // ── HEADER BAND ──────────────────────────────────────────────────────────
    doc.rect(0, 0, 595, 150).fill(C.ink);
    doc.rect(0, 0, 6, 150).fill(C.accent);

    // "RECEIPT" wordmark (retail uses Receipt label)
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(36)
       .text('RECEIPT', 30, 40, { characterSpacing: 4 });

    // Bill meta — left
    doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(9)
       .text('BILL NO', 30, 90);
    doc.fillColor(C.white).font('Helvetica').fontSize(9)
       .text(`#${bill.bill_number}`, 30, 103);

    doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(9)
       .text('DATE', 150, 90);
    doc.fillColor(C.white).font('Helvetica').fontSize(9)
       .text(new Date(bill.bill_date).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }), 150, 103);

    // Company info — right
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(16)
       .text('Shree Vishwakarma Krupa', 300, 48, { width: 265, align: 'right' });
    doc.fillColor(C.accent).font('Helvetica').fontSize(9)
       .text('www.mycompany.com  ·  +123-456-7890', 300, 70, { width: 265, align: 'right' });
    doc.fillColor(C.muted).font('Helvetica').fontSize(8)
       .text('123 Anywhere St., Any City', 300, 84, { width: 265, align: 'right' });

    // ── INFO CARDS ────────────────────────────────────────────────────────────
    const cardY = 168;

    // ── Left card: Billed To ──
    doc.roundedRect(30, cardY, 300, 100, 8).fill(C.white);
    doc.rect(30, cardY, 4, 100).fill(C.accent);

    doc.fillColor(C.muted).font('Helvetica-Bold').fontSize(7.5)
       .text('BILLED TO', 44, cardY + 14, { characterSpacing: 1 });

    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(14)
       .text(bill.customer_name || 'Walk-in Customer', 44, cardY + 26, { width: 270 });

    doc.fillColor(C.muted).font('Helvetica').fontSize(8.5)
       .text(bill.email   || '—', 44, cardY + 50)
       .text(bill.address || '—', 44, cardY + 63)
       .text(bill.phone   || '—', 44, cardY + 76);

    // ── Right card: Payment info ──
    const statusColors = { paid: C.success, partial: '#d97706', unpaid: C.danger };
    const statusBg     = { paid: '#dcfce7',  partial: '#fef3c7', unpaid: '#fee2e2' };
    const status = (bill.payment_status || 'paid').toLowerCase();

    doc.roundedRect(345, cardY, 220, 100, 8).fill(C.white);

    doc.fillColor(C.muted).font('Helvetica-Bold').fontSize(7.5)
       .text('PAYMENT STATUS', 360, cardY + 14, { characterSpacing: 1 });

    doc.roundedRect(360, cardY + 28, 90, 22, 4).fill(statusBg[status] || statusBg.paid);
    doc.fillColor(statusColors[status] || C.success).font('Helvetica-Bold').fontSize(9)
       .text(status.toUpperCase(), 360, cardY + 34, { width: 90, align: 'center' });

    doc.fillColor(C.muted).font('Helvetica').fontSize(8)
       .text(`Method: ${bill.method_name || 'N/A'}`, 360, cardY + 60)
       .text(`Cashier: ${bill.cashier_name || 'Admin'}`, 360, cardY + 74);

    // ── TABLE ─────────────────────────────────────────────────────────────────
    const tX     = 30;
    const tWidth = 535;

    // Column X positions
    const col = {
        name:      tX + 14,       // Product name
        qty:       tX + 230,      // Qty + unit
        price:     tX + 300,      // Unit price
        discount:  tX + 375,      // Discount
        total:     tX + 465,      // Line total
    };

    let y = cardY + 120;

    // Table header
    doc.roundedRect(tX, y, tWidth, 28, 4).fill(C.ink);
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(8.5);
    doc.text('PRODUCT',    col.name,     y + 9);
    doc.text('QTY',        col.qty,      y + 9, { width: 55,  align: 'center' });
    doc.text('UNIT PRICE', col.price,    y + 9, { width: 65,  align: 'right' });
    doc.text('DISCOUNT',   col.discount, y + 9, { width: 70,  align: 'right' });
    doc.text('TOTAL',      col.total,    y + 9, { width: 60,  align: 'right' });
    y += 28;

    let grandTotal    = 0;
    let grandDiscount = 0;

    items.forEach((item, idx) => {
        const rowH = 28;

        // Page break
        if (y + rowH > 760) {
            doc.addPage();
            doc.rect(0, 0, 595, 842).fill(C.page);
            y = 40;
        }

        const unitPrice  = parseFloat(item.unit_price)  || 0;
        const qty        = parseFloat(item.quantity)     || 0;
        const totalPrice = parseFloat(item.total_price)  || 0;

        const itemDiscount = Math.max(0, (unitPrice * qty) - totalPrice);
        const discountPct  = (unitPrice * qty) > 0 ? (itemDiscount / (unitPrice * qty)) * 100 : 0;

        grandTotal    += totalPrice;
        grandDiscount += itemDiscount;

        // Alternating rows
        doc.rect(tX, y, tWidth, rowH).fill(idx % 2 === 0 ? C.accentSoft : C.white);

        const midY = y + (rowH - 10) / 2;
        const qtyLabel = `${qty % 1 === 0 ? qty.toFixed(0) : qty} ${item.unit_name || ''}`.trim();

        doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(9)
           .text(item.product_name, col.name, midY, { width: 210, ellipsis: true });

        doc.fillColor(C.muted).font('Helvetica').fontSize(8.5)
           .text(qtyLabel, col.qty, midY, { width: 55, align: 'center' });

        doc.fillColor(C.muted).font('Helvetica').fontSize(8.5)
           .text(`Rs.${formatCurrency(unitPrice)}`, col.price, midY, { width: 65, align: 'right' });

        if (itemDiscount > 0) {
            doc.fillColor(C.danger).font('Helvetica-Bold').fontSize(8)
               .text(`-${discountPct.toFixed(0)}% (Rs.${formatCurrency(itemDiscount)})`, col.discount, midY, { width: 75, align: 'right' });
        } else {
            doc.fillColor(C.muted).font('Helvetica').fontSize(8.5)
               .text('—', col.discount, midY, { width: 75, align: 'right' });
        }

        doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(9)
           .text(`Rs.${formatCurrency(totalPrice)}`, col.total, midY, { width: 60, align: 'right' });

        y += rowH;
    });

    // Bottom table border
    doc.moveTo(tX, y).lineTo(tX + tWidth, y).lineWidth(1).strokeColor(C.border).stroke();

    // ── TOTALS SECTION ────────────────────────────────────────────────────────
    y += 18;

    const totalsX      = 330;
    const totalsW      = 235;
    const totalsLabelX = totalsX + 14;
    const totalsValX   = totalsX + totalsW - 14;

    const totalAmount = parseFloat(bill.total_amount || grandTotal);
    const subtotal    = parseFloat(bill.subtotal     || (grandTotal + grandDiscount));

    // Outer card
    doc.roundedRect(totalsX, y, totalsW, 118, 8).fill(C.white);

    const rowLine = (label, value, labelColor, valueColor, bold, lineY) => {
        doc.fillColor(labelColor).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
           .text(label, totalsLabelX, lineY);
        doc.fillColor(valueColor).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
           .text(value, totalsValX - 70, lineY, { width: 70, align: 'right' });
    };

    let ty = y + 14;
    rowLine('Subtotal (before discount)', `Rs.${formatCurrency(subtotal)}`,       C.muted, C.ink,     false, ty); ty += 20;
    rowLine('Total Discount',             `-Rs.${formatCurrency(grandDiscount)}`,  C.muted, C.danger,  false, ty); ty += 2;

    // Divider
    doc.moveTo(totalsX + 10, ty + 12).lineTo(totalsX + totalsW - 10, ty + 12)
       .lineWidth(0.5).strokeColor(C.border).stroke();
    ty += 20;

    rowLine('Grand Total', `Rs.${formatCurrency(totalAmount)}`, C.ink, C.accent, true, ty); ty += 22;

    // Grand total highlight strip
    doc.roundedRect(totalsX + 8, ty + 8, totalsW - 16, 24, 4).fill(C.accentSoft);
    doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(9)
       .text(`Payment: ${bill.method_name || 'N/A'}`, totalsLabelX, ty + 14)
       .text('PAID', totalsValX - 30, ty + 14, { width: 30, align: 'right' });

    // ── PREPARED BY ───────────────────────────────────────────────────────────
    const cashier = bill.cashier_name || 'Administrator';
    doc.fillColor(C.muted).font('Helvetica').fontSize(8)
       .text('Prepared by: ', tX, y + 14);
    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(8)
       .text(cashier, tX + 57, y + 14);

    // ── FOOTER BAND ───────────────────────────────────────────────────────────
    const fY = 800;
    doc.rect(0, fY, 595, 42).fill(C.ink);
    doc.rect(0, fY, 6, 42).fill(C.accent);

    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(9)
       .text('Shree Vishwakarma Krupa', 22, fY + 8);
    doc.fillColor(C.muted).font('Helvetica').fontSize(7.5)
       .text('123 Anywhere St. · www.mycompany.com · +123-456-7890', 22, fY + 21);

    doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(9)
       .text('Thank you for shopping with us!', 0, fY + 14, { width: 575, align: 'right' });
}
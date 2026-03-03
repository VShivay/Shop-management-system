const PDFDocument = require('pdfkit');
const { formatCurrency } = require('../utils/formatters');

function buildPDF(dataCallback, endCallback, bill, items) {
    const doc = new PDFDocument({
        size: 'A4',
        margin: 0,
        bufferPages: true
    });

    doc.on('data', dataCallback);
    doc.on('end', endCallback);

    const C = {
        ink:        '#1a1a2e',   // deep navy – headings
        accent:     '#4f46e5',   // indigo – key highlights
        accentSoft: '#eef2ff',   // very light indigo – row fills
        success:    '#16a34a',   // green – paid
        danger:     '#dc2626',   // red – balance due
        muted:      '#6b7280',   // grey – secondary text
        border:     '#e5e7eb',   // light grey – lines
        white:      '#ffffff',
        page:       '#f9fafb',   // off-white page background
    };

    // ── PAGE BACKGROUND ──────────────────────────────────────────────────────
    doc.rect(0, 0, 595, 842).fill(C.page);

    // ── HEADER BAND ──────────────────────────────────────────────────────────
    doc.rect(0, 0, 595, 150).fill(C.ink);

    // accent bar on left edge
    doc.rect(0, 0, 6, 150).fill(C.accent);

    // INVOICE wordmark
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(36)
       .text('INVOICE', 30, 40, { characterSpacing: 4 });

    // invoice meta
    doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(9)
       .text('INVOICE NO', 30, 90);
    doc.fillColor(C.white).font('Helvetica').fontSize(9)
       .text(`#${bill.bill_number}`, 30, 103);

    doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(9)
       .text('DATE', 150, 90);
    doc.fillColor(C.white).font('Helvetica').fontSize(9)
       .text(new Date(bill.bill_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 150, 103);

    // company name (right-aligned)
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(16)
       .text('My Wholesale Co.', 300, 48, { width: 265, align: 'right' });
    doc.fillColor(C.accent).font('Helvetica').fontSize(9)
       .text('www.mycompany.com  ·  +123-456-7890', 300, 70, { width: 265, align: 'right' });
    doc.fillColor(C.muted).font('Helvetica').fontSize(8)
       .text('123 Anywhere St., Any City', 300, 84, { width: 265, align: 'right' });

    // ── BILLED TO / STATUS CARD ───────────────────────────────────────────────
    const cardY = 168;

    // Bill-to card
    doc.roundedRect(30, cardY, 300, 100, 8).fill(C.white);
    // left accent strip
    doc.rect(30, cardY, 4, 100).fill(C.accent);

    doc.fillColor(C.muted).font('Helvetica-Bold').fontSize(7.5)
       .text('BILLED TO', 44, cardY + 14, { characterSpacing: 1 });

    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(14)
       .text(bill.customer_name, 44, cardY + 26, { width: 270 });

    doc.fillColor(C.muted).font('Helvetica').fontSize(8.5)
       .text(bill.email   || '—', 44, cardY + 50)
       .text(bill.address || '—', 44, cardY + 63)
       .text(bill.phone   || '—', 44, cardY + 76);

    // Payment status badge
    const statusColors = { paid: C.success, partial: '#d97706', unpaid: C.danger };
    const statusBg = { paid: '#dcfce7', partial: '#fef3c7', unpaid: '#fee2e2' };
    const status = (bill.payment_status || 'unpaid').toLowerCase();
    doc.roundedRect(345, cardY, 220, 100, 8).fill(C.white);

    doc.fillColor(C.muted).font('Helvetica-Bold').fontSize(7.5)
       .text('PAYMENT STATUS', 360, cardY + 14, { characterSpacing: 1 });

    doc.roundedRect(360, cardY + 28, 90, 22, 4).fill(statusBg[status] || statusBg.unpaid);
    doc.fillColor(statusColors[status] || C.danger).font('Helvetica-Bold').fontSize(9)
       .text(status.toUpperCase(), 360, cardY + 34, { width: 90, align: 'center' });

    doc.fillColor(C.muted).font('Helvetica').fontSize(8)
       .text(`Method: ${bill.payment_method || 'N/A'}`, 360, cardY + 60)
       .text(`Created by: ${bill.creator_name || 'Admin'}`, 360, cardY + 74);

    // ── TABLE ─────────────────────────────────────────────────────────────────
    const tX      = 30;
    const tWidth  = 535;
    const col = {
        name:      tX + 14,
        price:     tX + 220,
        discount:  tX + 305,
        afterDisc: tX + 390,
        total:     tX + 465,
    };

    let y = cardY + 120;

    // Table header background
    doc.roundedRect(tX, y, tWidth, 28, 4).fill(C.ink);

    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(8.5);
    doc.text('PRODUCT',         col.name,      y + 9);
    doc.text('UNIT PRICE',      col.price,     y + 9, { width: 70, align: 'right' });
    doc.text('DISCOUNT',        col.discount,  y + 9, { width: 70, align: 'right' });
    doc.text('NET PRICE',       col.afterDisc, y + 9, { width: 65, align: 'right' });
    doc.text('TOTAL',           col.total,     y + 9, { width: 60, align: 'right' });

    y += 28;

    // Rows
    let grandTotal    = 0;
    let grandDiscount = 0;

    items.forEach((item, idx) => {
        const rowH = 28;

        if (y + rowH > 760) {
            doc.addPage();
            doc.rect(0, 0, 595, 842).fill(C.page);
            y = 40;
        }

        const unitPrice  = parseFloat(item.unit_price)   || 0;
        const qty        = parseFloat(item.quantity)      || 0;
        const totalPrice = parseFloat(item.total_price)   || 0;

        // Per-item discount = (unit_price × qty) − total_price
        const itemDiscount  = Math.max(0, (unitPrice * qty) - totalPrice);
        const netUnitPrice  = qty > 0 ? totalPrice / qty : unitPrice;
        const discountPct   = unitPrice > 0 ? ((itemDiscount / (unitPrice * qty)) * 100) : 0;

        grandTotal    += totalPrice;
        grandDiscount += itemDiscount;

        // alternating row fill
        if (idx % 2 === 0) {
            doc.rect(tX, y, tWidth, rowH).fill(C.accentSoft);
        } else {
            doc.rect(tX, y, tWidth, rowH).fill(C.white);
        }

        const midY = y + (rowH - 10) / 2;

        doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(9)
           .text(item.product_name, col.name, midY, { width: 195, ellipsis: true });

        doc.fillColor(C.muted).font('Helvetica').fontSize(8.5)
           .text(`Rs.${formatCurrency(unitPrice)}`, col.price, midY, { width: 70, align: 'right' });

        // discount pill
        if (itemDiscount > 0) {
            doc.fillColor('#dc2626').font('Helvetica-Bold').fontSize(8)
               .text(`-${discountPct.toFixed(0)}%  (Rs.${formatCurrency(itemDiscount)})`, col.discount, midY, { width: 75, align: 'right' });
        } else {
            doc.fillColor(C.muted).font('Helvetica').fontSize(8.5)
               .text('—', col.discount, midY, { width: 75, align: 'right' });
        }

        doc.fillColor(C.ink).font('Helvetica').fontSize(8.5)
           .text(`Rs.${formatCurrency(netUnitPrice)}`, col.afterDisc, midY, { width: 65, align: 'right' });

        doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(9)
           .text(`Rs.${formatCurrency(totalPrice)}`, col.total, midY, { width: 60, align: 'right' });

        y += rowH;
    });

    // bottom table border
    doc.moveTo(tX, y).lineTo(tX + tWidth, y).lineWidth(1).strokeColor(C.border).stroke();

    // ── TOTALS SECTION ────────────────────────────────────────────────────────
    y += 18;

    const totalsX     = 330;
    const totalsW     = 235;
    const totalsLabelX = totalsX + 14;
    const totalsValX   = totalsX + totalsW - 14;

    const totalAmount = parseFloat(bill.total_amount || grandTotal);
    const paidAmount  = parseFloat(bill.amount_paid  || 0);
    const dueAmount   = totalAmount - paidAmount;

    // outer card
    doc.roundedRect(totalsX, y, totalsW, 140, 8).fill(C.white);

    const rowLine = (label, value, labelColor, valueColor, bold, lineY) => {
        doc.fillColor(labelColor).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
           .text(label, totalsLabelX, lineY);
        doc.fillColor(valueColor).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
           .text(value, totalsValX - 70, lineY, { width: 70, align: 'right' });
    };

    let ty = y + 14;
    rowLine('Subtotal (before discount)', `Rs.${formatCurrency(grandTotal + grandDiscount)}`, C.muted, C.ink, false, ty); ty += 20;
    rowLine('Total Discount',             `-Rs.${formatCurrency(grandDiscount)}`,              C.muted, '#dc2626', false, ty); ty += 2;

    // divider
    doc.moveTo(totalsX + 10, ty + 12).lineTo(totalsX + totalsW - 10, ty + 12).lineWidth(0.5).strokeColor(C.border).stroke();
    ty += 20;

    rowLine('Grand Total',    `Rs.${formatCurrency(totalAmount)}`, C.ink,   C.accent,  true, ty); ty += 22;
    rowLine('Amount Paid',    `Rs.${formatCurrency(paidAmount)}`,  C.muted, C.success, true, ty); ty += 2;

    // balance due highlight strip
    doc.roundedRect(totalsX + 8, ty + 14, totalsW - 16, 24, 4).fill('#fee2e2');
    doc.fillColor(C.danger).font('Helvetica-Bold').fontSize(10)
       .text('Balance Due', totalsLabelX, ty + 20)
       .text(`Rs.${formatCurrency(dueAmount)}`, totalsValX - 80, ty + 20, { width: 80, align: 'right' });

    // ── CREATED BY ────────────────────────────────────────────────────────────
    const createdBy = bill.creator_name || 'Administrator';
    doc.fillColor(C.muted).font('Helvetica').fontSize(8)
       .text(`Prepared by: `, tX, y + 14);
    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(8)
       .text(createdBy, tX + 57, y + 14);

    // ── FOOTER ────────────────────────────────────────────────────────────────
    const fY = 800;
    doc.rect(0, fY, 595, 42).fill(C.ink);
    doc.rect(0, fY, 6, 42).fill(C.accent);

    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(9)
       .text('My Wholesale Co.', 22, fY + 8);
    doc.fillColor(C.muted).font('Helvetica').fontSize(7.5)
       .text('123 Anywhere St. · www.mycompany.com · +123-456-7890', 22, fY + 21);

    doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(9)
       .text('Thank you for your business!', 0, fY + 14, { width: 575, align: 'right' });

    doc.end();
}

module.exports = { buildPDF };

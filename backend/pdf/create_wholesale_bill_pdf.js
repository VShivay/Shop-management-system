const PDFDocument = require('pdfkit');
const path = require('path');
const { formatCurrency } = require('../utils/formatters');

/**
 * Helper to convert English numerals to Gujarati numerals (123 -> ૧૨૩)
 */
const toGujaratiDigits = (num) => {
    if (num === null || num === undefined) return '૦';
    const gujaratiDigits = ['૦', '૧', '૨', '૩', '૪', '૫', '૬', '૭', '૮', '૯'];
    return num.toString().replace(/\d/g, (digit) => gujaratiDigits[digit]);
};

function buildPDF(dataCallback, endCallback, bill, items) {
    const doc = new PDFDocument({
        size: 'A4',
        margin: 0,
        bufferPages: true
    });

    // ── REGISTER GUJARATI FONTS ─────────────────────────────────────────────
    const fontRegular = path.join(__dirname, '../fonts/NotoSansGujarati-Regular.ttf');
    const fontBold = path.join(__dirname, '../fonts/NotoSansGujarati-Bold.ttf');
    
    doc.registerFont('Gujarati', fontRegular);
    doc.registerFont('Gujarati-Bold', fontBold);

    doc.on('data', dataCallback);
    doc.on('end', endCallback);

    const C = {
        ink:        '#1a1a2e',
        accent:     '#4f46e5',
        accentSoft: '#eef2ff',
        success:    '#16a34a',
        danger:     '#dc2626',
        muted:      '#6b7280',
        border:     '#e5e7eb',
        white:      '#ffffff',
        page:       '#f9fafb',
    };

    // ── PAGE BACKGROUND ──────────────────────────────────────────────────────
    doc.rect(0, 0, 595, 842).fill(C.page);

    // ── HEADER BAND ──────────────────────────────────────────────────────────
    doc.rect(0, 0, 595, 150).fill(C.ink);
    doc.rect(0, 0, 6, 150).fill(C.accent);

    doc.fillColor(C.white).font('Gujarati-Bold').fontSize(36)
       .text('ઇનવોઇસ', 30, 40, { characterSpacing: 2 });

    doc.fillColor(C.accent).font('Gujarati-Bold').fontSize(9)
       .text('ઇનવોઇસ નં.', 30, 90);
    doc.fillColor(C.white).font('Gujarati').fontSize(9)
       .text(`#${toGujaratiDigits(bill.bill_number)}`, 30, 103);

    doc.fillColor(C.accent).font('Gujarati-Bold').fontSize(9)
       .text('તારીખ', 150, 90);
    
    const formattedDate = new Date(bill.bill_date).toLocaleDateString('gu-IN', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.fillColor(C.white).font('Gujarati').fontSize(9)
       .text(toGujaratiDigits(formattedDate), 150, 103);

    doc.fillColor(C.white).font('Gujarati-Bold').fontSize(16)
       .text('શ્રી વિશ્વકર્મા કૃપા', 300, 48, { width: 265, align: 'right' });
    doc.fillColor(C.accent).font('Gujarati').fontSize(9)
       .text('www.mycompany.com  ·  ' + toGujaratiDigits('+91 00000 00000'), 300, 70, { width: 265, align: 'right' });
    doc.fillColor(C.muted).font('Gujarati').fontSize(8)
       .text(toGujaratiDigits('૧૨૩ એનીવ્હેર સ્ટ્રીટ, અમદાવાદ'), 300, 84, { width: 265, align: 'right' });

    // ── BILLED TO / STATUS CARD ───────────────────────────────────────────────
    const cardY = 168;

    doc.roundedRect(30, cardY, 300, 100, 8).fill(C.white);
    doc.rect(30, cardY, 4, 100).fill(C.accent);

    doc.fillColor(C.muted).font('Gujarati-Bold').fontSize(7.5)
       .text('ગ્રાહક વિગત', 44, cardY + 14, { characterSpacing: 1 });
    doc.fillColor(C.ink).font('Gujarati-Bold').fontSize(14)
       .text(bill.customer_name, 44, cardY + 26, { width: 270 });
    doc.fillColor(C.muted).font('Gujarati').fontSize(8.5)
       .text(bill.email   || '—', 44, cardY + 50)
       .text(bill.address || '—', 44, cardY + 63)
       .text(toGujaratiDigits(bill.phone || '—'), 44, cardY + 76);

    const statusGujarati = { paid: 'ચૂકવેલ', partial: 'બાકી (અડધું)', unpaid: 'બાકી' };
    const statusColors = { paid: C.success, partial: '#d97706', unpaid: C.danger };
    const statusBg     = { paid: '#dcfce7', partial: '#fef3c7', unpaid: '#fee2e2' };
    const status       = (bill.payment_status || 'unpaid').toLowerCase();

    doc.roundedRect(345, cardY, 220, 100, 8).fill(C.white);
    doc.fillColor(C.muted).font('Gujarati-Bold').fontSize(7.5)
       .text('ચુકવણીની સ્થિતિ', 360, cardY + 14, { characterSpacing: 1 });
    doc.roundedRect(360, cardY + 28, 90, 22, 4).fill(statusBg[status] || statusBg.unpaid);
    doc.fillColor(statusColors[status] || C.danger).font('Gujarati-Bold').fontSize(9)
       .text(statusGujarati[status] || 'બાકી', 360, cardY + 34, { width: 90, align: 'center' });
    doc.fillColor(C.muted).font('Gujarati').fontSize(8)
       .text(`પદ્ધતિ: ${bill.payment_method || 'N/A'}`, 360, cardY + 60)
       .text(`બનાવનાર: ${bill.creator_name || 'એડમિન'}`, 360, cardY + 74);

    // ── TABLE ─────────────────────────────────────────────────────────────────
    const tX     = 30;
    const tWidth = 535;
    const col = {
        name:      tX + 14,
        qty:       tX + 195,
        price:     tX + 255,
        discount:  tX + 330,
        afterDisc: tX + 410,
        total:     tX + 475,
    };

    let y = cardY + 120;

    doc.roundedRect(tX, y, tWidth, 28, 4).fill(C.ink);
    doc.fillColor(C.white).font('Gujarati-Bold').fontSize(8.5);
    doc.text('વસ્તુ',      col.name,      y + 9);
    doc.text('જથ્થો',      col.qty,       y + 9, { width: 45,  align: 'right' });
    doc.text('એકમ ભાવ',   col.price,     y + 9, { width: 60,  align: 'right' });
    doc.text('ડિસ્કાઉન્ટ', col.discount,  y + 9, { width: 68,  align: 'right' });
    doc.text('નેટ ભાવ',    col.afterDisc, y + 9, { width: 55,  align: 'right' });
    doc.text('કુલ',        col.total,     y + 9, { width: 55,  align: 'right' });

    y += 28;

    let grandTotal    = 0;
    let grandDiscount = 0;

    items.forEach((item, idx) => {
        const rowH = 28;
        if (y + rowH > 760) {
            doc.addPage();
            doc.rect(0, 0, 595, 842).fill(C.page);
            y = 40;
        }

        const unitPrice  = parseFloat(item.unit_price)  || 0;
        const qty        = parseFloat(item.quantity)    || 0;
        const totalPrice = parseFloat(item.total_price) || 0;
        const itemDiscount = Math.max(0, (unitPrice * qty) - totalPrice);
        const netUnitPrice = qty > 0 ? totalPrice / qty : unitPrice;
        const discountPct  = (unitPrice * qty) > 0 ? ((itemDiscount / (unitPrice * qty)) * 100) : 0;

        grandTotal    += totalPrice;
        grandDiscount += itemDiscount;

        doc.rect(tX, y, tWidth, rowH).fill(idx % 2 === 0 ? C.accentSoft : C.white);
        const midY = y + (rowH - 10) / 2;

        doc.fillColor(C.ink).font('Gujarati-Bold').fontSize(9)
           .text(item.product_name, col.name, midY, { width: 178, ellipsis: true });

        // Qty in Gujarati
        const unitLabel = item.unit_name ? ` ${item.unit_name}` : '';
        const displayQty = qty % 1 === 0 ? qty.toFixed(0) : qty;
        doc.fillColor(C.ink).font('Gujarati-Bold').fontSize(9)
           .text(`${toGujaratiDigits(displayQty)}${unitLabel}`, col.qty, midY, { width: 45, align: 'right' });

        // Prices in Gujarati
        doc.fillColor(C.muted).font('Gujarati').fontSize(8.5)
           .text(`₹${toGujaratiDigits(formatCurrency(unitPrice))}`, col.price, midY, { width: 60, align: 'right' });

        if (itemDiscount > 0) {
            doc.fillColor('#dc2626').font('Gujarati-Bold').fontSize(7.5)
               .text(`-${toGujaratiDigits(discountPct.toFixed(0))}% (₹${toGujaratiDigits(formatCurrency(itemDiscount))})`, col.discount, midY, { width: 68, align: 'right' });
        } else {
            doc.fillColor(C.muted).font('Gujarati').fontSize(8.5).text('—', col.discount, midY, { width: 68, align: 'right' });
        }

        doc.fillColor(C.ink).font('Gujarati').fontSize(8.5)
           .text(`₹${toGujaratiDigits(formatCurrency(netUnitPrice))}`, col.afterDisc, midY, { width: 55, align: 'right' });

        doc.fillColor(C.ink).font('Gujarati-Bold').fontSize(9)
           .text(`₹${toGujaratiDigits(formatCurrency(totalPrice))}`, col.total, midY, { width: 55, align: 'right' });

        y += rowH;
    });

    doc.moveTo(tX, y).lineTo(tX + tWidth, y).lineWidth(1).strokeColor(C.border).stroke();

    // ── TOTALS SECTION ────────────────────────────────────────────────────────
    y += 18;
    const totalsX      = 330;
    const finalTotal   = parseFloat(bill.total_amount || grandTotal);
    const paidAmount   = parseFloat(bill.amount_paid || 0);
    const dueAmount    = finalTotal - paidAmount;

    doc.roundedRect(totalsX, y, 235, 140, 8).fill(C.white);

    const rowLine = (label, value, labelColor, valueColor, bold, lineY) => {
        doc.fillColor(labelColor).font(bold ? 'Gujarati-Bold' : 'Gujarati').fontSize(9).text(label, totalsX + 14, lineY);
        doc.fillColor(valueColor).font(bold ? 'Gujarati-Bold' : 'Gujarati').fontSize(9)
           .text(`₹${toGujaratiDigits(formatCurrency(value))}`, totalsX + 140, lineY, { width: 80, align: 'right' });
    };

    let ty = y + 14;
    rowLine('રકમ', grandTotal + grandDiscount, C.muted, C.ink, false, ty); ty += 20;
    rowLine('કુલ ડિસ્કાઉન્ટ', grandDiscount, C.muted, '#dc2626', false, ty); ty += 2;

    doc.moveTo(totalsX + 10, ty + 12).lineTo(totalsX + 225, ty + 12).lineWidth(0.5).strokeColor(C.border).stroke();
    ty += 20;

    rowLine('કુલ રકમ', finalTotal, C.ink, C.accent, true, ty); ty += 22;
    rowLine('ચૂકવેલ રકમ', paidAmount, C.muted, C.success, true, ty); ty += 2;

    // Balance Due
    doc.roundedRect(totalsX + 8, ty + 14, 219, 24, 4).fill('#fee2e2');
    doc.fillColor(C.danger).font('Gujarati-Bold').fontSize(10)
       .text('બાકી રકમ', totalsX + 14, ty + 20)
       .text(`₹${toGujaratiDigits(formatCurrency(dueAmount))}`, totalsX + 140, ty + 20, { width: 80, align: 'right' });

    // ── PREPARED BY ───────────────────────────────────────────────────────────
    const createdBy = bill.creator_name || 'એડમિનિસ્ટ્રેટર';
    doc.fillColor(C.muted).font('Gujarati').fontSize(8).text('બનાવનાર: ', tX, y + 14);
    doc.fillColor(C.ink).font('Gujarati-Bold').fontSize(8).text(createdBy, tX + 45, y + 14);

    // ── FOOTER ────────────────────────────────────────────────────────────────
    const fY = 800;
    doc.rect(0, fY, 595, 42).fill(C.ink);
    doc.rect(0, fY, 6, 42).fill(C.accent);

    doc.fillColor(C.white).font('Gujarati-Bold').fontSize(9).text('માય હોલસેલ કંપની', 22, fY + 8);
    doc.fillColor(C.muted).font('Gujarati').fontSize(7.5).text(toGujaratiDigits('૧૨૩ એનીવ્હેર સ્ટ્રીટ · www.mycompany.com · +91 00000 00000'), 22, fY + 21);
    doc.fillColor(C.accent).font('Gujarati-Bold').fontSize(9).text('તમારા વ્યવસાય માટે આભાર!', 0, fY + 14, { width: 575, align: 'right' });

    doc.end();
}

module.exports = { buildPDF };
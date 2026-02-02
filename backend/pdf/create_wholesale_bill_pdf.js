const PDFDocument = require('pdfkit');

function buildPDF(dataCallback, endCallback, bill, items) {
    const doc = new PDFDocument({ 
        size: 'A4', 
        margin: 0, 
        bufferPages: true 
    });

    doc.on('data', dataCallback);
    doc.on('end', endCallback);

    const colors = {
        primaryBlue: '#1e3c72',
        accentRed: '#e94057',
        textDark: '#2c3e50',
        textLight: '#ffffff',
        textGrey: '#7f8c8d',
        lightBg: '#f3f5f9'
    };

    // --- 1. DRAW BACKGROUND GRAPHICS ---
    drawHeaderBackground(doc, colors);
    drawFooterBackground(doc, colors);

    // --- 2. HEADER CONTENT ---
    doc.fillColor(colors.textLight)
       .font('Helvetica-Bold')
       .fontSize(40)
       .text('INVOICE', 50, 60, { letterSpacing: 2 });

    doc.fontSize(10)
       .font('Helvetica')
       .text(`INVOICE NO: ${bill.bill_number}`, 50, 110)
       .text(new Date(bill.bill_date).toLocaleDateString(), 50, 125);

    doc.fontSize(16)
       .text('My Wholesale Co.', 350, 60, { align: 'right', width: 200 })
       .fontSize(10)
       .text('Contractor', 350, 80, { align: 'right', width: 200 });

    // --- 3. CUSTOMER CARD ---
    const cardTop = 170;
    
    doc.roundedRect(40, cardTop, 515, 100, 15).fill(colors.textLight);

    doc.fillColor(colors.primaryBlue)
       .fontSize(10)
       .font('Helvetica-Bold')
       .text('Invoice to:', 60, cardTop + 20);

    doc.fontSize(20)
       .text(bill.customer_name, 60, cardTop + 35);

    doc.fillColor(colors.textGrey)
       .fontSize(9)
       .font('Helvetica')
       .text(bill.email || 'email@example.com', 300, cardTop + 30, { align: 'right', width: 230 })
       .text(bill.address || 'Address Line 1', 300, cardTop + 45, { align: 'right', width: 230 })
       .text(bill.phone || 'Phone Number', 300, cardTop + 60, { align: 'right', width: 230 });

    // --- 4. TABLE HEADERS ---
    const tableTop = 320;
    const descX = 60;
    const qtyX = 300;
    const costX = 370;
    const totalX = 460;

    doc.moveTo(50, tableTop - 10).lineTo(545, tableTop - 10).lineWidth(2).strokeColor(colors.primaryBlue).stroke();
    doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).lineWidth(1).strokeColor(colors.primaryBlue).stroke();

    doc.fillColor(colors.primaryBlue).fontSize(10).font('Helvetica-Bold');
    doc.text('Description', descX, tableTop);
    doc.text('Qty', qtyX, tableTop, { align: 'center', width: 40 });
    doc.text('Cost', costX, tableTop, { align: 'right', width: 70 });
    doc.text('Subtotal', totalX, tableTop, { align: 'right', width: 70 });

    // --- 5. TABLE ITEMS ---
    let y = tableTop + 30;
    doc.font('Helvetica').fontSize(10).fillColor(colors.textDark);

    items.forEach((item) => {
        if (y > 650) {
            doc.addPage();
            drawHeaderBackground(doc, colors);
            drawFooterBackground(doc, colors);
            y = 100;
        }

        const unitPrice = parseFloat(item.unit_price).toFixed(2);
        const lineTotal = parseFloat(item.total_price).toFixed(2);

        doc.text(item.product_name, descX, y, { width: 220 });
        doc.text(item.quantity, qtyX, y, { align: 'center', width: 40 });
        doc.text(`$${unitPrice}`, costX, y, { align: 'right', width: 70 });
        doc.text(`$${lineTotal}`, totalX, y, { align: 'right', width: 70 });

        y += 25;
    });

    // --- 6. TOTALS ---
    doc.moveTo(50, y).lineTo(545, y).lineWidth(1).strokeColor('#e0e0e0').stroke();
    y += 20;

    const totalAmount = parseFloat(bill.total_amount || 0);
    const paidAmount = parseFloat(bill.amount_paid || 0);
    const discount = parseFloat(bill.discount || 0);
    const taxAmount = totalAmount * 0.10; 
    const subTotal = totalAmount - taxAmount + discount;
    const dueAmount = totalAmount - paidAmount;

    // Payment Info
    doc.fontSize(10).fillColor(colors.primaryBlue).font('Helvetica-Bold');
    doc.text('Payment Details:', 60, y);
    doc.fontSize(9).fillColor(colors.textDark).font('Helvetica');
    doc.text('Bank Name: Brocelle Bank', 60, y + 15);
    doc.text('Account: 123-456-7890', 60, y + 30);

    // Calculations
    const rightColX = 350;
    const valColX = 460;
    
    const printTotalRow = (label, value, isBold = false, color = colors.textDark) => {
        doc.fillColor(color).font(isBold ? 'Helvetica-Bold' : 'Helvetica');
        doc.text(label, rightColX, y, { align: 'left' });
        doc.text(value, valColX, y, { align: 'right', width: 70 });
        y += 20;
    };
    y += 5;
    doc.fontSize(12);
    printTotalRow('Total', `$${totalAmount.toFixed(2)}`, true, colors.primaryBlue);
    doc.fontSize(10);
    printTotalRow('Amount Paid', `$${paidAmount.toFixed(2)}`, false, '#27ae60');
    doc.fontSize(12);
    printTotalRow('Balance Due', `$${dueAmount.toFixed(2)}`, true, colors.accentRed);

    // --- 7. FOOTER ---
    const footerY = 740;
    doc.fillColor(colors.primaryBlue).fontSize(12).font('Helvetica-Bold').text('Contact Us', 60, footerY);
    doc.fontSize(9).font('Helvetica')
       .text('123 Anywhere St., Any City', 60, footerY + 20)
       .text('www.website.com | +123-456-7890', 60, footerY + 35);
    
    doc.fillColor(colors.primaryBlue).fontSize(12).font('Helvetica-Bold').text('Thank You!', 400, footerY, { align: 'center' });
    doc.font('Helvetica').fontSize(8).text('Administrator', 400, footerY + 45, { align: 'center' });

    doc.end();
}

function drawHeaderBackground(doc, colors) {
    const grad = doc.linearGradient(0, 0, 595, 0);
    grad.stop(0, colors.primaryBlue).stop(1, colors.accentRed);

    doc.save();
    // CORRECTED: using bezierCurveTo instead of curveTo
    doc.rect(0, 0, 595, 180).fill(grad);
    doc.moveTo(0, 180)
       .bezierCurveTo(150, 180, 400, 100, 595, 120) 
       .lineTo(595, 0)
       .lineTo(0, 0)
       .fill(grad);
    doc.restore();
}

function drawFooterBackground(doc, colors) {
    const grad = doc.linearGradient(0, 0, 595, 0);
    grad.stop(0, colors.primaryBlue).stop(1, colors.accentRed);

    doc.save();
    // CORRECTED: using bezierCurveTo instead of curveTo
    doc.moveTo(0, 842)
       .lineTo(595, 842) 
       .lineTo(595, 760) 
       .bezierCurveTo(400, 800, 150, 820, 0, 780)
       .fill(grad);
    doc.restore();
}

module.exports = { buildPDF };
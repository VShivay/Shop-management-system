const PDFDocument = require('pdfkit');

/**
 * Generates a structured PDF Invoice
 */
function buildPDF(dataCallback, endCallback, bill, items) {
    const doc = new PDFDocument({ 
        margin: 50, 
        size: 'A4',
        bufferPages: true 
    });

    doc.on('data', dataCallback);
    doc.on('end', endCallback);

    // --- 1. SETTINGS & STYLES ---
    const primaryColor = '#2c3e50';
    const secondaryColor = '#7f8c8d';
    const accentColor = '#e74c3c';
    const tableTop = 230;

    // --- 2. HEADER & BRANDING ---
    doc.fillColor(primaryColor)
       .font('Helvetica-Bold')
       .fontSize(22)
       .text('RETAIL INVOICE', { align: 'right' });

    doc.fontSize(10)
       .font('Helvetica')
       .text('My Wholesale Company', 50, 50)
       .fillColor(secondaryColor)
       .text('123 Market Street')
       .text('City, Country, 123456')
       .text('Email: billing@company.com');

    // --- 3. INFORMATION BAR ---
    doc.rect(50, 110, 500, 70).fill('#f9f9f9'); // Light background for details
    
    doc.fillColor(primaryColor).font('Helvetica-Bold');
    doc.text('BILL TO:', 70, 125);
    doc.text('INVOICE INFO:', 350, 125);

    doc.font('Helvetica').fillColor('#000000');
    // Customer Side
    doc.text(bill.customer_name, 70, 140)
       .text(`Phone: ${bill.phone || 'N/A'}`, 70, 155);

    // Bill Side
    doc.text(`Invoice No: ${bill.bill_number}`, 350, 140)
       .text(`Date: ${new Date(bill.bill_date).toLocaleDateString()}`, 350, 155);

    // --- 4. TABLE HEADER ---
    doc.moveDown(4);
    doc.fillColor(primaryColor).font('Helvetica-Bold');
    
    generateTableRow(doc, tableTop, 'Item Description', 'Qty', 'Unit Price', 'Total');
    
    // Header Underline
    doc.moveTo(50, tableTop + 18).lineTo(550, tableTop + 18).lineWidth(1).strokeColor('#dddddd').stroke();

    // --- 5. TABLE ITEMS ---
    doc.font('Helvetica').fillColor('#333333');
    let currentY = tableTop + 30;

    items.forEach((item) => {
        const itemTotal = parseFloat(item.total_price).toFixed(2);
        const unitPrice = parseFloat(item.unit_price).toFixed(2);

        // Check for page overflow
        if (currentY > 700) { 
            doc.addPage();
            currentY = 50; 
        }

        generateTableRow(
            doc, 
            currentY, 
            item.product_name, 
            item.quantity, 
            unitPrice, 
            itemTotal
        );

        currentY += 25; // Spacing between rows
    });

    // --- 6. SUMMARY SECTION ---
    const summaryTop = currentY + 20;
    doc.moveTo(350, summaryTop).lineTo(550, summaryTop).stroke();

    const totalAmt = parseFloat(bill.total_amount);
    const paidAmt = parseFloat(bill.amount_paid);
    const dueAmt = totalAmt - paidAmt;

    // Subtotal Row
    writeTotalRow(doc, summaryTop + 15, 'Grand Total:', totalAmt.toFixed(2), primaryColor, true);
    // Paid Row
    writeTotalRow(doc, summaryTop + 35, 'Amount Paid:', paidAmt.toFixed(2), '#27ae60', false);
    
    // Balance Due with conditional styling
    if (dueAmt > 0) {
        writeTotalRow(doc, summaryTop + 55, 'Balance Due:', dueAmt.toFixed(2), accentColor, true);
    }

    // --- 7. FOOTER ---
    doc.fontSize(8)
       .fillColor(secondaryColor)
       .text('Thank you for your business. Please keep this invoice for your records.', 50, 780, { align: 'center', width: 500 });

    doc.end();
}

/**
 * Helper to ensure consistent table columns
 */
function generateTableRow(doc, y, item, qty, price, total) {
    doc.fontSize(10)
       .text(item, 50, y, { width: 190 }) // Limited width to prevent overlap
       .text(qty, 250, y, { width: 40, align: 'center' })
       .text(price, 310, y, { width: 90, align: 'right' })
       .text(total, 450, y, { width: 100, align: 'right' });
}

/**
 * Helper for the totals section
 */
function writeTotalRow(doc, y, label, value, color, isBold) {
    doc.fillColor(color)
       .font(isBold ? 'Helvetica-Bold' : 'Helvetica')
       .text(label, 350, y)
       .text(value, 450, y, { align: 'right' });
}

module.exports = { buildPDF };
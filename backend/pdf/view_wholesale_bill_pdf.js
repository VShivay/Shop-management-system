// pdf/view_wholesale_bill_pdf.js
const PDFDocument = require('pdfkit');

function buildWholesaleBillPDF(data, dataCallback, endCallback) {
    const { bill, items, payments } = data;

    // A4 Size, margins
    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    doc.on('data', dataCallback);
    doc.on('end', endCallback);

    // -- 1. Header Section --
    generateHeader(doc);

    // -- 2. Customer & Bill Info Grid --
    generateDetailsSection(doc, bill);

    // -- 3. Item Table --
    // Returns the Y position where the table ended
    let finalY = generateInvoiceTable(doc, items);

    // -- 4. Payment History --
    // We pass finalY to start drawing from there, and get a new Y back
    finalY = generatePaymentHistory(doc, payments, finalY);

    // -- 5. Financial Summary & Footer --
    generateFooter(doc, bill, finalY);

    doc.end();
}

// --- Section Generators ---

function generateHeader(doc) {
    doc
        .fillColor('#1a1a1a')
        .font('Helvetica-Bold')
        .fontSize(24)
        .text('WHOLESALE INVOICE', 40, 40, { align: 'left' });

    doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('MY COMPANY NAME', 200, 40, { align: 'right' })
        .font('Helvetica')
        .text('123 Main Street, Industrial Area', 200, 55, { align: 'right' })
        .text('Vadodara, Gujarat, 390001', 200, 70, { align: 'right' })
        .text('Phone: +91 98765 43210', 200, 85, { align: 'right' });

    generateHr(doc, 120);
}

function generateDetailsSection(doc, bill) {
    const startY = 135;
    
    // Background for Section Headers
    doc.rect(40, startY, 515, 20).fill('#f3f4f6');
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10);
    
    doc.text('BILLED TO:', 50, startY + 5);
    doc.text('INVOICE DETAILS:', 300, startY + 5);

    doc.font('Helvetica').fontSize(10).fillColor('#374151');
    const contentY = startY + 30;
    
    // Left: Customer
    doc.font('Helvetica-Bold').text(bill.customer_name || 'Walk-in Customer', 50, contentY);
    doc.font('Helvetica');
    
    let currentY = contentY + 15;
    if (bill.phone) {
        doc.text(`Phone: ${bill.phone}`, 50, currentY);
        currentY += 15;
    }
    if (bill.address) {
        doc.text(bill.address, 50, currentY, { width: 230 });
    }

    // Right: Metadata
    const labelX = 300;
    const valueX = 400;
    let rightY = contentY;

    const printMeta = (label, value, isBold = false) => {
        doc.font('Helvetica').text(label, labelX, rightY);
        if(isBold) doc.font('Helvetica-Bold');
        doc.text(value, valueX, rightY);
        doc.font('Helvetica');
        rightY += 15;
    };

    printMeta('Invoice No:', bill.bill_number, true);
    printMeta('Date:', new Date(bill.bill_date).toLocaleDateString());
    
    // Status Logic
    doc.text('Status:', labelX, rightY);
    const statusColor = bill.payment_status === 'paid' ? '#166534' : 
                        bill.payment_status === 'unpaid' ? '#991b1b' : '#9a3412'; // Partial is orange/brown
    
    doc.fillColor(statusColor).font('Helvetica-Bold')
       .text((bill.payment_status || 'UNPAID').toUpperCase(), valueX, rightY);
    
    doc.fillColor('#374151');
}

function generateInvoiceTable(doc, items) {
    let i;
    const tableTop = 230;
    
    // Header Background
    doc.rect(40, tableTop, 515, 20).fill('#e5e7eb');
    doc.fillColor('#000000');

    const xItem = 50;
    const xPrice = 340;
    const xQty = 420;
    const xTotal = 490;

    doc.font("Helvetica-Bold").fontSize(10);
    doc.text("Description", xItem, tableTop + 5);
    doc.text("Unit Price", xPrice, tableTop + 5, { width: 70, align: 'right' });
    doc.text("Qty", xQty, tableTop + 5, { width: 60, align: 'right' });
    doc.text("Amount", xTotal, tableTop + 5, { width: 60, align: 'right' });

    generateHr(doc, tableTop + 20);

    doc.font("Helvetica").fontSize(10);
    let y = tableTop + 30;

    for (i = 0; i < items.length; i++) {
        const item = items[i];
        
        // Pagination
        if (y > 750) {
            doc.addPage({ size: 'A4', margin: 40 });
            y = 50;
            // Reprint Header
            doc.rect(40, y - 10, 515, 20).fill('#e5e7eb');
            doc.fillColor('#000000').font("Helvetica-Bold");
            doc.text("Description", xItem, y - 5);
            doc.text("Unit Price", xPrice, y - 5, { width: 70, align: 'right' });
            doc.text("Qty", xQty, y - 5, { width: 60, align: 'right' });
            doc.text("Amount", xTotal, y - 5, { width: 60, align: 'right' });
            doc.font("Helvetica");
            y += 20;
        }

        doc.text(item.product_name, xItem, y, { width: 280, lineGap: 2 });
        doc.text(parseFloat(item.unit_price).toFixed(2), xPrice, y, { width: 70, align: 'right' });
        doc.text(item.quantity, xQty, y, { width: 60, align: 'right' });
        doc.text(parseFloat(item.total_price).toFixed(2), xTotal, y, { width: 60, align: 'right' });

        y += 20;
        generateHr(doc, y, '#f3f4f6');
        y += 10;
    }
    return y;
}

function generatePaymentHistory(doc, payments, startY) {
    if (!payments || payments.length === 0) {
        return startY;
    }

    let y = startY + 20;

    // Check for page overflow before starting header
    if (y > 700) {
        doc.addPage({ size: 'A4', margin: 40 });
        y = 50;
    }

    // Section Header
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827');
    doc.text('PAYMENT HISTORY:', 40, y);
    y += 15;

    // Table Header
    doc.rect(40, y, 515, 18).fill('#f9fafb'); // Very light grey
    doc.fillColor('#000000').fontSize(9);
    
    const xDate = 50;
    const xMode = 180;
    const xRemarks = 300;
    const xAmount = 490;

    doc.text("Date", xDate, y + 4);
    doc.text("Mode", xMode, y + 4);
    doc.text("Remarks", xRemarks, y + 4);
    doc.text("Paid Amount", xAmount, y + 4, { align: 'right', width: 60 });
    
    y += 25;

    // Rows
    doc.font('Helvetica').fontSize(9);
    
    payments.forEach(ph => {
        if (y > 750) {
            doc.addPage({ size: 'A4', margin: 40 });
            y = 50;
        }

        doc.text(new Date(ph.payment_date).toLocaleDateString(), xDate, y);
        doc.text(ph.method_name || '-', xMode, y);
        doc.text(ph.remarks || '-', xRemarks, y, { width: 180, lineBreak: false, ellipsis: true });
        doc.text(parseFloat(ph.amount_paid).toFixed(2), xAmount, y, { align: 'right', width: 60 });

        y += 15;
        generateHr(doc, y, '#f3f4f6');
        y += 8;
    });

    return y + 10; // Return new Y position with some padding
}

function generateFooter(doc, bill, startY) {
    if (startY > 680) {
        doc.addPage({ size: 'A4', margin: 40 });
        startY = 50;
    }

    const footerTop = startY + 10;
    const boxLeft = 300;

    // --- Financial Summary ---
    let summaryY = footerTop;
    
    const drawSummaryRow = (label, value, isBold = false, isRed = false, isBig = false) => {
        if(isBig) { doc.fontSize(12); summaryY += 5; } 
        else { doc.fontSize(10); }
        
        doc.font(isBold ? "Helvetica-Bold" : "Helvetica");
        doc.fillColor(isRed ? "#dc2626" : "#000000");
        
        doc.text(label, boxLeft, summaryY);
        doc.text(value, 400, summaryY, { align: 'right', width: 150 });
        
        summaryY += isBig ? 20 : 15;
    };

    // Calculate Totals
    const total = parseFloat(bill.total_amount);
    const paid = parseFloat(bill.amount_paid);
    const due = total - paid;

    // We don't have separate subtotal/tax in DB schema yet, 
    // so we just show Total Amount
    
    drawSummaryRow("Grand Total", `INR ${total.toFixed(2)}`, true, false, true);
    generateHr(doc, summaryY);
    summaryY += 10;

    drawSummaryRow("Total Paid", `INR ${paid.toFixed(2)}`, false);

    if (due > 0.01) { // Floating point tolerance
        drawSummaryRow("Balance Due", `INR ${due.toFixed(2)}`, true, true);
    } else {
        drawSummaryRow("Balance Due", "CLEARED", true, false);
    }

    // --- Terms ---
    const termsY = footerTop + 60;
    doc.fontSize(9).fillColor('#6b7280');
    doc.font('Helvetica-Bold').text('Terms & Conditions:', 40, termsY);
    doc.font('Helvetica').text('1. Goods once sold will not be taken back.', 40, termsY + 12);
    doc.text('2. Interest @24% p.a. will be charged on delayed payments.', 40, termsY + 24);

    // --- Signature ---
    doc.font('Helvetica-Bold').fillColor('#000000')
       .text('Authorized Signatory', 400, termsY + 40, { align: 'right', width: 150 });
    
    // Bottom
    doc.font('Helvetica').fontSize(8).fillColor('#9ca3af')
       .text('Computer-generated wholesale invoice.', 40, 780, { align: 'center', width: 515 });
}

function generateHr(doc, y, color = "#aaaaaa") {
    doc
        .strokeColor(color)
        .lineWidth(1)
        .moveTo(40, y)
        .lineTo(555, y)
        .stroke();
}

module.exports = { buildWholesaleBillPDF };
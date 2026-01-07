const PDFDocument = require('pdfkit');

function buildPDF(dataCallback, endCallback, bill, items) {
    const doc = new PDFDocument({ margin: 50 });

    doc.on('data', dataCallback);
    doc.on('end', endCallback);

    // 1. Header
    doc.fontSize(20).text('INVOICE', { align: 'center' });
    doc.moveDown();

    // 2. Company & Customer Details
    doc.fontSize(10);
    
    // Left side: Company Info
    doc.text('My Wholesale Company', 50, 80)
       .text('123 Market Street', 50, 95)
       .text('City, Country', 50, 110);

    // Right side: Bill & Customer Info
    doc.text(`Bill No: ${bill.bill_number}`, 400, 80)
       .text(`Date: ${new Date(bill.bill_date).toLocaleDateString()}`, 400, 95)
       .text(`Customer: ${bill.customer_name}`, 400, 120)
       .text(`Phone: ${bill.phone || 'N/A'}`, 400, 135);

    doc.moveDown(4);

    // 3. Table Header
    const tableTop = 200;
    doc.font('Helvetica-Bold');
    doc.text('Item', 50, tableTop);
    doc.text('Qty', 250, tableTop);
    doc.text('Price', 300, tableTop);
    doc.text('Total', 450, tableTop, { align: 'right' });
    
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

    // 4. Table Items
    doc.font('Helvetica');
    let position = tableTop + 30;

    items.forEach((item) => {
        const itemTotal = parseFloat(item.total_price).toFixed(2);
        
        doc.text(item.product_name, 50, position)
           .text(item.quantity, 250, position)
           .text(parseFloat(item.unit_price).toFixed(2), 300, position)
           .text(itemTotal, 450, position, { align: 'right' });

        position += 20;
    });

    doc.moveTo(50, position + 10).lineTo(550, position + 10).stroke();

    // 5. Totals
    const totalPos = position + 30;
    const totalAmt = parseFloat(bill.total_amount);
    const paidAmt = parseFloat(bill.amount_paid);
    const dueAmt = totalAmt - paidAmt;

    doc.font('Helvetica-Bold');
    doc.text('Total Amount:', 350, totalPos)
       .text(totalAmt.toFixed(2), 450, totalPos, { align: 'right' });
    
    doc.text('Amount Paid:', 350, totalPos + 20)
       .text(paidAmt.toFixed(2), 450, totalPos + 20, { align: 'right' });

    doc.fillColor('red')
       .text('Balance Due:', 350, totalPos + 40)
       .text(dueAmt.toFixed(2), 450, totalPos + 40, { align: 'right' });

    doc.end();
}

// IMPORTANT: Ensure this is an object export
module.exports = { buildPDF };
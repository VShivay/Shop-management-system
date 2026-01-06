const PDFDocument = require('pdfkit');
const db = require('../db');

exports.generateRetailBillPDF = async (req, res) => {
    const { billId } = req.params;

    try {
        // 1. Fetch Full Bill Details
        const billQuery = `
            SELECT 
                rb.*, 
                c.customer_name, c.phone, c.address,
                pm.method_name,
                u.name as cashier_name
            FROM retail_bills rb
            LEFT JOIN customers c ON rb.customer_id = c.customer_id
            LEFT JOIN payment_methods pm ON rb.payment_method_id = pm.payment_method_id
            LEFT JOIN users u ON rb.created_by = u.user_id
            WHERE rb.retail_bill_id = $1
        `;

        const itemsQuery = `
            SELECT 
                rbi.*, 
                p.product_name,
                u.unit_name
            FROM retail_bill_items rbi
            JOIN products p ON rbi.product_id = p.product_id
            LEFT JOIN units u ON p.unit_id = u.unit_id
            WHERE rbi.retail_bill_id = $1
        `;

        const billRes = await db.query(billQuery, [billId]);
        const itemsRes = await db.query(itemsQuery, [billId]);

        if (billRes.rows.length === 0) {
            return res.status(404).json({ error: 'Bill not found' });
        }

        const bill = billRes.rows[0];
        const items = itemsRes.rows;

        // 2. Create PDF
        const doc = new PDFDocument({ margin: 50 });

        // Set Headers for Download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Bill_${bill.bill_number}.pdf`);

        doc.pipe(res);

        // --- PDF Content ---

        // Header
        doc.fontSize(20).text('RETAIL INVOICE', { align: 'center' });
        doc.moveDown();

        // Store Info (Static or Env vars)
        doc.fontSize(10).text('My Awesome Store', { align: 'right' });
        doc.text('123 Market Street, Vadodara', { align: 'right' });
        doc.moveDown();

        // Bill & Customer Details
        doc.text(`Bill No: ${bill.bill_number}`, 50, 100);
        doc.text(`Date: ${new Date(bill.bill_date).toLocaleString()}`, 50, 115);
        doc.text(`Cashier: ${bill.cashier_name || 'N/A'}`, 50, 130);

        if (bill.customer_name) {
            doc.text(`Customer: ${bill.customer_name}`, 300, 100, { align: 'right' });
            doc.text(`Phone: ${bill.phone || 'N/A'}`, 300, 115, { align: 'right' });
        } else {
            doc.text(`Customer: Walk-in`, 300, 100, { align: 'right' });
        }

        doc.moveDown(2);

        // Table Header
        const tableTop = 200;
        doc.font('Helvetica-Bold');
        doc.text('Item', 50, tableTop);
        doc.text('Qty', 250, tableTop);
        doc.text('Price', 300, tableTop); // Unit Price
        doc.text('Total', 400, tableTop, { align: 'right' });
        doc.font('Helvetica');

        // Draw Line
        doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

        // Items Loop
        let position = tableTop + 30;
        
        items.forEach(item => {
            doc.text(item.product_name, 50, position, { width: 190 });
            doc.text(`${item.quantity} ${item.unit_name || ''}`, 250, position);
            doc.text(Number(item.unit_price).toFixed(2), 300, position);
            doc.text(Number(item.total_price).toFixed(2), 400, position, { align: 'right' });
            position += 20;
        });

        // Draw Line
        doc.moveTo(50, position + 10).lineTo(550, position + 10).stroke();
        position += 25;

        // Totals
        const totalX = 350;
        const valX = 450;

        doc.text('Subtotal:', totalX, position);
        doc.text(Number(bill.subtotal).toFixed(2), valX, position, { align: 'right' });
        position += 15;

        if (Number(bill.discount_amount) > 0) {
            doc.text('Discount:', totalX, position);
            doc.text(`-${Number(bill.discount_amount).toFixed(2)}`, valX, position, { align: 'right' });
            position += 15;
        }

        doc.font('Helvetica-Bold').fontSize(12);
        doc.text('Grand Total:', totalX, position);
        doc.text(Number(bill.total_amount).toFixed(2), valX, position, { align: 'right' });
        doc.fontSize(10).font('Helvetica');
        position += 25;

        // Payment Details
        doc.text(`Paid via: ${bill.method_name}`, 50, position);
        doc.text(`Amount Paid: ${Number(bill.amount_paid).toFixed(2)}`, 50, position + 15);
        
        if (bill.payment_status !== 'paid') {
            const due = Number(bill.total_amount) - Number(bill.amount_paid);
            doc.fillColor('red').text(`Balance Due: ${due.toFixed(2)}`, 50, position + 30);
            doc.fillColor('black');
        }

        // Footer
        doc.fontSize(8).text('Thank you for shopping with us!', 50, 700, { align: 'center', width: 500 });

        doc.end();

    } catch (err) {
        console.error(err);
        if (!res.headersSent) res.status(500).json({ error: 'Error generating PDF' });
    }
};
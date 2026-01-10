const PDFDocument = require('pdfkit');
const db = require('../db');

exports.generateRetailBillPDF = async (req, res) => {
    const { billId } = req.params;

    try {
        // 1. Fetch Data
        const billQuery = `
            SELECT rb.*, c.customer_name, c.phone, c.address, pm.method_name, u.name as cashier_name
            FROM retail_bills rb
            LEFT JOIN customers c ON rb.customer_id = c.customer_id
            LEFT JOIN payment_methods pm ON rb.payment_method_id = pm.payment_method_id
            LEFT JOIN users u ON rb.created_by = u.user_id
            WHERE rb.retail_bill_id = $1`;

        const itemsQuery = `
            SELECT rbi.*, p.product_name, u.unit_name
            FROM retail_bill_items rbi
            JOIN products p ON rbi.product_id = p.product_id
            LEFT JOIN units u ON p.unit_id = u.unit_id
            WHERE rbi.retail_bill_id = $1`;

        const [billRes, itemsRes] = await Promise.all([
            db.query(billQuery, [billId]),
            db.query(itemsQuery, [billId])
        ]);

        if (billRes.rows.length === 0) return res.status(404).json({ error: 'Bill not found' });

        const bill = billRes.rows[0];
        const items = itemsRes.rows;

        // 2. Initialize PDF
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Bill_${bill.bill_number}.pdf`);
        doc.pipe(res);

        // --- Layout Sections ---
        generateHeader(doc, bill);
        generateCustomerInfo(doc, bill);
        generateInvoiceTable(doc, items);
        generateFooter(doc, bill);

        doc.end();

    } catch (err) {
        console.error("PDF Generation Error:", err);
        if (!res.headersSent) res.status(500).send("Could not generate PDF");
    }
};

// --- Helper Functions for Clean Structure ---

function generateHeader(doc, bill) {
    doc.fillColor("#444444").fontSize(20).text("RETAIL INVOICE", { align: "center" });
    
    // Store Branding (Top Right)
    doc.fontSize(10)
       .text("MY AWESOME STORE", 200, 50, { align: "right" })
       .text("123 Market Street, Vadodara", 200, 65, { align: "right" })
       .text("GSTIN: 24AAAAA0000A1Z5", 200, 80, { align: "right" })
       .moveDown();

    // Horizontal Line
    doc.strokeColor("#aaaaaa").lineWidth(1).moveTo(50, 100).lineTo(550, 100).stroke();
}

function generateCustomerInfo(doc, bill) {
    const customerTop = 115;

    doc.fillColor("#444444").fontSize(10).font("Helvetica-Bold");
    doc.text("Bill Details:", 50, customerTop);
    doc.font("Helvetica");
    
    doc.text(`Bill No: ${bill.bill_number}`, 50, customerTop + 15)
       .text(`Date: ${new Date(bill.bill_date).toLocaleDateString()}`, 50, customerTop + 30)
       .text(`Cashier: ${bill.cashier_name || 'N/A'}`, 50, customerTop + 45);

    doc.font("Helvetica-Bold").text("Bill To:", 350, customerTop);
    doc.font("Helvetica")
       .text(bill.customer_name || "Walk-in Customer", 350, customerTop + 15)
       .text(bill.phone || "", 350, customerTop + 30)
       .text(bill.address || "", 350, customerTop + 45, { width: 200 });

    doc.moveDown();
}

function generateInvoiceTable(doc, items) {
    let i;
    const invoiceTableTop = 200;

    doc.font("Helvetica-Bold");
    generateTableRow(doc, invoiceTableTop, "Item Description", "Qty", "Price", "Total");
    doc.strokeColor("#aaaaaa").lineWidth(1).moveTo(50, invoiceTableTop + 15).lineTo(550, invoiceTableTop + 15).stroke();
    doc.font("Helvetica");

    for (i = 0; i < items.length; i++) {
        const item = items[i];
        const position = invoiceTableTop + (i + 1) * 25;
        
        // Auto-page break logic: if position exceeds 700, add new page (simplified)
        generateTableRow(
            doc,
            position,
            item.product_name,
            `${item.quantity} ${item.unit_name || ''}`,
            Number(item.unit_price).toFixed(2),
            Number(item.total_price).toFixed(2)
        );
    }
}

function generateTableRow(doc, y, item, qty, price, total) {
    doc.fontSize(10)
        .text(item, 50, y, { width: 200 }) // Text wrap enabled for long names
        .text(qty, 280, y, { width: 50, align: "right" })
        .text(price, 350, y, { width: 80, align: "right" })
        .text(total, 450, y, { align: "right" });
}

function generateFooter(doc, bill) {
    const footerTop = doc.y + 30; // Starts after the last table row

    doc.strokeColor("#aaaaaa").lineWidth(1).moveTo(350, footerTop).lineTo(550, footerTop).stroke();

    const subtotalY = footerTop + 10;
    doc.fontSize(10).text("Subtotal:", 350, subtotalY);
    doc.text(Number(bill.subtotal).toFixed(2), 450, subtotalY, { align: "right" });

    const discountY = subtotalY + 15;
    doc.text("Discount:", 350, discountY);
    doc.text(`- ${Number(bill.discount_amount).toFixed(2)}`, 450, discountY, { align: "right" });

    const totalY = discountY + 20;
    doc.font("Helvetica-Bold").fontSize(12).text("Grand Total:", 350, totalY);
    doc.text(`${Number(bill.total_amount).toFixed(2)}`, 450, totalY, { align: "right" });

    // Payment Status Note
    doc.fontSize(10).fillColor(bill.payment_status === 'paid' ? 'black' : 'red');
    doc.text(`Payment: ${bill.method_name} (${bill.payment_status.toUpperCase()})`, 50, totalY);
    
    doc.fillColor("#444444")
       .fontSize(8)
       .text("Thank you for your business!", 50, 780, { align: "center", width: 500 });
}
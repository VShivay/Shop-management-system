const PDFDocument = require('pdfkit');
const db = require('../db');
const { format } = require('date-fns');

const generateProductReportPDF = async (req, res) => {
    try {
        const { product_id } = req.params;

        // Fetch Product Info
        const infoResult = await db.query(`
            SELECT p.product_name, COALESCE(i.available_quantity_in_hand, 0) as current_stock 
            FROM products p 
            LEFT JOIN inventory i ON p.product_id = i.product_id 
            WHERE p.product_id = $1
        `, [product_id]);

        if (infoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const product = infoResult.rows[0];

        // Fetch ALL Transactions (No Limit)
        const historyQuery = `
            SELECT transaction_type, quantity, transaction_date, reference_type, remarks
            FROM inventory_transactions
            WHERE product_id = $1
            ORDER BY transaction_date DESC;
        `;
        const historyResult = await db.query(historyQuery, [product_id]);

        // Initialize PDF Document
        const doc = new PDFDocument({ margin: 30, size: 'A4' });

        // Set Headers for Download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Product_Report_${product_id}.pdf`);
        doc.pipe(res);

        // Header
        doc.fontSize(20).text(`Inventory Report: ${product.product_name}`, { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Current Stock Available: ${product.current_stock}`);
        doc.text(`Report Generated On: ${format(new Date(), 'dd MMM yyyy, hh:mm a')}`);
        doc.moveDown(2);

        // Table Header
        doc.fontSize(10).font('Helvetica-Bold');
        const tableTop = doc.y;
        doc.text('Date', 30, tableTop);
        doc.text('Type', 150, tableTop);
        doc.text('Qty', 250, tableTop);
        doc.text('Reference', 320, tableTop);
        doc.text('Remarks', 450, tableTop);
        
        doc.moveTo(30, doc.y + 5).lineTo(560, doc.y + 5).stroke();
        doc.moveDown(1);

        // Table Rows
        doc.font('Helvetica');
        historyResult.rows.forEach(row => {
            const rowY = doc.y;
            
            // Add a new page if we are too close to the bottom
            if (rowY > 750) {
                doc.addPage();
            }

            doc.text(format(new Date(row.transaction_date), 'dd MMM yyyy'), 30, rowY);
            doc.text(row.transaction_type.toUpperCase(), 150, rowY);
            doc.text(row.quantity, 250, rowY);
            doc.text(row.reference_type || '-', 320, rowY);
            doc.text(row.remarks || '-', 450, rowY, { width: 110, lineBreak: false });
            
            doc.moveDown(0.5);
            doc.moveTo(30, doc.y).lineTo(560, doc.y).strokeColor('#cccccc').stroke();
            doc.moveDown(0.5);
        });

        doc.end();

    } catch (error) {
        console.error('Error generating product PDF:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Server Error generating PDF' });
        }
    }
};

module.exports = { generateProductReportPDF };
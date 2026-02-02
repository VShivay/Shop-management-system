const PDFDocument = require('pdfkit');
const db = require('../db');

exports.generateRetailBillPDF = async (req, res) => {
    const { billId } = req.params;

    try {
        // 1. Fetch Data (Keep existing logic)
        const billQuery = `
            SELECT rb.*, c.customer_name, c.phone, c.address, c.email, pm.method_name, u.name as cashier_name
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
        
        // Define Brand Colors based on the image
        const colors = {
            primaryDark: '#1a237e',   // Deep Blue
            primaryLight: '#283593',  // Lighter Blue
            accent: '#c62828',        // Reddish/Pink gradient accent
            textMain: '#2c3e50',      // Dark Grey text
            textLight: '#7f8c8d',     // Light Grey text
            white: '#ffffff'
        };

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Bill_${bill.bill_number}.pdf`);
        doc.pipe(res);

        // --- Layout Sections ---
        generateGraphicalHeader(doc, bill, colors);
        generateCustomerSection(doc, bill, colors);
        generateInvoiceTable(doc, items, colors);
        generateFooterSection(doc, bill, colors);

        doc.end();

    } catch (err) {
        console.error("PDF Generation Error:", err);
        if (!res.headersSent) res.status(500).send("Could not generate PDF");
    }
};

// --- 1. Graphical Header (The Blue/Red Curved Background) ---
// REPLACE your generateGraphicalHeader function with this fixed version

function generateGraphicalHeader(doc, bill, colors) {
    // Create a Gradient for the background
    let grad = doc.linearGradient(0, 0, 600, 150);
    grad.stop(0, colors.accent)       
        .stop(0.4, colors.primaryDark) 
        .stop(1, colors.primaryLight); 

    // Draw the curved shape
    doc.save();
    doc.moveTo(0, 0)
       .lineTo(600, 0)
       .lineTo(600, 160) 
       .bezierCurveTo(400, 200, 200, 100, 0, 180) 
       .lineTo(0, 0)
       .fill(grad);
    doc.restore();

    // Invoice Title (Left)
    doc.fillColor(colors.white)
       .font("Helvetica-Bold").fontSize(45)
       .text("INVOICE", 50, 50);

    // --- FIX IS HERE ---
    // Invoice Meta Data (Left, under Title)
    // We pass { characterSpacing: 2 } as the 4th argument (options)
    doc.font("Helvetica").fontSize(10)
       .text(`INVOICE NO: ${bill.bill_number}`, 50, 100, { characterSpacing: 2 })
       .text(new Date(bill.bill_date).toLocaleDateString(), 50, 115, { characterSpacing: 2 });

    // Company Name (Right)
    doc.font("Helvetica-Bold").fontSize(18).text("Shree Vishwakarma Krupa", 300, 50, { align: "right" });
    
    
    // No need to reset letterSpacing(0) because the option applies only to the specific text call above.
}

// --- 2. Customer Info (The White Section) ---
function generateCustomerSection(doc, bill, colors) {
    const yPos = 210;

    // "Invoice to" Label
    doc.fillColor(colors.textLight).fontSize(10).font("Helvetica-Bold")
       .text("Invoice to:", 50, yPos);

    // Customer Name (Large Blue)
    doc.fillColor(colors.primaryDark).fontSize(22).font("Helvetica-Bold")
       .text(bill.customer_name || "Walk-in Customer", 50, yPos + 15);

    // Company Contact Info (Right Side)
    doc.fillColor(colors.textMain).fontSize(9).font("Helvetica")
       .text("hello@reallygreatsite.com", 300, yPos, { align: "right" })
       .text("123 Anywhere St., Any City, ST 12345", 300, yPos + 15, { align: "right" });
}

// --- 3. Table Section ---
function generateInvoiceTable(doc, items, colors) {
    const tableTop = 280;
    const itemX = 50;
    const qtyX = 300;
    const costX = 370;
    const totalX = 470;

    // Header Line
    doc.strokeColor(colors.primaryDark).lineWidth(1.5)
       .moveTo(50, tableTop).lineTo(550, tableTop).stroke();

    // Headers
    doc.font("Helvetica-Bold").fontSize(11).fillColor(colors.primaryDark);
    doc.text("Description", itemX, tableTop + 10);
    doc.text("Qty", qtyX, tableTop + 10, { width: 50, align: "center" });
    doc.text("Cost", costX, tableTop + 10, { width: 80, align: "right" });
    doc.text("Subtotal", totalX, tableTop + 10, { width: 80, align: "right" });

    // Header Bottom Line
    doc.moveTo(50, tableTop + 30).lineTo(550, tableTop + 30).stroke();

    // Items
    let y = tableTop + 45;
    doc.font("Helvetica").fontSize(10).fillColor(colors.textMain);

    items.forEach((item, index) => {
        // Simple Page Break Logic
        if (y > 700) {
            doc.addPage();
            y = 50;
            // Redraw Header on new page (optional, simplified here)
        }

        doc.text(item.product_name, itemX, y, { width: 240 });
        doc.text(`${item.quantity} ${item.unit_name || ''}`, qtyX, y, { width: 50, align: "center" });
        doc.text(Number(item.unit_price).toFixed(2), costX, y, { width: 80, align: "right" });
        doc.text(Number(item.total_price).toFixed(2), totalX, y, { width: 80, align: "right" });

        y += 25; // Row height
    });

    // Separator line after items
    doc.strokeColor("#e0e0e0").lineWidth(1)
       .moveTo(50, y).lineTo(550, y).stroke();

    // Return final Y position for the footer to use
    doc.y = y; 
}

// --- 4. Footer & Totals ---
function generateFooterSection(doc, bill, colors) {
    let yPos = doc.y + 20;

    // Prevent footer from breaking page awkwardly
    if (yPos > 650) {
        doc.addPage();
        yPos = 50;
    }

    // --- Left Side: Payment Details ---
    doc.font("Helvetica-Bold").fontSize(11).fillColor(colors.primaryDark)
       .text("Payment Details:", 50, yPos);
    
    doc.font("Helvetica").fontSize(10).fillColor(colors.textMain)
       .text("Bank Code: 123-456-7890", 50, yPos + 20)
       .text("Bank Name: Brocelle Bank", 50, yPos + 35)
       .text(`Method: ${bill.method_name}`, 50, yPos + 50);


    // --- Right Side: Totals ---
    const rightColX = 350;
    const valueX = 450;
    
    // Subtotal
    doc.text("Subtotal", rightColX, yPos);
    doc.text(`$${Number(bill.subtotal).toFixed(2)}`, valueX, yPos, { align: "right" });

    // Tax (Assuming generic tax for demo, replace with actual)
    doc.text("Tax", rightColX, yPos + 15);
    doc.text(`$0.00`, valueX, yPos + 15, { align: "right" });

    // Grand Total
    const totalY = yPos + 35;
    doc.font("Helvetica-Bold").fontSize(14).fillColor(colors.primaryDark)
       .text("Total", rightColX, totalY);
    doc.text(`$${Number(bill.total_amount).toFixed(2)}`, valueX, totalY, { align: "right" });

    // --- Bottom Layout (Contact & Signature) ---
    
    // Move to bottom of page for the footer graphic
    const bottomY = 700; 

    // Contact Us (Left)
    doc.font("Helvetica-Bold").fontSize(12).fillColor(colors.primaryDark)
       .text("Contact Us", 50, bottomY - 40);
    
    doc.font("Helvetica").fontSize(9).fillColor(colors.textMain)
       .text("123 Anywhere St., Any City, ST 12345", 50, bottomY - 20)
       .text("www.reallygreatsite.com | +123-456-7890", 50, bottomY - 8);

    // Thank You & Signature (Right)
    doc.font("Helvetica-Bold").fontSize(12).fillColor(colors.primaryDark)
       .text("Thank You!", 400, bottomY - 60, { align: "right" });
    
    // Simulated Signature (Script font not available by default, using italics)
    doc.font("Courier-Oblique").fontSize(18).fillColor(colors.primaryLight)
       .text("Administrator", 400, bottomY - 30, { align: "right" });

    // --- Bottom Curve Graphic ---
    // Inverted curve at the bottom
    doc.save();
    let grad = doc.linearGradient(0, 750, 600, 842);
    grad.stop(0, colors.primaryDark).stop(1, colors.accent);

    doc.moveTo(0, 842) // Bottom Left
       .lineTo(600, 842) // Bottom Right
       .lineTo(600, 780) // Up Right
       .bezierCurveTo(400, 820, 200, 750, 0, 800) // Curve
       .fill(grad);
    doc.restore();
}
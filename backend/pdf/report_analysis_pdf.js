const PDFDocument = require('pdfkit-table');

const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount);
};

const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
};

exports.createReportPDF = (res, data, summary, type, startDate, endDate) => {
    // 1. Setup Document with explicit margins
    const margin = 30;
    const doc = new PDFDocument({ margin: margin, size: 'A4' });

    // Set headers
    const filename = `${type}_report_${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

    doc.pipe(res);

    // --- 2. Header ---
    doc.fillColor('#333333').fontSize(20).font('Helvetica-Bold').text(`${type.toUpperCase()} PROFIT & LOSS REPORT`, { align: 'left' });
    doc.fontSize(10).font('Helvetica').fillColor('#666666').text(`Generated: ${new Date().toLocaleString()}`);
    
    doc.moveDown(0.5);
    // Divider line
    doc.strokeColor('#aaaaaa').lineWidth(1).moveTo(margin, doc.y).lineTo(595 - margin, doc.y).stroke();
    doc.moveDown(1);

    // --- 3. Summary Box (Fixed Positioning) ---
    const summaryStartY = doc.y;
    
    // Draw gray background box
    doc.rect(margin, summaryStartY, 595 - (margin * 2), 65).fill('#f8f9fa');
    
    // Period Text
    doc.fillColor('#333333').font('Helvetica-Bold').fontSize(12);
    doc.text(`Period: ${formatDate(startDate)} - ${formatDate(endDate)}`, margin + 15, summaryStartY + 15);

    // Stats Columns
    const rowY = summaryStartY + 40;
    const col1 = margin + 15;
    const col2 = margin + 160;
    const col3 = margin + 310;

    doc.fontSize(10).font('Helvetica');

    // Total Sales
    doc.text('Total Sales', col1, rowY);
    doc.font('Helvetica-Bold').text(formatCurrency(summary.totalSales), col1, rowY + 12);

    // Total Cost
    doc.font('Helvetica').text('Total Cost', col2, rowY);
    doc.font('Helvetica-Bold').text(formatCurrency(summary.totalCost), col2, rowY + 12);

    // Net Profit
    doc.font('Helvetica').text('Net Profit/Loss', col3, rowY);
    const profitColor = summary.totalProfit >= 0 ? '#10b981' : '#ef4444'; 
    doc.fillColor(profitColor).font('Helvetica-Bold').text(formatCurrency(summary.totalProfit), col3, rowY + 12);

    // --- 4. The Table (Fixed Alignment) ---
    
    // Move cursor well below the summary box
    doc.y = summaryStartY + 85; 

    const table = {
        title: "", // Title is handled by headers above
        headers: [
            { label: "Date", property: "date", width: 60, align: 'left' },
            { label: "Bill #", property: "bill", width: 70, align: 'left' },
            { label: "Product", property: "prod", width: 150, align: 'left' }, // Widened for long names
            { label: "Qty", property: "qty", width: 40, align: 'center' },
            { label: "Sale", property: "sale", width: 70, align: 'right' },
            { label: "Cost", property: "cost", width: 70, align: 'right' },
            { label: "Profit", property: "profit", width: 70, align: 'right' } 
        ],
        datas: data.map(item => ({
            date: formatDate(item.bill_date),
            bill: item.bill_number,
            prod: item.product_name,
            qty: String(item.quantity), // Ensure string
            sale: formatCurrency(Number(item.total_revenue)),
            cost: formatCurrency(Number(item.quantity) * Number(item.cost_price)),
            profit: formatCurrency(Number(item.profit)),
            rawProfit: Number(item.profit) // Hidden field for logic
        }))
    };

    doc.table(table, {
        // Force the table to start at the left margin to fix the "Right Shift" bug
        x: margin, 
        // Ensure width fills the page (A4 width 595 - 60 margin = 535)
        width: 535, 
        
        prepareHeader: () => doc.font("Helvetica-Bold").fontSize(9).fillColor('#333333'),
        
        prepareRow: (row, indexColumn, indexRow, rect, rowData) => {
            doc.font("Helvetica").fontSize(9);

            // Logic to color ONLY the text of the Profit column
            // Column 6 is profit (0-based index)
            if (indexColumn === 6) {
                if (rowData.rawProfit < 0) {
                    doc.fillColor('#ef4444'); // Red
                } else {
                    doc.fillColor('#10b981'); // Green
                }
            } else {
                doc.fillColor('#333333'); // Standard Black
            }
        },
        
        // Add divider lines to make rows distinct without using background colors (which caused your white-row bug)
        divider: {
            header: { disabled: false, width: 1, opacity: 1 },
            horizontal: { disabled: false, width: 0.5, opacity: 0.3 }
        }
    });

    doc.end();
};
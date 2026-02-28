const PDFDocument = require('pdfkit');
const { fetchReportData } = require('../controller/inventory_report_analysis');
const { reportFilterSchema } = require('../validation/reportValidation');
const { formatNumber } = require('../utils/reportUtils');

const generateReportPDF = async (req, res) => {
    try {
        // 1. Validate Query Params
        const { error, value } = reportFilterSchema.validate(req.query);
        if (error) return res.status(400).send(`Validation Error: ${error.details[0].message}`);

        // 2. Fetch Data
        const data = await fetchReportData(value);

        // 3. Create PDF Stream
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        
        // Set Headers for file download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Inventory_Report_${Date.now()}.pdf`);
        
        doc.pipe(res);

        // --- PDF CONTENT START ---

        // Header
        doc.fontSize(20).text('Inventory Analysis Report', { align: 'center' });
        doc.moveDown(0.5);
        
        // Filter Info
        doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString('en-IN')}`, { align: 'right' });
        doc.text(`Filter Type: ${value.filterType.toUpperCase()}`, { align: 'left' });
        
        if(value.filterType === 'range' && value.startDate) {
            doc.text(`Range: ${new Date(value.startDate).toLocaleDateString()} to ${new Date(value.endDate).toLocaleDateString()}`);
        } else if (value.filterType === 'month') {
            const monthName = new Date(0, value.month - 1).toLocaleString('default', { month: 'long' });
            doc.text(`Period: ${monthName} ${value.year}`);
        }
        
        doc.moveDown(1);
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke(); // Horizontal Line
        doc.moveDown(1);

        // --- Summary Section ---
        doc.fontSize(14).text('Summary', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(12);
        doc.text(`Total Items Sold: ${formatNumber(data.summary.totalSalesQuantity)}`);
        doc.text(`Total Items Restocked: ${formatNumber(data.summary.totalRestockQuantity)}`);
        doc.moveDown(2);

        // --- ROBUST TABLE DRAWING FUNCTION ---
        const drawTable = (title, headers, rows, columnsWidth) => {
            const startX = 50;
            const rowHeight = 20;
            const bottomMargin = 50;
            const pageHeight = doc.page.height;
            const tableWidth = 500;

            // 1. Check if there is space for the Title + Header (approx 60px)
            if (doc.y + 60 > pageHeight - bottomMargin) {
                doc.addPage();
            }

            doc.fontSize(14).text(title, { underline: true });
            doc.moveDown(0.5);

            let y = doc.y;

            // Helper to draw headers
            const drawHeaders = (currentY) => {
                doc.fillColor('#dddddd').rect(startX, currentY, tableWidth, rowHeight).fill();
                doc.fillColor('black').fontSize(10);
                
                let currentX = startX + 5;
                headers.forEach((header, i) => {
                    doc.text(header, currentX, currentY + 6, { 
                        width: columnsWidth[i], 
                        align: 'left' 
                    });
                    currentX += columnsWidth[i];
                });
                return currentY + rowHeight;
            };

            // Draw Initial Headers
            y = drawHeaders(y);

            // Draw Rows
            rows.forEach((row, rowIndex) => {
                // Check if current row will overflow page
                if (y + rowHeight > pageHeight - bottomMargin) {
                    doc.addPage();
                    y = 50; // Reset to top of new page
                    y = drawHeaders(y); // Re-draw headers for continuity
                }

                // Zebra Striping
                if (rowIndex % 2 === 1) {
                    doc.fillColor('#f9f9f9').rect(startX, y, tableWidth, rowHeight).fill();
                }
                doc.fillColor('black');

                let currentX = startX + 5;
                
                // Draw Cells
                row.forEach((text, i) => {
                    // Force text to stay on one line to avoid layout breaking
                    doc.text(text ? String(text) : '-', currentX, y + 6, { 
                        width: columnsWidth[i], 
                        align: 'left',
                        lineBreak: false, 
                        ellipsis: true 
                    });
                    currentX += columnsWidth[i];
                });

                y += rowHeight;
            });

            // Update doc cursor for next element
            doc.y = y + 20; 
        };

        // --- Sales Table ---
        if (data.sales.length > 0) {
            const salesHeaders = ['Product Name', 'Category', 'Unit', 'Qty Sold'];
            // Adjust widths to sum to approx 500
            const salesWidths = [200, 120, 80, 100]; 
            const salesRows = data.sales.map(s => [
                s.product_name,
                s.category_name,
                s.unit_name,
                formatNumber(s.total_quantity)
            ]);
            drawTable('Sales Report', salesHeaders, salesRows, salesWidths);
        } else {
            doc.fontSize(12).text('No sales data found for this period.');
            doc.moveDown(2);
        }

        // --- Restock Table ---
        if (data.restocks.length > 0) {
            const restockHeaders = ['Product Name', 'Supplier', 'Unit', 'Qty Added'];
            const restockWidths = [200, 140, 60, 100];
            const restockRows = data.restocks.map(r => [
                r.product_name,
                r.supplier_name,
                r.unit_name,
                formatNumber(r.total_quantity)
            ]);
            drawTable('Restock Report', restockHeaders, restockRows, restockWidths);
        } else {
            doc.fontSize(12).text('No restock data found for this period.');
        }

        // Finalize
        doc.end();

    } catch (err) {
        console.error('PDF Generation Error:', err);
        if (!res.headersSent) {
            res.status(500).send('Error generating PDF');
        }
    }
};

module.exports = { generateReportPDF };
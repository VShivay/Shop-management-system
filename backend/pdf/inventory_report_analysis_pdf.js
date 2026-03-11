const PDFDocument = require('pdfkit');
const { fetchReportData } = require('../controller/inventory_report_analysis');
const { reportFilterSchema } = require('../validation/reportValidation');
const { formatNumber } = require('../utils/reportUtils');
const { format } = require('date-fns'); // IMPORT DATE-FNS

const generateReportPDF = async (req, res) => {
    try {
        const { error, value } = reportFilterSchema.validate(req.query);
        if (error) return res.status(400).send(`Validation Error: ${error.details[0].message}`);

        const data = await fetchReportData(value);

        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Inventory_Report_${Date.now()}.pdf`);
        doc.pipe(res);

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
        doc.fontSize(14).text('Performance Summary', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(12);
        
        // Two-column layout for summary
        const summaryY = doc.y;
        doc.text(`Total Items Sold: ${formatNumber(data.summary.totalSalesQuantity)}`, 50, summaryY);
        doc.text(`Total Items Restocked: ${formatNumber(data.summary.totalRestockQuantity)}`, 50, summaryY + 20);
        
        doc.text(`Est. Revenue: Rs. ${formatNumber(data.summary.totalEstimatedRevenue)}`, 300, summaryY);
        doc.text(`Est. Cost: Rs. ${formatNumber(data.summary.totalEstimatedCost)}`, 300, summaryY + 20);
        
        // Grand Totals for Stock & Value
        doc.font('Helvetica-Bold')
           .text(`Total Current Stock (All): ${formatNumber(data.summary.totalCurrentStock)}`, 50, summaryY + 50);
        doc.text(`Total Stock Value: Rs. ${formatNumber(data.summary.totalCurrentStockValue)}`, 300, summaryY + 50);
        doc.font('Helvetica'); // Reset to normal font
        
        doc.y = summaryY + 80; // Move cursor down below the summary block

        // Date Formatter Helper
        const formatDate = (dateString) => {
            if (!dateString) return '-';
            try {
                return format(new Date(dateString), 'dd MMM yyyy, hh:mm a');
            } catch (e) {
                return '-';
            }
        };

        // --- ROBUST TABLE DRAWING FUNCTION ---
        const drawTable = (title, headers, rows, columnsWidth) => {
            const startX = 50;
            const rowHeight = 20;
            const bottomMargin = 50;
            const pageHeight = doc.page.height;
            const tableWidth = 500;

            if (doc.y + 60 > pageHeight - bottomMargin) doc.addPage();

            doc.fontSize(14).text(title, { underline: true });
            doc.moveDown(0.5);
            let y = doc.y;

            const drawHeaders = (currentY) => {
                doc.fillColor('#dddddd').rect(startX, currentY, tableWidth, rowHeight).fill();
                // Reduced font size to 8 to comfortably fit 7 columns
                doc.fillColor('black').fontSize(8); 
                
                let currentX = startX + 5;
                headers.forEach((header, i) => {
                    doc.text(header, currentX, currentY + 6, { width: columnsWidth[i], align: 'left' });
                    currentX += columnsWidth[i];
                });
                return currentY + rowHeight;
            };

            y = drawHeaders(y);

            rows.forEach((row, rowIndex) => {
                if (y + rowHeight > pageHeight - bottomMargin) {
                    doc.addPage();
                    y = 50;
                    y = drawHeaders(y); 
                }

                if (rowIndex % 2 === 1) {
                    doc.fillColor('#f9f9f9').rect(startX, y, tableWidth, rowHeight).fill();
                }
                doc.fillColor('black').fontSize(8); // Match header font size

                let currentX = startX + 5;
                
                row.forEach((text, i) => {
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

            doc.y = y + 20; 
        };

        // --- Sales Table ---
        if (data.sales.length > 0) {
            // Added Date/Time and adjusted widths to exactly 500
            const salesHeaders = ['Product Name', 'Category', 'Date/Time', 'Sold', 'In Stock', 'Stock Val', 'Revenue'];
            const salesWidths = [110, 70, 80, 40, 50, 70, 80]; 
            const salesRows = data.sales.map(s => [
                s.product_name,
                s.category_name,
                formatDate(s.transaction_date), // NEW DATA
                `${formatNumber(s.total_quantity)}`,
                `${formatNumber(s.current_stock)}`,
                `Rs. ${formatNumber(s.current_stock_value)}`,
                `Rs. ${formatNumber(s.actual_revenue || s.estimated_revenue)}` 
            ]);
            drawTable('Sales Report', salesHeaders, salesRows, salesWidths);
        } else {
            doc.fontSize(12).text('No sales data found for this period.');
            doc.moveDown(2);
        }

        // --- Restock Table ---
        if (data.restocks.length > 0) {
            const restockHeaders = ['Product Name', 'Supplier', 'Date/Time', 'Added', 'In Stock', 'Stock Val', 'Est. Cost'];
            const restockWidths = [110, 70, 80, 40, 50, 70, 80]; 
            const restockRows = data.restocks.map(r => [
                r.product_name,
                r.supplier_name,
                formatDate(r.transaction_date), // NEW DATA
                `${formatNumber(r.total_quantity)}`,
                `${formatNumber(r.current_stock)}`,
                `Rs. ${formatNumber(r.current_stock_value)}`,
                `Rs. ${formatNumber(r.estimated_cost)}`
            ]);
            drawTable('Restock Report', restockHeaders, restockRows, restockWidths);
        } else {
            doc.fontSize(12).text('No restock data found for this period.');
        }

        doc.end();

    } catch (err) {
        console.error('PDF Generation Error:', err);
        if (!res.headersSent) {
            res.status(500).send('Error generating PDF');
        }
    }
};

module.exports = { generateReportPDF };
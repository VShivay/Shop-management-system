const PDFDocument = require('pdfkit');

const generatePDF = (res, data) => {
    const doc = new PDFDocument({ margin: 30 });
    
    // Set headers for download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=sales_report.pdf');
    doc.pipe(res);

    // -- Header Section --
    doc.fontSize(20).text('Sales Analysis Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Period: ${data.dateRange.start.split(' ')[0]} to ${data.dateRange.end.split(' ')[0]}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
    doc.moveDown(2);

    // -- Summary Section --
    doc.fontSize(12).font('Helvetica-Bold').text('Summary Overview');
    doc.fontSize(10).font('Helvetica')
       .text(`Total Sales: ${data.summary.grandTotalSales}`)
       .text(`Total Bills: ${data.summary.totalBillsGenerated}`);
    doc.moveDown(2);

    // -- Helper: Draw Table Row --
    const drawTableRow = (y, c1, c2, c3, c4, font = 'Helvetica') => {
        doc.font(font).fontSize(9);
        doc.text(c1, 50, y, { width: 150, lineBreak: false });
        doc.text(c2, 200, y, { width: 100, align: 'right' });
        doc.text(c3, 300, y, { width: 100, align: 'right' });
        if(c4) doc.text(c4, 400, y, { width: 100, align: 'right' });
    };

    const drawLine = (y) => {
        doc.strokeColor('#aaaaaa').lineWidth(1).moveTo(30, y).lineTo(550, y).stroke();
    };

    // 1. Customer Analysis Table
    doc.fontSize(14).font('Helvetica-Bold').text('Customer Wise Sales', 30, doc.y);
    doc.moveDown(0.5);
    
    let y = doc.y;
    // Table Header
    drawTableRow(y, 'Customer Name', 'Bills', 'Paid', 'Total Sales', 'Helvetica-Bold');
    drawLine(y + 15);
    y += 20;

    data.customerAnalysis.forEach((cust) => {
        if (y > 700) { // Add new page if bottom reached
            doc.addPage();
            y = 50;
        }
        drawTableRow(y, cust.customer_name, cust.total_bills, cust.total_received, cust.total_sales_amount);
        y += 15;
    });
    doc.moveDown(3);

    // 2. Product Analysis Table
    // Check space
    if (doc.y > 600) doc.addPage(); 
    
    doc.fontSize(14).font('Helvetica-Bold').text('Product Wise Sales', 30, doc.y);
    doc.moveDown(0.5);

    y = doc.y;
    drawTableRow(y, 'Product Name', 'Unit', 'Qty Sold', 'Revenue', 'Helvetica-Bold');
    drawLine(y + 15);
    y += 20;

    data.productAnalysis.forEach((prod) => {
        if (y > 700) {
            doc.addPage();
            y = 50;
        }
        drawTableRow(y, prod.product_name, prod.unit_name || '-', prod.total_qty_sold, prod.total_revenue);
        y += 15;
    });

    doc.end();
};

module.exports = { generatePDF };
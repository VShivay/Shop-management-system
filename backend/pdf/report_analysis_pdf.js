const PDFDocument = require('pdfkit-table');

exports.createReportPDF = (res, data, summary, type, startDate, endDate) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4' });

    // Set headers for file download
    const filename = `${type}_report_${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

    doc.pipe(res);

    // --- Header ---
    doc.fontSize(20).text(`${type.toUpperCase()} PROFIT & LOSS REPORT`, { align: 'center' });
    doc.moveDown();
    
    doc.fontSize(10).text(`Generated On: ${new Date().toLocaleString()}`);
    doc.text(`Period: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`);
    doc.moveDown();

    // --- Summary Section ---
    doc.fontSize(12).text('Summary Overview', { underline: true });
    doc.fontSize(10);
    doc.text(`Total Sales: $${summary.totalSales.toFixed(2)}`);
    doc.text(`Total Cost:  $${summary.totalCost.toFixed(2)}`);
    
    const profitColor = summary.totalProfit >= 0 ? 'green' : 'red';
    doc.fillColor(profitColor).text(`Net Profit/Loss: $${summary.totalProfit.toFixed(2)}`).fillColor('black');
    doc.moveDown();

    // --- Table ---
    const table = {
        title: "Transaction Details",
        headers: [
            { label: "Date", property: "date", width: 60 },
            { label: "Bill #", property: "bill", width: 60 },
            { label: "Product", property: "prod", width: 130 },
            { label: "Qty", property: "qty", width: 40 },
            { label: "Sale Price", property: "sale", width: 60 },
            { label: "Cost", property: "cost", width: 60 },
            { label: "Profit", property: "profit", width: 60 }
        ],
        datas: data.map(item => ({
            date: new Date(item.bill_date).toLocaleDateString(),
            bill: item.bill_number,
            prod: item.product_name,
            qty: item.quantity,
            sale: Number(item.total_revenue).toFixed(2),
            cost: (Number(item.quantity) * Number(item.cost_price)).toFixed(2),
            profit: Number(item.profit).toFixed(2)
        }))
    };

    doc.table(table, {
        prepareHeader: () => doc.font("Helvetica-Bold").fontSize(8),
        prepareRow: (row, indexColumn, indexRow, rect, rowData) => {
            doc.font("Helvetica").fontSize(8);
            // Highlight negative profit rows
            if (indexColumn === 6 && parseFloat(rowData.profit) < 0) {
                doc.fillColor('red');
            } else {
                doc.fillColor('black');
            }
        },
    });

    doc.end();
};
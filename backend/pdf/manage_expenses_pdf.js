const PDFDocument = require('pdfkit');
const db = require('../db');

/**
 * Reuses the same date-filter logic as the controller
 * so PDF output always matches table output.
 */
function buildDateFilter(filter, month, year, startParamIndex = 1) {
    const conditions = [];
    const params = [];
    let idx = startParamIndex;
    const nowIST = "NOW() AT TIME ZONE 'Asia/Kolkata'";

    if (filter === 'today') {
        conditions.push(`e.expense_date = (${nowIST})::DATE`);
    } else if (filter === 'yesterday') {
        conditions.push(`e.expense_date = (${nowIST})::DATE - INTERVAL '1 day'`);
    } else if (filter === 'month') {
        if (month && year) {
            conditions.push(`EXTRACT(MONTH FROM e.expense_date) = $${idx++}`);
            conditions.push(`EXTRACT(YEAR FROM e.expense_date) = $${idx++}`);
            params.push(month, year);
        } else if (year) {
            conditions.push(`EXTRACT(MONTH FROM e.expense_date) = EXTRACT(MONTH FROM (${nowIST})::DATE)`);
            conditions.push(`EXTRACT(YEAR FROM e.expense_date) = $${idx++}`);
            params.push(year);
        } else {
            conditions.push(`EXTRACT(MONTH FROM e.expense_date) = EXTRACT(MONTH FROM (${nowIST})::DATE)`);
            conditions.push(`EXTRACT(YEAR FROM e.expense_date) = EXTRACT(YEAR FROM (${nowIST})::DATE)`);
        }
    } else if (filter === 'year') {
        if (year) {
            conditions.push(`EXTRACT(YEAR FROM e.expense_date) = $${idx++}`);
            params.push(year);
        } else {
            conditions.push(`EXTRACT(YEAR FROM e.expense_date) = EXTRACT(YEAR FROM (${nowIST})::DATE)`);
        }
    }

    return { conditions, params, nextParamIndex: idx };
}

/**
 * GET /api/expenses/pdf/export
 * Streams a PDF report of expenses matching the given filters.
 *
 * Query params:
 *   filter=today|yesterday|month|year
 *   month=4   year=2025   category_id=3
 */
exports.generateExpensesPDF = async (req, res) => {
    try {
        const { filter, month, year, category_id } = req.query;

        const params = [];
        const conditions = ['1=1'];
        let idx = 1;

        const dateFilter = buildDateFilter(filter, month ? parseInt(month) : null, year ? parseInt(year) : null, idx);
        conditions.push(...dateFilter.conditions);
        params.push(...dateFilter.params);
        idx = dateFilter.nextParamIndex;

        if (category_id) {
            conditions.push(`e.category_id = $${idx++}`);
            params.push(parseInt(category_id));
        }

        const whereClause = conditions.join(' AND ');

        // Fetch all matching expenses (no pagination — PDF gets everything)
        const dataQuery = `
            SELECT 
                e.expense_id,
                e.expense_name,
                e.amount,
                e.expense_date,
                ec.category_name,
                u.name AS paid_by_name
            FROM expenses e
            LEFT JOIN expense_categories ec ON e.category_id = ec.category_id
            LEFT JOIN users u ON e.paid_by = u.user_id
            WHERE ${whereClause}
            ORDER BY e.expense_date DESC, e.expense_id DESC
        `;
        const { rows } = await db.pool.query(dataQuery, params);

        const totalAmount = rows.reduce((sum, r) => sum + parseFloat(r.amount), 0);

        // ── Build filter label for title ──────────────────────────────────────
        const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];

        let periodLabel = 'All Expenses';
        if (filter === 'today') periodLabel = 'Today\'s Expenses';
        else if (filter === 'yesterday') periodLabel = 'Yesterday\'s Expenses';
        else if (filter === 'month') {
            const m = month ? MONTH_NAMES[parseInt(month)] : 'Current Month';
            const y = year || new Date().getFullYear();
            periodLabel = `Expenses — ${m} ${y}`;
        } else if (filter === 'year') {
            periodLabel = `Expenses — ${year || new Date().getFullYear()}`;
        }

        // ── Stream PDF ────────────────────────────────────────────────────────
        const doc = new PDFDocument({ margin: 40, size: 'A4' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="expenses_${Date.now()}.pdf"`);
        doc.pipe(res);

        // ── Header ────────────────────────────────────────────────────────────
        doc.fontSize(18).font('Helvetica-Bold').text('Expense Report', { align: 'center' });
        doc.fontSize(11).font('Helvetica').text(periodLabel, { align: 'center' });
        doc.moveDown(0.5);

        // Print date
        const printedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        doc.fontSize(9).fillColor('#666666').text(`Printed: ${printedAt}`, { align: 'right' });
        doc.fillColor('#000000');
        doc.moveDown(0.5);

        // ── Divider ───────────────────────────────────────────────────────────
        doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#cccccc').lineWidth(1).stroke();
        doc.moveDown(0.5);

        // ── Summary ───────────────────────────────────────────────────────────
        doc.fontSize(10).font('Helvetica-Bold')
            .text(`Total Records: ${rows.length}`, 40, doc.y, { continued: true })
            .text(`Total Amount: ₹${totalAmount.toFixed(2)}`, { align: 'right' });
        doc.moveDown(0.8);

        // ── Table Header ──────────────────────────────────────────────────────
        const colWidths = { id: 40, date: 75, name: 175, category: 100, paid_by: 90, amount: 80 };
        const startX = 40;
        let y = doc.y;

        // Header background
        doc.rect(startX, y, 515, 18).fillColor('#1a1a2e').fill();

        doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
        let cx = startX + 4;
        doc.text('#', cx, y + 4, { width: colWidths.id - 4 }); cx += colWidths.id;
        doc.text('Date', cx, y + 4, { width: colWidths.date }); cx += colWidths.date;
        doc.text('Expense Name', cx, y + 4, { width: colWidths.name }); cx += colWidths.name;
        doc.text('Category', cx, y + 4, { width: colWidths.category }); cx += colWidths.category;
        doc.text('Paid By', cx, y + 4, { width: colWidths.paid_by }); cx += colWidths.paid_by;
        doc.text('Amount (₹)', cx, y + 4, { width: colWidths.amount, align: 'right' });

        y += 18;
        doc.fillColor('#000000').font('Helvetica').fontSize(9);

        // ── Table Rows ────────────────────────────────────────────────────────
        rows.forEach((row, i) => {
            // Page break check
            if (y > 760) {
                doc.addPage();
                y = 40;
            }

            const rowH = 17;
            const bg = i % 2 === 0 ? '#f9f9f9' : '#ffffff';
            doc.rect(startX, y, 515, rowH).fillColor(bg).fill();

            doc.fillColor('#111111');
            cx = startX + 4;

            const dateStr = row.expense_date
                ? new Date(row.expense_date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })
                : '—';

            doc.text(String(row.expense_id), cx, y + 3, { width: colWidths.id - 4 }); cx += colWidths.id;
            doc.text(dateStr, cx, y + 3, { width: colWidths.date }); cx += colWidths.date;
            doc.text(row.expense_name || '—', cx, y + 3, { width: colWidths.name }); cx += colWidths.name;
            doc.text(row.category_name || '—', cx, y + 3, { width: colWidths.category }); cx += colWidths.category;
            doc.text(row.paid_by_name || '—', cx, y + 3, { width: colWidths.paid_by }); cx += colWidths.paid_by;
            doc.text(`₹${parseFloat(row.amount).toFixed(2)}`, cx, y + 3, { width: colWidths.amount, align: 'right' });

            // Row bottom border
            doc.moveTo(startX, y + rowH).lineTo(555, y + rowH).strokeColor('#e0e0e0').lineWidth(0.5).stroke();

            y += rowH;
        });

        if (rows.length === 0) {
            doc.moveDown().fontSize(11).fillColor('#888888').text('No expenses found for the selected period.', { align: 'center' });
        }

        // ── Footer Total ──────────────────────────────────────────────────────
        doc.moveDown(1);
        doc.rect(40, doc.y, 515, 20).fillColor('#1a1a2e').fill();
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10)
            .text(`Grand Total`, 44, doc.y - 16, { width: 435, continued: true })
            .text(`₹${totalAmount.toFixed(2)}`, { align: 'right', width: 76 });

        doc.end();

    } catch (err) {
        console.error('generateExpensesPDF Error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to generate PDF.' });
        }
    }
};
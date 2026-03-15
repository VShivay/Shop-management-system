// controller/view_wholesale_bill.js
const db = require('../db');
const Joi = require('joi');
const { buildWholesaleBillPDF } = require('../pdf/view_wholesale_bill_pdf');
const { formatInTimeZone } = require('date-fns-tz'); 

// --- Helper for IST Date Formatting ---
const formatDateToIST = (dateString) => {
    if (!dateString) return '-';
    const dateObj = new Date(dateString);
    if (isNaN(dateObj.getTime())) return '-';
    
    // Forces Indian Standard Time and returns a FULL timestamp 
    // Example output: "2026-03-15 19:06:52"
    // (If you also want milliseconds and the +05:30 timezone indicator, 
    // change the pattern to: "yyyy-MM-dd'T'HH:mm:ss.SSSxxx")
    return formatInTimeZone(dateObj, 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss');
};

// --- Schemas ---
const recordPaymentSchema = Joi.object({
    due_id: Joi.number().integer().required(),
    amount_paid: Joi.number().positive().precision(2).required(),
    payment_method_id: Joi.number().integer().required(),
    remarks: Joi.string().allow('', null)
});

// --- Controller Functions ---

// 1. Search Customers (For Debounce)
exports.searchCustomers = async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.json([]);

        // Search specifically for wholesale customers
        const sql = `
            SELECT customer_id, customer_name, phone 
            FROM customers 
            WHERE customer_type = 'wholesale' 
            AND (customer_name ILIKE $1 OR phone ILIKE $1)
            LIMIT 10
        `;
        const result = await db.query(sql, [`%${query}%`]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error searching customers' });
    }
};

// 2. Fetch Wholesale Bills (Main List with Filters)
exports.getWholesaleBills = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            search_customer_id, 
            filter_date, // 'today', 'week', 'month', 'year'
            start_date, 
            end_date 
        } = req.query;

        const offset = (page - 1) * limit;
        const params = [];
        let whereClauses = [`1=1`]; // Default true
        let paramIndex = 1;

        // Filter by Customer
        if (search_customer_id) {
            whereClauses.push(`wb.customer_id = $${paramIndex}`);
            params.push(search_customer_id);
            paramIndex++;
        }

        // Filter by Date
        if (start_date && end_date) {
            // Custom Range
            whereClauses.push(`wb.bill_date BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
            params.push(start_date, end_date);
            paramIndex += 2;
        } else {
            // Presets
            const dateField = 'wb.bill_date';
            if (filter_date === 'today') {
                whereClauses.push(`${dateField}::DATE = CURRENT_DATE`);
            } else if (filter_date === 'week') {
                whereClauses.push(`${dateField} >= CURRENT_DATE - INTERVAL '1 week'`);
            } else if (filter_date === 'month') {
                whereClauses.push(`${dateField} >= CURRENT_DATE - INTERVAL '1 month'`);
            } else if (filter_date === 'year') {
                whereClauses.push(`${dateField} >= CURRENT_DATE - INTERVAL '1 year'`);
            } else {
                // DEFAULT: Last 7 days (Recent) if no specific date filter provided
                whereClauses.push(`${dateField} >= CURRENT_DATE - INTERVAL '1 week'`);
            }
        }

        const whereSQL = whereClauses.join(' AND ');

        // Count Query
        const countSql = `SELECT COUNT(*) FROM wholesale_bills wb WHERE ${whereSQL}`;
        const countRes = await db.query(countSql, params);
        const totalItems = parseInt(countRes.rows[0].count);

        // Data Query
        const dataSql = `
            SELECT 
                wb.wholesale_bill_id,
                wb.bill_number,
                wb.bill_date,
                wb.total_amount,
                wb.amount_paid,
                wb.payment_status,
                c.customer_name,
                cd.due_id,
                cd.balance_due -- To show if payment can be recorded
            FROM wholesale_bills wb
            JOIN customers c ON wb.customer_id = c.customer_id
            LEFT JOIN customer_dues cd ON wb.wholesale_bill_id = cd.wholesale_bill_id
            WHERE ${whereSQL}
            ORDER BY wb.bill_date DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        params.push(limit, offset);
        const result = await db.query(dataSql, params);

        // <-- Apply Date Formatting Here -->
        const formattedData = result.rows.map(row => ({
            ...row,
            bill_date: formatDateToIST(row.bill_date) 
        }));

        res.json({
            totalItems,
            totalPages: Math.ceil(totalItems / limit),
            currentPage: parseInt(page),
            data: formattedData // <-- Return the formatted array
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error fetching bills' });
    }
};

// 3. Record Due Payment
exports.recordDuePayment = async (req, res) => {
    try {
        // Validation
        const { error } = recordPaymentSchema.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const { due_id, amount_paid, payment_method_id, remarks } = req.body;

        // Check if due exists
        const dueCheck = await db.query('SELECT balance_due FROM customer_dues WHERE due_id = $1', [due_id]);
        if (dueCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Due record not found' });
        }

        if (parseFloat(amount_paid) > parseFloat(dueCheck.rows[0].balance_due)) {
            return res.status(400).json({ error: 'Amount exceeds balance due.' });
        }

        // Insert into history (DB Trigger will auto-update bills and dues)
        const insertSql = `
            INSERT INTO due_payment_history (due_id, amount_paid, payment_method_id, remarks)
            VALUES ($1, $2, $3, $4)
            RETURNING payment_id
        `;
        
        await db.query(insertSql, [due_id, amount_paid, payment_method_id, remarks]);

        res.json({ message: 'Payment recorded successfully' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error recording payment' });
    }
};

// 4. Generate PDF
exports.generateBillPDF = async (req, res) => {
    try {
        const { id } = req.params; // wholesale_bill_id

        // Fetch Bill & Customer
        const billSql = `
            SELECT wb.*, c.customer_name, c.phone, c.address, c.email
            FROM wholesale_bills wb
            JOIN customers c ON wb.customer_id = c.customer_id
            WHERE wb.wholesale_bill_id = $1
        `;
        const billRes = await db.query(billSql, [id]);
        if (billRes.rows.length === 0) return res.status(404).json({ error: 'Bill not found' });
        const bill = billRes.rows[0];

        // Fetch Items
        const itemsSql = `
            SELECT wbi.*, p.product_name 
            FROM wholesale_bill_items wbi
            JOIN products p ON wbi.product_id = p.product_id
            WHERE wbi.wholesale_bill_id = $1
        `;
        const itemsRes = await db.query(itemsSql, [id]);

        // Fetch Payment History (via Dues table)
        const paySql = `
            SELECT dph.*, pm.method_name
            FROM due_payment_history dph
            JOIN customer_dues cd ON dph.due_id = cd.due_id
            LEFT JOIN payment_methods pm ON dph.payment_method_id = pm.payment_method_id
            WHERE cd.wholesale_bill_id = $1
            ORDER BY dph.payment_date DESC
        `;
        const payRes = await db.query(paySql, [id]);

        // Stream PDF
        const filename = `bill_${bill.bill_number}.pdf`;
        res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-type', 'application/pdf');

        // Note: Formatting inside the PDF builder might still be required depending on how view_wholesale_bill_pdf.js is written.
        buildWholesaleBillPDF(
            { bill, items: itemsRes.rows, payments: payRes.rows },
            (chunk) => res.write(chunk),
            () => res.end()
        );

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error generating PDF' });
    }
};

// 5. Get Single Bill Details (Optional, for frontend modal view)
exports.getBillDetails = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Basic bill info
        const billSql = `
            SELECT wb.*, c.customer_name, cd.due_id, cd.balance_due 
            FROM wholesale_bills wb
            JOIN customers c ON wb.customer_id = c.customer_id
            LEFT JOIN customer_dues cd ON wb.wholesale_bill_id = cd.wholesale_bill_id
            WHERE wb.wholesale_bill_id = $1
        `;
        const billRes = await db.query(billSql, [id]);
        if(billRes.rows.length === 0) return res.status(404).json({error: 'Not found'});

        // Payment History
        const paySql = `
            SELECT dph.*, pm.method_name
            FROM due_payment_history dph
            JOIN customer_dues cd ON dph.due_id = cd.due_id
            LEFT JOIN payment_methods pm ON dph.payment_method_id = pm.payment_method_id
            WHERE cd.wholesale_bill_id = $1
            ORDER BY dph.payment_date DESC
        `;
        const payRes = await db.query(paySql, [id]);

        // <-- Apply Date Formatting Here -->
        const formattedBill = {
            ...billRes.rows[0],
            bill_date: formatDateToIST(billRes.rows[0].bill_date)
        };

        const formattedPaymentHistory = payRes.rows.map(pay => ({
            ...pay,
            payment_date: formatDateToIST(pay.payment_date)
        }));

        res.json({
            bill: formattedBill,
            payment_history: formattedPaymentHistory
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
}
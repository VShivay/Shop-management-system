const db = require('../db');
const Joi = require('joi');
const pdfGenerator = require('../pdf/view_retail_bill_pdf');
const { formatInTimeZone } = require('date-fns-tz'); // <-- Added import

// --- Helper for IST Date Formatting ---
const formatDateToIST = (dateString) => {
    if (!dateString) return '-';
    const dateObj = new Date(dateString);
    if (isNaN(dateObj.getTime())) return '-';
    // Forces Indian Standard Time with 12-hour AM/PM format
    return formatInTimeZone(dateObj, 'Asia/Kolkata', 'yyyy-MM-dd hh:mm:ss a');
};

// Validation Schemas
const fetchSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).default(10),
    search: Joi.string().allow('').optional(), // For Customer Name
    filterType: Joi.string().valid('today', 'week', 'month', 'year', 'custom').default('week'),
    startDate: Joi.date().iso().optional(), // Used if filterType is custom
    endDate: Joi.date().iso().optional()
});

const paymentSchema = Joi.object({
    retail_bill_id: Joi.number().integer().required(),
    amount_paid: Joi.number().positive().required(),
    payment_method_id: Joi.number().integer().required(),
    remarks: Joi.string().allow('').optional()
});

// Helper to determine date range
const getDateRange = (filterType, start, end) => {
    const now = new Date();
    let dateCondition = "";
    const values = [];
    
    // Default to last week if not specified or 'week'
    let sDate = new Date();
    
    switch (filterType) {
        case 'today':
            dateCondition = "AND rb.bill_date >= CURRENT_DATE";
            break;
        case 'month':
             // Start of current month
            dateCondition = "AND rb.bill_date >= DATE_TRUNC('month', CURRENT_DATE)";
            break;
        case 'year':
            // Start of current year
            dateCondition = "AND rb.bill_date >= DATE_TRUNC('year', CURRENT_DATE)";
            break;
        case 'custom':
            if (start && end) {
                dateCondition = "AND rb.bill_date BETWEEN $2 AND $3";
                values.push(start, end);
            }
            break;
        case 'week':
        default:
            // Last 7 days
            dateCondition = "AND rb.bill_date >= CURRENT_DATE - INTERVAL '7 days'";
            break;
    }
    return { dateCondition, values };
};

exports.getRetailBills = async (req, res) => {
    try {
        // 1. Validate Query Params
        const { value, error } = fetchSchema.validate(req.query);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const { page, limit, search, filterType, startDate, endDate } = value;
        const offset = (page - 1) * limit;

        // 2. Build Query
        let queryParams = [limit, offset];
        let paramCounter = 3; // $1 is limit, $2 is offset

        // Date Logic
        // Note: We adjust param indices based on whether custom dates are used
        let dateQuery = "";
        if (filterType === 'custom' && startDate && endDate) {
            dateQuery = `AND rb.bill_date::date BETWEEN $${paramCounter} AND $${paramCounter + 1}`;
            queryParams.push(startDate, endDate);
            paramCounter += 2;
        } else {
            // Static date logic handled directly in SQL string for ease or specific intervals
            const { dateCondition } = getDateRange(filterType);
            dateQuery = dateCondition;
        }

        // Search Logic (Customer Name) - "Debounce" happens on frontend, here we handle the result
        let searchQuery = "";
        if (search) {
            searchQuery = `AND c.customer_name ILIKE $${paramCounter}`;
            queryParams.push(`%${search}%`);
            paramCounter++;
        }

        const sql = `
            SELECT 
                rb.retail_bill_id,
                rb.bill_number,
                rb.bill_date,
                rb.customer_id,
                c.customer_name,
                c.phone as customer_phone,
                rb.total_amount,
                rb.amount_paid,
                rb.payment_status,
                cd.due_id,
                cd.balance_due,
                u.name as created_by
            FROM retail_bills rb
            LEFT JOIN customers c ON rb.customer_id = c.customer_id
            LEFT JOIN users u ON rb.created_by = u.user_id
            LEFT JOIN customer_dues cd ON rb.retail_bill_id = cd.retail_bill_id 
                                      AND cd.bill_type = 'retail'
            WHERE 1=1
            ${dateQuery}
            ${searchQuery}
            ORDER BY rb.bill_date DESC
            LIMIT $1 OFFSET $2
        `;

        const countSql = `
            SELECT COUNT(*) as total 
            FROM retail_bills rb
            LEFT JOIN customers c ON rb.customer_id = c.customer_id
            WHERE 1=1 ${dateQuery} ${searchQuery}
        `;

        // Execute Queries
        // Note: For count query, remove limit/offset params (first 2)
        const countParams = queryParams.slice(2); 
        // We need to re-index the count params for the query string ($3 becomes $1, etc)
        // A simpler way for count is to rebuild the param array specific to it, 
        // but for brevity we execute the main query first.

        const result = await db.query(sql, queryParams);
        
        // Quick fix for Count params mapping: 
        // If we used $3 and $4 in main query, they are $1 and $2 in count query
        let adjustedCountSql = countSql;
        if (filterType === 'custom') {
            adjustedCountSql = adjustedCountSql.replace('$3', '$1').replace('$4', '$2');
            if(search) adjustedCountSql = adjustedCountSql.replace('$5', '$3');
        } else if (search) {
            adjustedCountSql = adjustedCountSql.replace('$3', '$1');
        }

        const countResult = await db.query(adjustedCountSql, countParams);

        // <-- Apply Date Formatting Here -->
        const formattedData = result.rows.map(row => ({
            ...row,
            bill_date: formatDateToIST(row.bill_date)
        }));

        res.json({
            data: formattedData, // <-- Return formatted data
            pagination: {
                total: parseInt(countResult.rows[0].total),
                page,
                limit,
                totalPages: Math.ceil(countResult.rows[0].total / limit)
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error fetching bills' });
    }
};

exports.recordPayment = async (req, res) => {
    // This function relies on your DB trigger 'trg_sync_payments_to_bills'
    // We only insert into due_payment_history; the DB handles the rest.
    
    try {
        const { value, error } = paymentSchema.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const { retail_bill_id, amount_paid, payment_method_id, remarks } = value;

        // 1. Find the due_id associated with this retail bill
        const dueCheck = await db.query(
            `SELECT due_id, balance_due FROM customer_dues WHERE retail_bill_id = $1`,
            [retail_bill_id]
        );

        if (dueCheck.rows.length === 0) {
            return res.status(404).json({ error: 'No due record found for this bill (Bill might be fully paid initially or customer is generic).' });
        }

        const dueRecord = dueCheck.rows[0];

        // 2. Insert Payment
        // Your trigger will validate if amount_paid > balance_due and throw an exception if so.
        // We capture that in the catch block.
        await db.query(
            `INSERT INTO due_payment_history (due_id, amount_paid, payment_method_id, remarks)
             VALUES ($1, $2, $3, $4)`,
            [dueRecord.due_id, amount_paid, payment_method_id, remarks]
        );

        res.json({ message: 'Payment recorded successfully. Bill status updated.' });

    } catch (err) {
        console.error(err);
        // Postgres Trigger Exceptions usually code 'P0001'
        if (err.message.includes('Payment rejected')) {
            return res.status(400).json({ error: err.message }); // Send the trigger message to user
        }
        res.status(500).json({ error: 'Server error recording payment' });
    }
};

exports.downloadBillPdf = async (req, res) => {
    try {
        const billId = req.params.id;

        // 1. Fetch Basic Bill & Customer Info
        const billQuery = `
            SELECT 
                rb.*, 
                c.customer_name, c.address as customer_address, c.phone as customer_phone, c.email as customer_email,
                u.name as created_by_name,
                pm.method_name as payment_method_name
            FROM retail_bills rb
            LEFT JOIN customers c ON rb.customer_id = c.customer_id
            LEFT JOIN users u ON rb.created_by = u.user_id
            LEFT JOIN payment_methods pm ON rb.payment_method_id = pm.payment_method_id
            WHERE rb.retail_bill_id = $1
        `;
        
        // 2. Fetch Bill Items
        const itemsQuery = `
            SELECT rbi.*, p.product_name 
            FROM retail_bill_items rbi
            JOIN products p ON rbi.product_id = p.product_id
            WHERE rbi.retail_bill_id = $1
        `;

        // 3. Fetch Payment History (New)
        // We join customer_dues to link the bill to the history
        const historyQuery = `
            SELECT 
                dph.payment_id,
                dph.amount_paid,
                dph.payment_date,
                dph.remarks,
                pm.method_name
            FROM customer_dues cd
            JOIN due_payment_history dph ON cd.due_id = dph.due_id
            LEFT JOIN payment_methods pm ON dph.payment_method_id = pm.payment_method_id
            WHERE cd.retail_bill_id = $1
            ORDER BY dph.payment_date DESC
        `;

        const billRes = await db.query(billQuery, [billId]);
        if (billRes.rows.length === 0) return res.status(404).json({ error: 'Bill not found' });

        const itemsRes = await db.query(itemsQuery, [billId]);
        const historyRes = await db.query(historyQuery, [billId]);

        const billData = {
            ...billRes.rows[0],
            items: itemsRes.rows,
            payment_history: historyRes.rows // Attach history here
        };

        // 4. Generate PDF
        const stream = res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment;filename=bill_${billData.bill_number}.pdf`,
        });

        pdfGenerator.buildPDF(
            (chunk) => stream.write(chunk),
            () => stream.end(),
            billData
        );

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error generating PDF' });
    }
};
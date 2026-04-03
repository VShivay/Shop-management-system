const db = require('../db');
const Joi = require('joi');
const { formatNumber } = require('../utils/reportUtils');

// ─── Month name → number map ─────────────────────────────────────────────────
// Accepts: "jan", "january", "1", 1  → always returns a number 1-12 or null

const MONTH_MAP = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
};

/**
 * Normalise whatever the frontend sends as "month" to a numeric 1-12.
 * Accepts: number (1-12), numeric string ("4"), short name ("jan"),
 *          full name ("January"). Returns null if unrecognisable.
 */
function parseMonth(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Number(raw);
    if (!isNaN(n) && n >= 1 && n <= 12) return Math.round(n);
    const key = String(raw).trim().toLowerCase();
    return MONTH_MAP[key] ?? null;
}

// ─── Joi Schemas ─────────────────────────────────────────────────────────────

const addExpenseSchema = Joi.object({
    category_id: Joi.number().integer().positive().required(),
    expense_name: Joi.string().trim().min(2).max(150).required(),
    amount: Joi.number().positive().required(),
    expense_date: Joi.date().iso().optional(),
    paid_by: Joi.number().integer().positive().optional(),
});

const viewExpensesSchema = Joi.object({
    filter: Joi.string().valid('today', 'yesterday', 'month', 'year').optional(),
    // month accepts numeric string ("4") or name ("jan" / "January")
    month: Joi.alternatives()
        .try(
            Joi.number().integer().min(1).max(12),
            Joi.string().trim()
        )
        .optional(),
    year: Joi.number().integer().min(2000).max(2100).optional(),
    category_id: Joi.number().integer().positive().optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a WHERE clause based on date filter params.
 * Returns { conditions: string[], params: any[], nextParamIndex: number }
 */
function buildDateFilter(filter, rawMonth, year, startParamIndex = 1) {
    // Always normalise month to a number before using it
    const month = parseMonth(rawMonth);
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
            // current month of given year
            conditions.push(`EXTRACT(MONTH FROM e.expense_date) = EXTRACT(MONTH FROM (${nowIST})::DATE)`);
            conditions.push(`EXTRACT(YEAR FROM e.expense_date) = $${idx++}`);
            params.push(year);
        } else {
            // current month, current year
            conditions.push(`EXTRACT(MONTH FROM e.expense_date) = EXTRACT(MONTH FROM (${nowIST})::DATE)`);
            conditions.push(`EXTRACT(YEAR FROM e.expense_date) = EXTRACT(YEAR FROM (${nowIST})::DATE)`);
        }
    } else if (filter === 'year') {
        const targetYear = year || null;
        if (targetYear) {
            conditions.push(`EXTRACT(YEAR FROM e.expense_date) = $${idx++}`);
            params.push(targetYear);
        } else {
            conditions.push(`EXTRACT(YEAR FROM e.expense_date) = EXTRACT(YEAR FROM (${nowIST})::DATE)`);
        }
    }

    return { conditions, params, nextParamIndex: idx };
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /api/expenses
 * View all expenses with pagination + date/category filter
 */
exports.viewExpenses = async (req, res) => {
    const { error, value } = viewExpensesSchema.validate(req.query);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { filter, month, year, category_id, page, limit } = value;
    const offset = (page - 1) * limit;

    try {
        const params = [];
        const conditions = ['1=1'];
        let idx = 1;

        // Date filter
        const dateFilter = buildDateFilter(filter, month, year, idx);
        conditions.push(...dateFilter.conditions);
        params.push(...dateFilter.params);
        idx = dateFilter.nextParamIndex;

        // Category filter
        if (category_id) {
            conditions.push(`e.category_id = $${idx++}`);
            params.push(category_id);
        }

        const whereClause = conditions.join(' AND ');

        // Total count for pagination
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM expenses e
            WHERE ${whereClause}
        `;
        const countRes = await db.pool.query(countQuery, params);
        const total = parseInt(countRes.rows[0].total);

        // Total amount summary
        const sumQuery = `
            SELECT COALESCE(SUM(e.amount), 0) AS total_amount
            FROM expenses e
            WHERE ${whereClause}
        `;
        const sumRes = await db.pool.query(sumQuery, params);
        const totalAmount = parseFloat(sumRes.rows[0].total_amount);

        // Main paginated query
        const dataQuery = `
            SELECT 
                e.expense_id,
                e.expense_name,
                e.amount,
                e.expense_date,
                e.created_at,
                ec.category_name,
                u.name AS paid_by_name,
                CASE WHEN e.inventory_transaction_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_inventory_expense,
                e.inventory_transaction_id
            FROM expenses e
            LEFT JOIN expense_categories ec ON e.category_id = ec.category_id
            LEFT JOIN users u ON e.paid_by = u.user_id
            WHERE ${whereClause}
            ORDER BY e.expense_date DESC, e.created_at DESC
            LIMIT $${idx++} OFFSET $${idx++}
        `;
        params.push(limit, offset);

        const dataRes = await db.pool.query(dataQuery, params);

        return res.status(200).json({
            expenses: dataRes.rows.map(row => ({
                ...row,
                amount: parseFloat(row.amount),
                amount_formatted: formatNumber(row.amount),
            })),
            pagination: {
                total,
                page,
                limit,
                total_pages: Math.ceil(total / limit),
            },
            summary: {
                total_amount: totalAmount,
                total_amount_formatted: formatNumber(totalAmount),
            },
        });
    } catch (err) {
        console.error('viewExpenses Error:', err);
        return res.status(500).json({ error: 'Internal server error fetching expenses.' });
    }
};

/**
 * GET /api/expenses/:id
 * View full details of a specific expense including restock info if applicable
 */
exports.viewExpenseById = async (req, res) => {
    const expense_id = parseInt(req.params.id);
    if (isNaN(expense_id)) return res.status(400).json({ error: 'Invalid expense ID.' });

    try {
        // Base expense info
        const expenseRes = await db.pool.query(
            `SELECT 
                e.expense_id,
                e.expense_name,
                e.amount,
                e.expense_date,
                e.created_at,
                ec.category_name,
                ec.category_id,
                u.name AS paid_by_name,
                u.email AS paid_by_email,
                e.inventory_transaction_id
            FROM expenses e
            LEFT JOIN expense_categories ec ON e.category_id = ec.category_id
            LEFT JOIN users u ON e.paid_by = u.user_id
            WHERE e.expense_id = $1`,
            [expense_id]
        );

        if (expenseRes.rows.length === 0) {
            return res.status(404).json({ error: 'Expense not found.' });
        }

        const expense = expenseRes.rows[0];
        let inventoryDetails = null;

        // If linked to an inventory transaction, fetch full restock details
        if (expense.inventory_transaction_id) {
            const invRes = await db.pool.query(
                `SELECT 
                    it.transaction_id,
                    it.transaction_type,
                    it.quantity,
                    it.reference_type,
                    it.remarks,
                    p.product_id,
                    p.product_name,
                    c.category_name AS product_category,
                    un.unit_name,
                    s.supplier_id,
                    s.supplier_name,
                    s.contact_person AS supplier_contact,
                    s.phone AS supplier_phone,
                    s.email AS supplier_email,
                    s.gst_number AS supplier_gst,
                    s.address AS supplier_address,
                    ps.supply_price,
                    (it.quantity * ps.supply_price) AS total_supply_cost
                FROM inventory_transactions it
                LEFT JOIN products p ON it.product_id = p.product_id
                LEFT JOIN categories c ON p.category_id = c.category_id
                LEFT JOIN units un ON p.unit_id = un.unit_id
                LEFT JOIN suppliers s ON it.supplier_id = s.supplier_id
                LEFT JOIN product_suppliers ps ON (ps.product_id = it.product_id AND ps.supplier_id = it.supplier_id)
                WHERE it.transaction_id = $1`,
                [expense.inventory_transaction_id]
            );

            if (invRes.rows.length > 0) {
                inventoryDetails = invRes.rows[0];
            }
        }

        return res.status(200).json({
            expense,
            inventory_details: inventoryDetails,
        });
    } catch (err) {
        console.error('viewExpenseById Error:', err);
        return res.status(500).json({ error: 'Internal server error fetching expense details.' });
    }
};

/**
 * POST /api/expenses
 * Add a manual (non-inventory) expense
 */
exports.addExpense = async (req, res) => {
    const { error, value } = addExpenseSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { category_id, expense_name, amount, expense_date, paid_by } = value;
    const user_id = paid_by || req.user?.id || req.user?.user_id;

    try {
        // Verify category exists
        const catRes = await db.pool.query(
            `SELECT category_id FROM expense_categories WHERE category_id = $1`,
            [category_id]
        );
        if (catRes.rows.length === 0) {
            return res.status(404).json({ error: 'Expense category not found.' });
        }

        const insertRes = await db.pool.query(
            `INSERT INTO expenses (category_id, expense_name, amount, expense_date, paid_by)
             VALUES ($1, $2, $3, COALESCE($4, (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE), $5)
             RETURNING *`,
            [category_id, expense_name, amount, expense_date || null, user_id]
        );

        return res.status(201).json({
            message: 'Expense added successfully.',
            expense: insertRes.rows[0],
        });
    } catch (err) {
        console.error('addExpense Error:', err);
        return res.status(500).json({ error: 'Internal server error adding expense.' });
    }
};

/**
 * GET /api/expenses/categories
 * Fetch all expense categories for dropdown
 */
exports.getExpenseCategories = async (req, res) => {
    try {
        const result = await db.pool.query(
            `SELECT category_id, category_name FROM expense_categories ORDER BY category_name ASC`
        );
        return res.status(200).json({ categories: result.rows });
    } catch (err) {
        console.error('getExpenseCategories Error:', err);
        return res.status(500).json({ error: 'Internal server error fetching categories.' });
    }
};
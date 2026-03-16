// controller/manage_customer.js
const db = require('../db');
const Joi = require('joi');
const { formatInTimeZone } = require('date-fns-tz'); // <-- Added import

// --- HELPER: IST Date Formatting ---
const formatDateToIST = (dateString) => {
    if (!dateString) return '-';
    const dateObj = new Date(dateString);
    if (isNaN(dateObj.getTime())) return '-';
    // Forces Indian Standard Time with 12-hour AM/PM format
    return formatInTimeZone(dateObj, 'Asia/Kolkata', 'yyyy-MM-dd hh:mm:ss a');
};

// --- Validation Schemas ---

// Validation for Query Parameters (Filtering & Pagination)
const customerQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    search: Joi.string().trim().allow('').optional(), // For searching by name
    type: Joi.string().valid('retail', 'wholesale', 'all').default('wholesale'), // Default to wholesale per instructions
    is_active: Joi.string().valid('true', 'false', 'all').default('true'), // Default to active users usually, but 'all' is fine too
    sort_by: Joi.string().valid('name', 'date').default('name'),
    order: Joi.string().valid('ASC', 'DESC').default('ASC')
});

// Validation for ID Params
const idSchema = Joi.object({
    id: Joi.number().integer().required()
});

// --- Controller Functions ---

/**
 * Fetch Customers with filters
 * Default: Wholesale customers, Sorted by Name ASC
 */
const getCustomers = async (req, res) => {
    try {
        // 1. Validate Query Params
        const { error, value } = customerQuerySchema.validate(req.query);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { page, limit, search, type, is_active, sort_by, order } = value;
        const offset = (page - 1) * limit;

        // 2. Build SQL Query Dynamic Conditions
        const params = [];
        let queryParts = [`SELECT * FROM customers WHERE 1=1`];
        let countQueryParts = [`SELECT COUNT(*) FROM customers WHERE 1=1`];
        let paramIndex = 1;

        // Filter: Search Name (Partial Match)
        if (search) {
            const searchClause = ` AND customer_name ILIKE $${paramIndex}`;
            queryParts.push(searchClause);
            countQueryParts.push(searchClause);
            params.push(`%${search}%`);
            paramIndex++;
        }

        // Filter: Customer Type (Default 'wholesale' handled by Joi default, unless 'all' passed)
        if (type !== 'all') {
            const typeClause = ` AND customer_type = $${paramIndex}`;
            queryParts.push(typeClause);
            countQueryParts.push(typeClause);
            params.push(type);
            paramIndex++;
        }

        // Filter: Active Status
        if (is_active !== 'all') {
            const activeBool = is_active === 'true';
            const statusClause = ` AND is_active = $${paramIndex}`;
            queryParts.push(statusClause);
            countQueryParts.push(statusClause);
            params.push(activeBool);
            paramIndex++;
        }

        // Sorting (Default Name ASC)
        let sortColumn = 'customer_name';
        if (sort_by === 'date') sortColumn = 'created_at';
        
        queryParts.push(` ORDER BY ${sortColumn} ${order}`);

        // Pagination
        queryParts.push(` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`);
        const queryParams = [...params, limit, offset];

        // 3. Execute Queries (Data + Total Count)
        const dataQuery = queryParts.join('');
        const countQuery = countQueryParts.join('');

        const [dataResult, countResult] = await Promise.all([
            db.query(dataQuery, queryParams),
            db.query(countQuery, params)
        ]);

        const totalItems = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalItems / limit);

        // <-- Apply Date Formatting Here -->
        const formattedData = dataResult.rows.map(row => ({
            ...row,
            created_at: formatDateToIST(row.created_at),
            updated_at: formatDateToIST(row.updated_at)
        }));

        // 4. Send Response
        res.status(200).json({
            success: true,
            data: formattedData,
            pagination: {
                current_page: page,
                items_per_page: limit,
                total_items: totalItems,
                total_pages: totalPages
            }
        });

    } catch (err) {
        console.error('Error fetching customers:', err.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Fetch specific customer details including:
 * 1. Basic Profile
 * 2. Last Bill Amount & Date
 * 3. List of Active Dues (Pending/Partial)
 * 4. Recent Payment Transactions
 */
const getCustomerById = async (req, res) => {
    try {
        // 1. Validate ID
        const { error, value } = idSchema.validate(req.params);
        if (error) {
            return res.status(400).json({ error: 'Invalid Customer ID format' });
        }
        const customerId = value.id;

        // --- PREPARE QUERIES ---

        // Query A: Basic Customer Profile
        const profileQuery = `
            SELECT 
                customer_id, customer_name, customer_type, 
                phone, email, address, credit_limit, 
                current_balance, is_active, created_at, updated_at
            FROM customers 
            WHERE customer_id = $1
        `;

        // Query B: Last Bill Details (Union of Retail and Wholesale)
        // We look for the most recent bill regardless of payment status
        const lastBillQuery = `
            (SELECT bill_number, total_amount, bill_date, 'retail' as type 
             FROM retail_bills WHERE customer_id = $1)
            UNION ALL
            (SELECT bill_number, total_amount, bill_date, 'wholesale' as type 
             FROM wholesale_bills WHERE customer_id = $1)
            ORDER BY bill_date DESC
            LIMIT 1
        `;

        // Query C: Active Dues (Pending or Partial payments)
        // We join with bill tables to get the Bill Number for display
        const activeDuesQuery = `
            SELECT 
                cd.due_id, 
                cd.bill_type, 
                COALESCE(rb.bill_number, wb.bill_number) as bill_number,
                COALESCE(rb.bill_date, wb.bill_date) as bill_date,
                cd.total_bill_amount, 
                cd.total_paid,
                cd.balance_due, 
                cd.status,
                cd.updated_at
            FROM customer_dues cd
            LEFT JOIN retail_bills rb ON cd.retail_bill_id = rb.retail_bill_id
            LEFT JOIN wholesale_bills wb ON cd.wholesale_bill_id = wb.wholesale_bill_id
            WHERE cd.customer_id = $1 
            AND cd.status IN ('pending', 'partial')
            ORDER BY cd.updated_at DESC
        `;

        // Query D: Recent Transactions (Payment History)
        // Fetches the last 10 payments made against dues
        const paymentHistoryQuery = `
            SELECT 
                dph.payment_id,
                dph.amount_paid,
                dph.payment_date,
                dph.remarks,
                pm.method_name as payment_method,
                cd.bill_type,
                COALESCE(rb.bill_number, wb.bill_number) as bill_ref
            FROM due_payment_history dph
            JOIN customer_dues cd ON dph.due_id = cd.due_id
            LEFT JOIN retail_bills rb ON cd.retail_bill_id = rb.retail_bill_id
            LEFT JOIN wholesale_bills wb ON cd.wholesale_bill_id = wb.wholesale_bill_id
            LEFT JOIN payment_methods pm ON dph.payment_method_id = pm.payment_method_id
            WHERE cd.customer_id = $1
            ORDER BY dph.payment_date DESC
            LIMIT 10
        `;

        // --- EXECUTE QUERIES PARALLEL ---
        
        const [profileResult, lastBillResult, duesResult, historyResult] = await Promise.all([
            db.query(profileQuery, [customerId]),
            db.query(lastBillQuery, [customerId]),
            db.query(activeDuesQuery, [customerId]),
            db.query(paymentHistoryQuery, [customerId])
        ]);

        // --- CHECK EXISTENCE ---

        if (profileResult.rows.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        const customer = profileResult.rows[0];
        const lastBill = lastBillResult.rows[0] || null;

        // --- APPLY DATE FORMATTING ---
        const formattedProfile = {
            ...customer,
            credit_limit: parseFloat(customer.credit_limit), 
            current_balance: parseFloat(customer.current_balance),
            created_at: formatDateToIST(customer.created_at),
            updated_at: formatDateToIST(customer.updated_at)
        };

        const formattedActiveDues = duesResult.rows.map(due => ({
            ...due,
            bill_date: formatDateToIST(due.bill_date),
            updated_at: formatDateToIST(due.updated_at)
        }));

        const formattedHistory = historyResult.rows.map(tx => ({
            ...tx,
            payment_date: formatDateToIST(tx.payment_date)
        }));

        // --- FORMAT RESPONSE ---

        res.status(200).json({
            success: true,
            data: {
                profile: formattedProfile,
                metrics: {
                    last_bill_amount: lastBill ? parseFloat(lastBill.total_amount) : 0,
                    last_bill_date: lastBill ? formatDateToIST(lastBill.bill_date) : null,
                    last_bill_number: lastBill ? lastBill.bill_number : null,
                    total_active_dues_count: duesResult.rows.length
                },
                active_dues: formattedActiveDues,
                transaction_history: formattedHistory 
            }
        });

    } catch (err) {
        console.error('Error fetching full customer details:', err.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const createCustomerSchema = Joi.object({
    customer_name: Joi.string().min(3).max(150).required(),
    customer_type: Joi.string().valid('retail', 'wholesale').required(),
    phone: Joi.string().pattern(/^[0-9]+$/).min(10).max(15).optional().allow(''),
    email: Joi.string().email().optional().allow(''),
    address: Joi.string().optional().allow(''),
    credit_limit: Joi.number().min(0).default(0),
    current_balance: Joi.number().default(0) // Usually 0 for new customers
});

const updateCustomerSchema = Joi.object({
    customer_name: Joi.string().min(3).max(150).optional(),
    customer_type: Joi.string().valid('retail', 'wholesale').optional(),
    phone: Joi.string().pattern(/^[0-9]+$/).min(10).max(15).optional().allow(''),
    email: Joi.string().email().optional().allow(''),
    address: Joi.string().optional().allow(''),
    credit_limit: Joi.number().min(0).optional(),
    is_active: Joi.boolean().optional()
});

/**
 * 1. Add New Customer
 */
const createCustomer = async (req, res) => {
    try {
        // Validate Input
        const { error, value } = createCustomerSchema.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const { customer_name, customer_type, phone, email, address, credit_limit } = value;

        // Check Duplicates (Phone or Email)
        const duplicateCheck = await db.query(
            `SELECT customer_id FROM customers WHERE (phone = $1 AND phone IS NOT NULL AND phone != '') OR (email = $2 AND email IS NOT NULL AND email != '')`,
            [phone, email]
        );

        if (duplicateCheck.rows.length > 0) {
            return res.status(409).json({ error: 'Customer with this Phone or Email already exists.' });
        }

        // Insert
        const insertQuery = `
            INSERT INTO customers (customer_name, customer_type, phone, email, address, credit_limit)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING customer_id, customer_name, created_at
        `;

        const result = await db.query(insertQuery, [customer_name, customer_type, phone, email, address, credit_limit]);

        const formattedData = {
            ...result.rows[0],
            created_at: formatDateToIST(result.rows[0].created_at)
        };

        res.status(201).json({
            success: true,
            message: 'Customer added successfully',
            data: formattedData
        });

    } catch (err) {
        console.error('Error adding customer:', err.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * 2. Update Customer Details
 */
const updateCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validate Input
        const { error, value } = updateCustomerSchema.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        // Check if customer exists
        const exists = await db.query('SELECT customer_id FROM customers WHERE customer_id = $1', [id]);
        if (exists.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });

        // Dynamic Update Query Builder
        const fields = [];
        const params = [];
        let paramIndex = 1;

        Object.keys(value).forEach(key => {
            fields.push(`${key} = $${paramIndex}`);
            params.push(value[key]);
            paramIndex++;
        });

        if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

        params.push(id); // Add ID as the last parameter
        const query = `UPDATE customers SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE customer_id = $${paramIndex} RETURNING *`;

        const result = await db.query(query, params);

        const formattedData = {
            ...result.rows[0],
            created_at: formatDateToIST(result.rows[0].created_at),
            updated_at: formatDateToIST(result.rows[0].updated_at)
        };

        res.status(200).json({
            success: true,
            message: 'Customer updated successfully',
            data: formattedData
        });

    } catch (err) {
        // Handle Unique Constraint Violations (e.g. changing email to one that exists)
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Phone or Email already in use by another customer.' });
        }
        console.error('Error updating customer:', err.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * 3. Soft Delete (Mark as Inactive)
 * Best for maintaining history but hiding from standard lists.
 */
const softDeleteCustomer = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(
            `UPDATE customers SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE customer_id = $1 RETURNING customer_id`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        res.status(200).json({
            success: true,
            message: 'Customer deactivated (Soft Deleted) successfully.'
        });

    } catch (err) {
        console.error('Error soft deleting customer:', err.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * 4. Hard Delete (Permanently Remove)
 * STRICT CHECK: Only allow if NO bills/dues exist to preserve financial integrity.
 */
const hardDeleteCustomer = async (req, res) => {
    try {
        const { id } = req.params;

        // Integrity Check: Do they have bills?
        const checkHistory = await db.query(
            `SELECT 
                (SELECT COUNT(*) FROM retail_bills WHERE customer_id = $1) +
                (SELECT COUNT(*) FROM wholesale_bills WHERE customer_id = $1) as total_bills`,
            [id]
        );

        if (parseInt(checkHistory.rows[0].total_bills) > 0) {
            return res.status(400).json({ 
                error: 'Cannot permanently delete customer with existing bill history. Use Soft Delete (Deactivate) instead.' 
            });
        }

        // If safe, delete
        const result = await db.query('DELETE FROM customers WHERE customer_id = $1 RETURNING customer_id', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        res.status(200).json({
            success: true,
            message: 'Customer permanently deleted.'
        });

    } catch (err) {
        console.error('Error hard deleting customer:', err.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = {
    getCustomers,
    getCustomerById,
    createCustomer,
    updateCustomer,
    softDeleteCustomer,
    hardDeleteCustomer
};
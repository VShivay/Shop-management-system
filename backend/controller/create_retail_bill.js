const db = require('../db');
const Joi = require('joi');

// --- Joi Validation Schemas ---
const searchSchema = Joi.object({
    query: Joi.string().min(1).required()
});

const createBillSchema = Joi.object({
    customer_id: Joi.number().allow(null).optional(),
    bill_date: Joi.date().default(() => new Date()),
    payment_method_id: Joi.number().required(),
    payment_status: Joi.string().valid('paid', 'partial', 'unpaid').required(),
    amount_paid: Joi.number().min(0).required(),
    remarks: Joi.string().allow('', null),
    items: Joi.array().items(
        Joi.object({
            product_id: Joi.number().required(),
            quantity: Joi.number().positive().required(),
            unit_price: Joi.number().positive().required(),
            discount_per_unit: Joi.number().min(0).default(0)
        })
    ).min(1).required()
});

// --- Helper Controllers ---
exports.searchProducts = async (req, res) => {
    try {
        const { error } = searchSchema.validate(req.query);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const searchTerm = `%${req.query.query}%`;
        
        // Updated SQL to filter for Retail and Both, excluding Wholesale
        const sql = `
            SELECT 
                p.product_id, p.product_name, p.available_quantity, 
                pr.retail_price, pr.cost_price, u.unit_name
            FROM products p
            JOIN units u ON p.unit_id = u.unit_id
            JOIN prices pr ON p.product_id = pr.product_id
            WHERE p.is_active = TRUE 
              AND pr.is_active = TRUE
              AND p.sales_channel IN ('Retail', 'Both') 
              AND p.product_name ILIKE $1
            LIMIT 10
        `;
        
        const result = await db.query(sql, [searchTerm]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error searching products' });
    }
};
exports.searchCustomers = async (req, res) => {
    try {
        const { error } = searchSchema.validate(req.query);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const searchTerm = `%${req.query.query}%`;
        const sql = `
            SELECT customer_id, customer_name, phone, current_balance
            FROM customers
            WHERE is_active = TRUE 
              AND customer_type = 'retail'
              AND (customer_name ILIKE $1 OR phone ILIKE $1)
            LIMIT 10
        `;
        const result = await db.query(sql, [searchTerm]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error searching customers' });
    }
};

exports.getBillMetadata = async (req, res) => {
    try {
        const methods = await db.query('SELECT payment_method_id, method_name FROM payment_methods WHERE is_active = TRUE');
        res.json({ payment_methods: methods.rows });
    } catch (err) {
        res.status(500).json({ error: 'Server error fetching metadata' });
    }
};

// --- Main Transaction: Create Bill with Logs ---
exports.createRetailBill = async (req, res) => {
    const client = await db.pool.connect();
    
    try {
        // 1. Validate Input
        const { error, value } = createBillSchema.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const { 
            customer_id, payment_method_id, payment_status, 
            amount_paid, items, remarks 
        } = value;

        if (payment_status !== 'paid' && !customer_id) {
            return res.status(400).json({ 
                error: 'Customer details are mandatory for Unpaid or Partial bills.' 
            });
        }

        await client.query('BEGIN');

        let subtotal = 0;
        let total_discount_amount = 0;
        let tax_amount = 0; 
        const processedItems = [];

        // 2. Process Items & Inventory Logs
        for (const item of items) {
            // Fetch current DB state (Locking row for update safety is good practice here)
            const prodRes = await client.query(`
                SELECT p.available_quantity, p.product_name, pr.cost_price
                FROM products p
                JOIN prices pr ON p.product_id = pr.product_id
                WHERE p.product_id = $1 AND pr.is_active = TRUE
                FOR UPDATE OF p
            `, [item.product_id]);

            if (prodRes.rows.length === 0) {
                throw new Error(`Product ID ${item.product_id} not found or inactive.`);
            }

            const product = prodRes.rows[0];
            const oldQty = Number(product.available_quantity);
            const qtyToDeduct = Number(item.quantity);
            const netPrice = item.unit_price - item.discount_per_unit;

            // Check 1: Stock
            if (oldQty < qtyToDeduct) {
                throw new Error(`Insufficient stock for ${product.product_name}. Available: ${oldQty}`);
            }

            // Check 2: Cost Price Guard
            if (Number(netPrice) < Number(product.cost_price)) {
                throw new Error(`Price error for ${product.product_name}: Price cannot be lower than cost price.`);
            }

            // Calculate Item Totals
            const itemTotal = netPrice * qtyToDeduct;
            const itemDiscountTotal = item.discount_per_unit * qtyToDeduct;

            subtotal += (item.unit_price * qtyToDeduct); 
            total_discount_amount += itemDiscountTotal;

            processedItems.push({ ...item, total_price: itemTotal });

            // --- INVENTORY LOGIC START ---
            
            const newQty = oldQty - qtyToDeduct;

            // A. Update Product Stock
            await client.query(`
                UPDATE products 
                SET available_quantity = $1 
                WHERE product_id = $2
            `, [newQty, item.product_id]);

            // B. Insert Inventory Log
            await client.query(`
                INSERT INTO inventory_logs (
                    product_id, 
                    change_type, 
                    quantity_change, 
                    previous_quantity, 
                    new_quantity, 
                    performed_by
                ) VALUES ($1, 'sale', $2, $3, $4, $5)
            `, [
                item.product_id, 
                -qtyToDeduct,       // Negative for sales
                oldQty, 
                newQty, 
                req.user.user_id    // Logged-in user ID
            ]);

            // --- INVENTORY LOGIC END ---
        }

        const total_amount = subtotal - total_discount_amount;

        // Check 3: Payment
        if (amount_paid > total_amount) {
            throw new Error('Amount paid cannot exceed total bill amount.');
        }

        const bill_number = `RB-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        // 3. Insert Bill
        const billInsertQuery = `
            INSERT INTO retail_bills (
                bill_number, customer_id, subtotal, discount_amount, tax_amount, 
                total_amount, amount_paid, payment_method_id, payment_status, 
                created_by, remarks
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING retail_bill_id
        `;
        
        const billValues = [
            bill_number, customer_id, subtotal, total_discount_amount, tax_amount,
            total_amount, amount_paid, payment_method_id, payment_status,
            req.user.user_id, 
            remarks
        ];

        const billRes = await client.query(billInsertQuery, billValues);
        const retail_bill_id = billRes.rows[0].retail_bill_id;

        // 4. Insert Bill Items
        for (const item of processedItems) {
            await client.query(`
                INSERT INTO retail_bill_items (
                    retail_bill_id, product_id, quantity, unit_price, total_price
                ) VALUES ($1, $2, $3, $4, $5)
            `, [retail_bill_id, item.product_id, item.quantity, item.unit_price, item.total_price]); 
        }

        await client.query('COMMIT');
        
        res.status(201).json({ 
            message: 'Bill created successfully', 
            retail_bill_id, 
            bill_number 
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
};
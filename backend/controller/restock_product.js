// controller/restock_product.js
const db = require('../db'); 
const Joi = require('joi');

// --- Validation Schemas ---
const fetchSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    search: Joi.string().trim().allow('').optional()
});

const restockSchema = Joi.object({
    product_id: Joi.number().integer().required(),
    supplier_id: Joi.number().integer().required(),
    quantity: Joi.number().precision(2).positive().required(),
    supply_price: Joi.number().precision(2).positive().required(),
    change_type: Joi.string().valid('restock').default('restock')
});

// --- Controller Methods ---

/**
 * Fetch products for restocking.
 * Default behavior: Returns ALL products, sorted by Lowest Quantity first.
 * Search behavior: If 'search' query param exists, searches by product name.
 */
exports.getProductsToRestock = async (req, res) => {
    try {
        const { error, value } = fetchSchema.validate(req.query);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const { page, limit, search } = value;
        const offset = (page - 1) * limit;

        let queryParams = [];
        let whereClause = '';
        let paramIndex = 1;

        if (search) {
            whereClause = `WHERE p.product_name ILIKE $${paramIndex}`;
            queryParams.push(`%${search}%`);
            paramIndex++;
        }

        // 1. Get Count
        const countQuery = `SELECT COUNT(*) FROM products p ${whereClause}`;
        const countRes = await db.query(countQuery, queryParams);
        const totalItems = parseInt(countRes.rows[0].count);
        const totalPages = Math.ceil(totalItems / limit);

        // 2. Main Query (UPDATED: Joins inventory table for stock data)
        const mainQuery = `
            WITH PaginatedProducts AS (
                SELECT 
                    p.product_id, p.product_name, 
                    i.available_quantity_in_hand, i.low_stock_threshold, i.last_supplied_date,
                    c.category_name, u.unit_name,
                    pr.cost_price
                FROM products p
                LEFT JOIN inventory i ON p.product_id = i.product_id
                LEFT JOIN categories c ON p.category_id = c.category_id
                LEFT JOIN units u ON p.unit_id = u.unit_id
                LEFT JOIN prices pr ON p.product_id = pr.product_id AND pr.is_active = TRUE
                ${whereClause}
                ORDER BY i.available_quantity_in_hand ASC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            )
            SELECT 
                pp.*,
                COALESCE(
                    JSON_AGG(
                        JSON_BUILD_OBJECT(
                            'supplier_id', s.supplier_id,
                            'supplier_name', s.supplier_name,
                            'contact_person', s.contact_person
                        ) ORDER BY s.supplier_name ASC
                    ) FILTER (WHERE s.supplier_id IS NOT NULL), 
                    '[]'
                ) AS linked_suppliers
            FROM PaginatedProducts pp
            LEFT JOIN product_suppliers ps ON pp.product_id = ps.product_id
            LEFT JOIN suppliers s ON ps.supplier_id = s.supplier_id
            GROUP BY 
                pp.product_id, pp.product_name, pp.available_quantity_in_hand, 
                pp.low_stock_threshold, pp.last_supplied_date, pp.category_name, 
                pp.unit_name, pp.cost_price
            ORDER BY pp.available_quantity_in_hand ASC;
        `;

        queryParams.push(limit, offset);

        const { rows } = await db.query(mainQuery, queryParams);

        res.json({
            data: rows,
            meta: {
                current_page: page,
                total_pages: totalPages,
                total_items: totalItems,
                items_per_page: limit
            }
        });

    } catch (err) {
        console.error('Error fetching restock products:', err);
        res.status(500).json({ error: 'Server error fetching products.' });
    }
};

/**
 * Perform Restock
 * Transaction-safe update of inventory and logs.
 */
exports.restockProduct = async (req, res) => {
    const client = await db.pool.connect(); 

    try {
        const { error, value } = restockSchema.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const { product_id, supplier_id, quantity, supply_price, change_type } = value;
        const user_id = req.user.id || req.user.user_id; 

        await client.query('BEGIN');

        // 1. Verify product exists
        const productRes = await client.query(
            `SELECT product_name FROM products WHERE product_id = $1`,
            [product_id]
        );

        if (productRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Product not found' });
        }
        const productName = productRes.rows[0].product_name;

        // 2. Log Change in Ledger and RETURNING transaction_id
        const transactionRes = await client.query(
            `INSERT INTO inventory_transactions 
            (product_id, transaction_type, quantity, performed_by, supplier_id, reference_type, remarks)
            VALUES ($1, $2, $3, $4, $5, 'manual_restock', 'Restocked via admin dashboard')
            RETURNING transaction_id`,
            [product_id, change_type, quantity, user_id, supplier_id] 
        );
        const transactionId = transactionRes.rows[0].transaction_id;

        // 3. Upsert Supplier Info
        const upsertSupplierQuery = `
            INSERT INTO product_suppliers (product_id, supplier_id, supply_price)
            VALUES ($1, $2, $3)
            ON CONFLICT (product_id, supplier_id) 
            DO UPDATE SET supply_price = EXCLUDED.supply_price
        `;
        await client.query(upsertSupplierQuery, [product_id, supplier_id, supply_price]);

        // 4. Record the Expense
        // Note: You may want to dynamically fetch the category_id for 'Inventory' or 'Restock'
        const totalExpense = quantity * supply_price;
        const expenseQuery = `
            INSERT INTO expenses (category_id, expense_name, amount, paid_by, inventory_transaction_id)
            VALUES (
                (SELECT category_id FROM expense_categories WHERE category_name = 'Inventory' LIMIT 1), 
                $1, $2, $3, $4
            )`;
        
        await client.query(expenseQuery, [
            `Restock: ${productName} (${quantity} units)`,
            totalExpense,
            user_id,
            transactionId
        ]);

        // 5. Fetch updated quantity (updated by DB Trigger)
        const updatedInventoryRes = await client.query(
            `SELECT available_quantity_in_hand FROM inventory WHERE product_id = $1`,
            [product_id]
        );
        const newQty = parseFloat(updatedInventoryRes.rows[0].available_quantity_in_hand);

        await client.query('COMMIT');

        res.status(200).json({
            message: 'Product restocked and expense recorded',
            product_id,
            added_quantity: quantity,
            new_quantity: newQty,
            expense_recorded: totalExpense
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Restock Transaction Error:', err);
        res.status(500).json({ error: 'Internal server error processing restock.' });
    } finally {
        client.release();
    }
};
exports.getAllSuppliers = async (req, res) => {
    try {
        // Fetch only active suppliers, ordered by name
        const query = `
            SELECT supplier_id, supplier_name 
            FROM suppliers 
            WHERE is_active = TRUE 
            ORDER BY supplier_name ASC
        `;
        
        const { rows } = await db.query(query);

        res.json({
            data: rows
        });
    } catch (err) {
        console.error('Error fetching suppliers:', err);
        res.status(500).json({ error: 'Server error fetching suppliers.' });
    }
};
// controller/manage_product.js
const db = require('../db');
const Joi = require('joi');

// Joi Schema for validating query filters
const filterSchema = Joi.object({
    name: Joi.string().trim().optional(),
    category_id: Joi.number().integer().optional(),
    unit_id: Joi.number().integer().optional(),
    is_active: Joi.boolean().optional(),
    sales_channel: Joi.string().valid('Retail', 'Wholesale', 'Both').optional(),
    // Pagination params
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10)
});

// Joi Schema for validating ID parameters
const idSchema = Joi.object({
    id: Joi.number().integer().required()
});

/**
 * Fetch all products with filters (name, category, unit, active status, sales channel)
 * Default Sort: Name Ascending
 */
const getProducts = async (req, res) => {
    try {
        // 1. Validate Query Parameters
        const { error, value } = filterSchema.validate(req.query);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { name, category_id, unit_id, is_active, sales_channel, page, limit } = value;
        const offset = (page - 1) * limit;

        // 2. Build Base Conditions (Used for both Count and Data queries)
        let whereClause = `WHERE 1=1`;
        const queryParams = [];
        let paramIndex = 1;

        if (name) {
            whereClause += ` AND p.product_name ILIKE $${paramIndex}`;
            queryParams.push(`%${name}%`);
            paramIndex++;
        }

        if (category_id) {
            whereClause += ` AND p.category_id = $${paramIndex}`;
            queryParams.push(category_id);
            paramIndex++;
        }

        if (unit_id) {
            whereClause += ` AND p.unit_id = $${paramIndex}`;
            queryParams.push(unit_id);
            paramIndex++;
        }

        if (is_active !== undefined) {
            whereClause += ` AND p.is_active = $${paramIndex}`;
            queryParams.push(is_active);
            paramIndex++;
        }

        if (sales_channel) {
            whereClause += ` AND p.sales_channel = $${paramIndex}`;
            queryParams.push(sales_channel);
            paramIndex++;
        }

        // 3. Count Query (To calculate total pages)
        const countQueryText = `SELECT COUNT(*) FROM products p ${whereClause}`;
        
        // 4. Data Query
        // MODIFIED: Added LEFT JOIN for inventory 'i' and updated selected columns
        const dataQueryText = `
            SELECT 
                p.product_id,
                p.product_name,
                i.available_quantity_in_hand,
                i.low_stock_threshold,
                p.sales_channel,
                p.is_active,
                c.category_name,
                u.unit_name,
                pr.retail_price,
                pr.wholesale_price,
                pr.cost_price
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.category_id
            LEFT JOIN units u ON p.unit_id = u.unit_id
            LEFT JOIN prices pr ON p.product_id = pr.product_id AND pr.is_active = TRUE
            LEFT JOIN inventory i ON p.product_id = i.product_id
            ${whereClause}
            ORDER BY p.product_name ASC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        // 5. Execute Queries
        const [countResult, dataResult] = await Promise.all([
            db.query(countQueryText, queryParams),
            db.query(dataQueryText, [...queryParams, limit, offset])
        ]);

        const totalItems = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalItems / limit);

        res.status(200).json({
            meta: {
                total_items: totalItems,
                total_pages: totalPages,
                current_page: page,
                per_page: limit
            },
            products: dataResult.rows
        });

    } catch (err) {
        console.error('Error fetching products:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Find all necessary details about a specific product
 * Includes: Basic info, active price, supplier details
 */
const getProductDetails = async (req, res) => {
    try {
        // 1. Validate ID Parameter
        const { error, value } = idSchema.validate(req.params);
        if (error) {
            return res.status(400).json({ error: "Invalid Product ID" });
        }

        const productId = value.id;

        // 2. Query for Product Details + Last 5 Logs
        const queryText = `
            SELECT 
                p.product_id,
                p.product_name,
                i.available_quantity_in_hand,
                i.low_stock_threshold,
                i.last_supplied_date,
                p.sales_channel,
                p.is_active,
                p.created_at,
                c.category_name,
                c.category_id,
                u.unit_name,
                u.unit_id,
                
                -- Price Details (Active Only)
                pr.retail_price,
                pr.wholesale_price,
                pr.cost_price,
                pr.effective_from as price_effective_date,

                -- Aggregated Suppliers List
                COALESCE(
                    json_agg(
                        json_build_object(
                            'supplier_name', s.supplier_name,
                            'contact_person', s.contact_person,
                            'supply_price', ps.supply_price
                        ) 
                    ) FILTER (WHERE s.supplier_id IS NOT NULL), 
                    '[]'
                ) as suppliers,

                -- NEW: Last 5 Inventory Transactions Subquery
                (
                    SELECT COALESCE(json_agg(log_row), '[]')
                    FROM (
                        SELECT 
                            it.transaction_type,
                            it.quantity,
                            it.reference_type,
                            it.transaction_date,
                            sup.supplier_name
                        FROM inventory_transactions it
                        LEFT JOIN suppliers sup ON it.supplier_id = sup.supplier_id
                        WHERE it.product_id = p.product_id
                        ORDER BY it.transaction_date DESC
                        LIMIT 5
                    ) log_row
                ) as recent_logs

            FROM products p
            LEFT JOIN categories c ON p.category_id = c.category_id
            LEFT JOIN units u ON p.unit_id = u.unit_id
            LEFT JOIN prices pr ON p.product_id = pr.product_id AND pr.is_active = TRUE
            LEFT JOIN inventory i ON p.product_id = i.product_id
            LEFT JOIN product_suppliers ps ON p.product_id = ps.product_id
            LEFT JOIN suppliers s ON ps.supplier_id = s.supplier_id
            WHERE p.product_id = $1
            GROUP BY 
                p.product_id, i.available_quantity_in_hand, i.low_stock_threshold, i.last_supplied_date,
                c.category_name, c.category_id, u.unit_name, u.unit_id, 
                pr.retail_price, pr.wholesale_price, pr.cost_price, pr.effective_from;
        `;

        const result = await db.query(queryText, [productId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        res.status(200).json(result.rows[0]);

    } catch (err) {
        console.error('Error fetching product details:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
/**
 * Fetch dropdown options for frontend filters/forms
 */
const getProductDropdowns = async (req, res) => {
    try {
        // Run all queries in parallel using Promise.all
        const [categoriesRes, unitsRes, suppliersRes] = await Promise.all([
            db.query('SELECT category_id, category_name FROM categories ORDER BY category_name ASC'),
            db.query('SELECT unit_id, unit_name FROM units ORDER BY unit_name ASC'),
            db.query('SELECT supplier_id, supplier_name FROM suppliers WHERE is_active = TRUE ORDER BY supplier_name ASC')
        ]);

        // Static options for Sales Channel
        const salesChannels = [
            { id: 'Retail', name: 'Retail' },
            { id: 'Wholesale', name: 'Wholesale' },
            { id: 'Both', name: 'Both' }
        ];

        res.status(200).json({
            categories: categoriesRes.rows,
            units: unitsRes.rows,
            suppliers: suppliersRes.rows,
            sales_channels: salesChannels
        });

    } catch (err) {
        console.error('Error fetching dropdown options:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
const productWriteSchema = Joi.object({
    product_name: Joi.string().trim().max(100).required(),
    category_id: Joi.number().integer().allow(null).optional(),
    unit_id: Joi.number().integer().allow(null).optional(),
    sales_channel: Joi.string().valid('Retail', 'Wholesale', 'Both').default('Both'),
    low_stock_threshold: Joi.number().min(0).default(10),
    is_active: Joi.boolean().default(true),
    
    // Fixed: Look for available_quantity_in_hand, but catch available_quantity if frontend hasn't updated
    available_quantity_in_hand: Joi.number().min(0).default(0),
    available_quantity: Joi.number().min(0).optional(), 

    // Pricing
    cost_price: Joi.number().precision(2).required(),
    retail_price: Joi.number().precision(2).allow(null).optional(),
    wholesale_price: Joi.number().precision(2).allow(null).optional(),

    // Suppliers
    suppliers: Joi.array().items(
        Joi.object({
            supplier_id: Joi.number().integer().required(),
            supply_price: Joi.number().precision(2).optional()
        })
    ).optional().default([])
}).custom((value, helpers) => {
    if (!value.retail_price && !value.wholesale_price) {
        return helpers.message('At least one selling price (Retail or Wholesale) must be provided.');
    }
    return value;
});

const productUpdateSchema = productWriteSchema.fork(
    ['available_quantity_in_hand', 'available_quantity'], 
    (schema) => schema.forbidden()
);/**
 * Add a new product
 * Transactional: Inserts into products, prices, product_suppliers, and inventory_logs
 */
const addProduct = async (req, res) => {
    const client = await db.pool.connect();

    try {
        const { error, value } = productWriteSchema.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const { 
            product_name, category_id, unit_id, sales_channel, low_stock_threshold, is_active,
            cost_price, retail_price, wholesale_price, suppliers 
        } = value;

        // Extract the quantity safely, whichever name the frontend used
        const startingQuantity = value.available_quantity_in_hand || value.available_quantity || 0;

        await client.query('BEGIN');

        // A. Insert Product
        const productQuery = `
            INSERT INTO products (product_name, category_id, unit_id, sales_channel, is_active)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING product_id;
        `;
        const productRes = await client.query(productQuery, [
            product_name, category_id, unit_id, sales_channel, is_active
        ]);
        const newProductId = productRes.rows[0].product_id;

        // B. Insert Price (Active)
        const priceQuery = `
            INSERT INTO prices (product_id, retail_price, wholesale_price, cost_price, is_active)
            VALUES ($1, $2, $3, $4, TRUE);
        `;
        await client.query(priceQuery, [newProductId, retail_price, wholesale_price, cost_price]);

        // C. Link Suppliers (if any)
        if (suppliers && suppliers.length > 0) {
            const supplierQuery = `
                INSERT INTO product_suppliers (product_id, supplier_id, supply_price)
                VALUES ($1, $2, $3);
            `;
            await Promise.all(suppliers.map(s => 
                client.query(supplierQuery, [newProductId, s.supplier_id, cost_price])
            ));
        }

        // D. Create Baseline Inventory Record (Initializes at 0)
        const initInventoryQuery = `
            INSERT INTO inventory (product_id, low_stock_threshold, available_quantity_in_hand)
            VALUES ($1, $2, 0); 
        `;
        await client.query(initInventoryQuery, [newProductId, low_stock_threshold]);

        // E. Log Initial Stock -> This automatically triggers the database to do the math (0 + startingQuantity)
        if (startingQuantity > 0) {
            const initialSupplierId = (suppliers && suppliers.length > 0) ? suppliers[0].supplier_id : null;
            const performedBy = req.user ? req.user.user_id : null;

            const logQuery = `
                INSERT INTO inventory_transactions 
                (product_id, transaction_type, quantity, performed_by, supplier_id, reference_type, remarks)
                VALUES ($1, 'initial_stock', $2, $3, $4, 'product_creation', 'Opening stock during product creation');
            `;
            
            await client.query(logQuery, [
                newProductId, 
                startingQuantity, 
                performedBy,
                initialSupplierId 
            ]);
        }

        await client.query('COMMIT');
        res.status(201).json({ message: "Product created successfully", product_id: newProductId });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error adding product:', err);
        
        if (err.code === '23505') { 
            // Check the exact constraint name (Postgres usually names them table_column_key)
            if (err.constraint?.includes('product_name')) {
                return res.status(409).json({ error: "Product name already exists." });
            } else if (err.constraint?.includes('product_suppliers_pkey')) {
                return res.status(409).json({ error: "You cannot link the exact same supplier twice." });
            } else {
                // Fallback for other unique constraints
                return res.status(409).json({ error: `Duplicate entry error: ${err.constraint}` });
            }
        }
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
    }
};
/**
 * Update product details
 * Transactional: Updates info and handles Price History (Versioning)
 */
const updateProduct = async (req, res) => {
    const client = await db.pool.connect();

    try {
        const productId = req.params.id;

        // 1. Validate Input
        // allowUnknown: true lets us ignore fields we don't want to update (like stock) or handle them separately
        const { error, value } = productWriteSchema.validate(req.body, { allowUnknown: true, stripUnknown: true }); 
        
        // Remove opening_stock from update logic to prevent accidental resets
        delete value.opening_stock; 
        
        if (error) return res.status(400).json({ error: error.details[0].message });

        const { 
            product_name, category_id, unit_id, sales_channel, low_stock_threshold, is_active,
            cost_price, retail_price, wholesale_price, suppliers 
        } = value;

        await client.query('BEGIN');

        // A. Update Basic Product Info (Removed low_stock_threshold)
        const updateProductQuery = `
            UPDATE products 
            SET product_name = $1, category_id = $2, unit_id = $3, 
                sales_channel = $4, is_active = $5
            WHERE product_id = $6;
        `;
        const updateRes = await client.query(updateProductQuery, [
            product_name, category_id, unit_id, sales_channel, is_active, productId
        ]);

        if (updateRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: "Product not found" });
        }

        // B. Update Inventory Configurations (New Step for low_stock_threshold)
        if (low_stock_threshold !== undefined) {
            const updateInventoryQuery = `
                UPDATE inventory
                SET low_stock_threshold = $1
                WHERE product_id = $2;
            `;
            await client.query(updateInventoryQuery, [low_stock_threshold, productId]);
        }

        // C. Handle Price Change (Versioning)
        const currentPriceRes = await client.query(
            `SELECT retail_price, wholesale_price, cost_price FROM prices WHERE product_id = $1 AND is_active = TRUE`,
            [productId]
        );
        
        const currentParams = currentPriceRes.rows[0] || {};
        
        // Convert to strings for accurate comparison of numerics
        const priceChanged = 
            String(currentParams.retail_price) !== String(retail_price) ||
            String(currentParams.wholesale_price) !== String(wholesale_price) ||
            String(currentParams.cost_price) !== String(cost_price);

        if (priceChanged) {
            // Deactivate old price
            await client.query(`UPDATE prices SET is_active = FALSE WHERE product_id = $1`, [productId]);
            
            // Insert new price
            await client.query(`
                INSERT INTO prices (product_id, retail_price, wholesale_price, cost_price, is_active)
                VALUES ($1, $2, $3, $4, TRUE)
            `, [productId, retail_price, wholesale_price, cost_price]);
        }

        // D. Update Suppliers (Replace Logic)
        if (suppliers) {
            await client.query(`DELETE FROM product_suppliers WHERE product_id = $1`, [productId]);
            
            if (suppliers.length > 0) {
                const supplierQuery = `
                    INSERT INTO product_suppliers (product_id, supplier_id, supply_price)
                    VALUES ($1, $2, $3);
                `;
                await Promise.all(suppliers.map(s => 
                    client.query(supplierQuery, [productId, s.supplier_id, s.supply_price || null])
                ));
            }
        }

        await client.query('COMMIT');
        res.status(200).json({ message: "Product updated successfully" });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating product:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
    }
};
const archiveProduct = async (req, res) => {
    const client = await db.pool.connect();
    
    try {
        const productId = req.params.id;

        await client.query('BEGIN');

        // 1. Deactivate Product
        const productRes = await client.query(
            `UPDATE products SET is_active = FALSE WHERE product_id = $1 RETURNING product_name`,
            [productId]
        );

        if (productRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: "Product not found" });
        }

        // 2. Deactivate Prices (Optional: ensures it doesn't appear in active price lookups)
        await client.query(
            `UPDATE prices SET is_active = FALSE WHERE product_id = $1`,
            [productId]
        );

        await client.query('COMMIT');
        
        res.status(200).json({ 
            message: `Product '${productRes.rows[0].product_name}' archived successfully.` 
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error archiving product:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
    }
};

/**
 * Hard Delete (Permanent Removal)
 * Deletes the product and ALL related data (prices, logs, supplier links).
 * WARNING: This destroys historical data because of ON DELETE CASCADE in your SQL.
 */
const deleteProduct = async (req, res) => {
    const client = await db.pool.connect();

    try {
        const productId = req.params.id;

        await client.query('BEGIN');

        // SQL Schema Note: 
        // Since your tables (prices, inventory_logs, etc.) have ON DELETE CASCADE,
        // deleting the parent product automatically wipes the children rows.
        
        const result = await client.query(
            `DELETE FROM products WHERE product_id = $1 RETURNING product_name`,
            [productId]
        );

        if (result.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: "Product not found" });
        }

        await client.query('COMMIT');

        res.status(200).json({ 
            message: `Product '${result.rows[0].product_name}' and all history permanently deleted.` 
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error deleting product:', err);
        // Handle Foreign Key constraint error if CASCADE wasn't set up correctly
        if (err.code === '23503') {
            return res.status(400).json({ error: "Cannot delete product because it has related data (sales/logs)." });
        }
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
    }
};
module.exports = {
    getProducts,
    getProductDetails,
    getProductDropdowns,
    addProduct,
    updateProduct,
    archiveProduct,
    deleteProduct
};
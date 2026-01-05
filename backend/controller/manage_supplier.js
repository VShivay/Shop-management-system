// controller/manage_supplier.js
const db = require('../db');
const Joi = require('joi');

// ---------------------------------------------------------
// Validation Schemas (Joi)
// ---------------------------------------------------------

const querySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    search_name: Joi.string().trim().allow('').optional(),
    search_product: Joi.string().trim().allow('').optional()
});

const idSchema = Joi.object({
    id: Joi.number().integer().positive().required()
});

// Schema for Adding/Updating Supplier Profile
const supplierSchema = Joi.object({
    supplier_name: Joi.string().trim().max(150).required(),
    contact_person: Joi.string().trim().max(100).allow('', null),
    phone: Joi.string().trim().max(20).pattern(/^[0-9+\s-]+$/).allow('', null),
    email: Joi.string().trim().email().allow('', null),
    gst_number: Joi.string().trim().uppercase().max(20).allow('', null),
    address: Joi.string().trim().allow('', null),
    is_active: Joi.boolean().default(true)
});

// Schema for Linking Product (Upsert)
const linkProductSchema = Joi.object({
    product_id: Joi.number().integer().positive().required(),
    supply_price: Joi.number().precision(2).positive().required(),
    last_supplied_date: Joi.date().iso().allow(null) // Optional override
});

// ---------------------------------------------------------
// Existing Read Methods
// ---------------------------------------------------------

const getSuppliers = async (req, res) => {
    try {
        const { error, value } = querySchema.validate(req.query);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const { page, limit, search_name, search_product } = value;
        const offset = (page - 1) * limit;

        let queryParams = [];
        let whereClauses = [`s.is_active = TRUE`]; 
        let paramCounter = 1;

        let sql = `
            SELECT DISTINCT
                s.supplier_id, s.supplier_name, s.contact_person, 
                s.phone, s.email, s.is_active, s.created_at 
            FROM suppliers s
        `;

        if (search_product) {
            sql += `
                JOIN product_suppliers ps ON s.supplier_id = ps.supplier_id
                JOIN products p ON ps.product_id = p.product_id
            `;
            whereClauses.push(`p.product_name ILIKE $${paramCounter}`);
            queryParams.push(`%${search_product}%`);
            paramCounter++;
        }

        if (search_name) {
            whereClauses.push(`s.supplier_name ILIKE $${paramCounter}`);
            queryParams.push(`%${search_name}%`);
            paramCounter++;
        }

        if (whereClauses.length > 0) sql += ` WHERE ${whereClauses.join(' AND ')}`;

        sql += ` ORDER BY s.created_at DESC LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
        queryParams.push(limit, offset);

        const result = await db.query(sql, queryParams);
        return res.status(200).json({
            message: 'Suppliers fetched successfully',
            data: result.rows,
            pagination: { page, limit, count: result.rowCount }
        });

    } catch (err) {
        console.error('Error fetching suppliers:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

const getSupplierById = async (req, res) => {
    try {
        const { error, value } = idSchema.validate(req.params);
        if (error) return res.status(400).json({ error: 'Invalid Supplier ID' });
        
        const supplierId = value.id;

        const supplierResult = await db.query(`SELECT * FROM suppliers WHERE supplier_id = $1`, [supplierId]);
        if (supplierResult.rows.length === 0) return res.status(404).json({ error: 'Supplier not found' });

        const productsResult = await db.query(`
            SELECT p.product_id, p.product_name, ps.supply_price, ps.last_supplied_date
            FROM product_suppliers ps
            JOIN products p ON ps.product_id = p.product_id
            WHERE ps.supplier_id = $1 ORDER BY p.product_name ASC
        `, [supplierId]);

        return res.status(200).json({
            message: 'Details fetched',
            data: { ...supplierResult.rows[0], products: productsResult.rows }
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

// ---------------------------------------------------------
// NEW: Write Methods (Add, Update, Link, Unlink)
// ---------------------------------------------------------

/**
 * Add New Supplier
 */
const addSupplier = async (req, res) => {
    try {
        const { error, value } = supplierSchema.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const { supplier_name, contact_person, phone, email, gst_number, address, is_active } = value;

        const sql = `
            INSERT INTO suppliers (supplier_name, contact_person, phone, email, gst_number, address, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING supplier_id, supplier_name
        `;

        const result = await db.query(sql, [supplier_name, contact_person, phone, email, gst_number, address, is_active]);

        return res.status(201).json({
            message: 'Supplier added successfully',
            data: result.rows[0]
        });

    } catch (err) {
        if (err.code === '23505') { // Unique constraint violation
            if (err.detail.includes('supplier_name')) return res.status(400).json({ error: 'Supplier name already exists.' });
            if (err.detail.includes('email')) return res.status(400).json({ error: 'Email already exists.' });
            if (err.detail.includes('phone')) return res.status(400).json({ error: 'Phone number already exists.' });
        }
        console.error('Error adding supplier:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Update Existing Supplier
 */
const updateSupplier = async (req, res) => {
    try {
        // Validate ID
        const idCheck = idSchema.validate(req.params);
        if (idCheck.error) return res.status(400).json({ error: 'Invalid Supplier ID' });
        
        // Validate Body
        const { error, value } = supplierSchema.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const supplierId = idCheck.value.id;
        const { supplier_name, contact_person, phone, email, gst_number, address, is_active } = value;

        const sql = `
            UPDATE suppliers 
            SET supplier_name = $1, contact_person = $2, phone = $3, email = $4, gst_number = $5, address = $6, is_active = $7
            WHERE supplier_id = $8
            RETURNING *
        `;

        const result = await db.query(sql, [supplier_name, contact_person, phone, email, gst_number, address, is_active, supplierId]);

        if (result.rowCount === 0) return res.status(404).json({ error: 'Supplier not found' });

        return res.status(200).json({
            message: 'Supplier updated successfully',
            data: result.rows[0]
        });

    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Update failed: Name, Email or Phone already in use by another supplier.' });
        }
        console.error('Error updating supplier:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Link Product to Supplier (Upsert: Insert or Update Price if exists)
 */
const linkProduct = async (req, res) => {
    try {
        const idCheck = idSchema.validate({ id: req.params.id }); // Supplier ID from URL
        if (idCheck.error) return res.status(400).json({ error: 'Invalid Supplier ID' });

        const { error, value } = linkProductSchema.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const supplierId = idCheck.value.id;
        const { product_id, supply_price, last_supplied_date } = value;

        // Use UPSERT logic (ON CONFLICT DO UPDATE)
        const sql = `
            INSERT INTO product_suppliers (product_id, supplier_id, supply_price, last_supplied_date)
            VALUES ($1, $2, $3, COALESCE($4, CURRENT_TIMESTAMP))
            ON CONFLICT (product_id, supplier_id) 
            DO UPDATE SET 
                supply_price = EXCLUDED.supply_price,
                last_supplied_date = EXCLUDED.last_supplied_date
            RETURNING *
        `;

        const result = await db.query(sql, [product_id, supplierId, supply_price, last_supplied_date]);

        return res.status(200).json({
            message: 'Product linked successfully',
            data: result.rows[0]
        });

    } catch (err) {
        if (err.code === '23503') { // Foreign key violation
            return res.status(400).json({ error: 'Invalid Product ID or Supplier ID' });
        }
        console.error('Error linking product:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Unlink Product from Supplier
 */
const unlinkProduct = async (req, res) => {
    try {
        const supplierId = parseInt(req.params.id);
        const productId = parseInt(req.params.productId);

        if (isNaN(supplierId) || isNaN(productId)) {
            return res.status(400).json({ error: 'Invalid IDs' });
        }

        const sql = `DELETE FROM product_suppliers WHERE supplier_id = $1 AND product_id = $2 RETURNING *`;
        const result = await db.query(sql, [supplierId, productId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Link not found' });
        }

        return res.status(200).json({ message: 'Product unlinked successfully' });

    } catch (err) {
        console.error('Error unlinking product:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
// Validation Schema
const querySchema1 = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    search_name: Joi.string().trim().allow('').optional() // Ensure this exists!
});

const getProducts = async (req, res) => {
    try {
        // 1. Validate
        const { error, value } = querySchema1.validate(req.query);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const { page, limit, search_name } = value;
        const offset = (page - 1) * limit;

        // 2. Build Query
        let queryParams = [];
        let whereClauses = [`is_active = TRUE`];
        let paramCounter = 1;

        let sql = `SELECT * FROM products`;

        // Filter by Name
        if (search_name) {
            whereClauses.push(`product_name ILIKE $${paramCounter}`);
            queryParams.push(`%${search_name}%`);
            paramCounter++;
        }

        if (whereClauses.length > 0) {
            sql += ` WHERE ${whereClauses.join(' AND ')}`;
        }

        sql += ` ORDER BY product_name ASC LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
        queryParams.push(limit, offset);

        // 3. Execute
        const result = await db.query(sql, queryParams);
        
        res.status(200).json({
            message: 'Products fetched successfully',
            data: result.rows,
            pagination: { page, limit, count: result.rowCount }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
module.exports = {
    getProducts,
    getSuppliers,
    getSupplierById,
    addSupplier,     // Exported
    updateSupplier,  // Exported
    linkProduct,     // Exported
    unlinkProduct    // Exported
};
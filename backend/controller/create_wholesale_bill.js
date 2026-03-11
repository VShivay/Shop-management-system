const db = require('../db');
const Joi = require('joi');
const pdfGenerator = require('../pdf/create_wholesale_bill_pdf');

// Helper for safe float math (2 decimal places)
const toDecimal = (num) => Math.round((parseFloat(num) + Number.EPSILON) * 100) / 100;

// 1. Search Customers (Debounce API)
exports.searchCustomers = async (req, res) => {
    try {
        const { query } = req.query; // Accepts name or mobile or ID
        if (!query) return res.json([]);

        const sql = `
            SELECT customer_id, customer_name, phone, address, current_balance 
            FROM customers 
            WHERE (customer_name ILIKE $1 OR phone ILIKE $1 OR CAST(customer_id AS TEXT) = $1)
            AND customer_type = 'wholesale' AND is_active = TRUE
            LIMIT 10
        `;
        const result = await db.query(sql, [`%${query}%`]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error searching customers' });
    }
};

// 2. Search Products (Debounce API)
exports.searchProducts = async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.json([]);

        // UPDATED: LEFT JOIN inventory, pull available_quantity_in_hand safely
        const sql = `
            SELECT 
                p.product_id, 
                p.product_name, 
                COALESCE(i.available_quantity_in_hand, 0) AS available_quantity_in_hand, 
                COALESCE(u.unit_name, 'pcs') AS unit_name, 
                pr.wholesale_price, 
                pr.cost_price
            FROM products p
            LEFT JOIN inventory i ON p.product_id = i.product_id
            LEFT JOIN units u ON p.unit_id = u.unit_id
            LEFT JOIN prices pr ON p.product_id = pr.product_id AND pr.is_active = TRUE
            WHERE (p.product_name ILIKE $1 OR CAST(p.product_id AS TEXT) = $1)
            AND pr.wholesale_price IS NOT NULL
            AND p.sales_channel IN ('Wholesale', 'Both')
            AND p.is_active = TRUE
            LIMIT 10
        `;
        const result = await db.query(sql, [`%${query}%`]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error searching products' });
    }
};

// 3. Create Wholesale Bill
exports.createBill = async (req, res) => {
    // Joi Validation Schema
    const schema = Joi.object({
        customer_id: Joi.number().required(),
        payment_method_id: Joi.number().required(),
        amount_paid: Joi.number().min(0).required(),
        items: Joi.array().items(
            Joi.object({
                product_id: Joi.number().required(),
                quantity: Joi.number().positive().required(),
                discount_per_unit: Joi.number().min(0).default(0)
            })
        ).min(1).required()
    });

    const { error } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const client = await db.pool.connect();
    
    try {
        await client.query('BEGIN');

        const { customer_id, payment_method_id, amount_paid, items } = req.body;
        const userId = req.user.user_id; // From auth middleware

        // A. Generate Bill Number (Format: WB-TIMESTAMP-RANDOM)
        const billNumber = `WB-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        // B. Calculate Totals & Validate Prices
        let grandTotal = 0;
        const processedItems = [];

        for (const item of items) {
            // UPDATED: Fetch inventory safely with row locking on the inventory table
            const priceRes = await client.query(
                `SELECT i.available_quantity_in_hand, pr.wholesale_price, pr.cost_price 
                 FROM products p 
                 JOIN prices pr ON p.product_id = pr.product_id AND pr.is_active = TRUE
                 JOIN inventory i ON p.product_id = i.product_id
                 WHERE p.product_id = $1
                 FOR UPDATE OF i`,
                [item.product_id]
            );

            if (priceRes.rows.length === 0) {
                throw new Error(`Product ID ${item.product_id} not found or inactive.`);
            }

            const productData = priceRes.rows[0];
            const wholesalePrice = parseFloat(productData.wholesale_price);
            const costPrice = parseFloat(productData.cost_price);
            const quantity = parseFloat(item.quantity);
            const discount = parseFloat(item.discount_per_unit || 0);

            // Validation: Stock
            if (parseFloat(productData.available_quantity_in_hand) < quantity) {
                throw new Error(`Insufficient stock for Product ID ${item.product_id}`);
            }

            // Validation: Cost Price Logic
            const effectivePrice = wholesalePrice - discount;
            if (effectivePrice < costPrice) {
                throw new Error(`Discount too high for Product ID ${item.product_id}. Price cannot be less than Cost Price (${costPrice}).`);
            }

            const lineTotal = toDecimal(effectivePrice * quantity);
            grandTotal += lineTotal;

            processedItems.push({
                product_id: item.product_id,
                quantity: quantity,
                unit_price: wholesalePrice, 
                total_price: lineTotal
            });
        }

        grandTotal = toDecimal(grandTotal);

        // Validation: Payment Logic
        if (amount_paid > grandTotal) {
            throw new Error(`Amount paid (${amount_paid}) cannot exceed Total Bill Amount (${grandTotal})`);
        }

        const paymentStatus = (amount_paid === grandTotal) ? 'paid' : (amount_paid === 0 ? 'unpaid' : 'partial');

        // C. Insert Bill Header
        const billRes = await client.query(
            `INSERT INTO wholesale_bills 
            (customer_id, bill_number, total_amount, amount_paid, payment_method_id, payment_status, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING wholesale_bill_id, bill_date`,
            [customer_id, billNumber, grandTotal, amount_paid, payment_method_id, paymentStatus, userId]
        );
        const billId = billRes.rows[0].wholesale_bill_id;

        // D. Process Items: Insert Bill Items & Log into Ledger
        for (const item of processedItems) {
            // 1. Insert Item
            await client.query(
                `INSERT INTO wholesale_bill_items (wholesale_bill_id, product_id, quantity, unit_price, total_price)
                 VALUES ($1, $2, $3, $4, $5)`,
                [billId, item.product_id, item.quantity, item.unit_price, item.total_price]
            );

            // 2. Ledger Transaction (Trigger updates stock automatically)
            await client.query(
                `INSERT INTO inventory_transactions 
                (product_id, transaction_type, quantity, reference_id, reference_type, performed_by)
                VALUES ($1, 'sale', $2, $3, 'wholesale_bill', $4)`,
                [
                    item.product_id, 
                    item.quantity, // Positive number (Trigger handles deduction)
                    billId, 
                    userId
                ]
            );
        }

        await client.query('COMMIT');
        
        res.status(201).json({ 
            message: 'Bill created successfully', 
            bill_id: billId,
            bill_number: billNumber,
            total: grandTotal,
            paid: amount_paid,
            due: toDecimal(grandTotal - amount_paid)
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Transaction Error:", err);
        res.status(400).json({ error: err.message || 'Transaction failed' });
    } finally {
        client.release();
    }
};

// 4. View Bill Details (For printing or UI)
exports.getBillDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const billQuery = `
            SELECT wb.*, c.customer_name, c.phone, c.address, u.name as created_by_name, pm.method_name
            FROM wholesale_bills wb
            JOIN customers c ON wb.customer_id = c.customer_id
            JOIN users u ON wb.created_by = u.user_id
            LEFT JOIN payment_methods pm ON wb.payment_method_id = pm.payment_method_id
            WHERE wb.wholesale_bill_id = $1
        `;

        const itemsQuery = `
            SELECT wbi.*, p.product_name, un.unit_name
            FROM wholesale_bill_items wbi
            JOIN products p ON wbi.product_id = p.product_id
            LEFT JOIN units un ON p.unit_id = un.unit_id
            WHERE wbi.wholesale_bill_id = $1
        `;

        const bill = await db.query(billQuery, [id]);
        if (bill.rows.length === 0) return res.status(404).json({ error: 'Bill not found' });

        const items = await db.query(itemsQuery, [id]);

        res.json({
            bill: bill.rows[0],
            items: items.rows
        });
    } catch (err) {
        res.status(500).json({ error: 'Error fetching bill details' });
    }
};

// 5. Generate PDF
exports.generatePdf = async (req, res) => {
    const client = await db.pool.connect();
    try {
        const { id } = req.params;

        const billQuery = `
            SELECT 
                wb.*,
                c.customer_name, c.address, c.phone, c.email,
                u.name AS creator_name
            FROM wholesale_bills wb
            JOIN customers c  ON wb.customer_id = c.customer_id
            LEFT JOIN users u ON wb.created_by  = u.user_id
            WHERE wb.wholesale_bill_id = $1`;

        const itemsQuery = `
            SELECT wbi.*, p.product_name
            FROM wholesale_bill_items wbi
            JOIN products p ON wbi.product_id = p.product_id
            WHERE wbi.wholesale_bill_id = $1`;

        const billData = await client.query(billQuery, [id]);
        if (billData.rows.length === 0) return res.status(404).send('Bill not found');

        const itemsData = await client.query(itemsQuery, [id]);

        if (typeof pdfGenerator.buildPDF !== 'function') {
            return res.status(500).json({ error: "PDF Generator not found" });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment;filename=invoice_${billData.rows[0].bill_number}.pdf`);

        pdfGenerator.buildPDF(
            (chunk) => {
                if (!res.writableEnded && !res.closed) res.write(chunk);
            },
            () => {
                if (!res.writableEnded && !res.closed) res.end();
            },
            billData.rows[0],   // now includes creator_name
            itemsData.rows
        );

    } catch (error) {
        console.error("Error generating PDF:", error);
        if (!res.headersSent) res.status(500).send("Error generating PDF");
    } finally {
        client.release();
    }
};
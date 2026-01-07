const db = require('../db');
const Joi = require('joi');

const querySchema = Joi.object({
    date: Joi.date().iso().optional().messages({
        'date.format': 'Date must be in YYYY-MM-DD format'
    })
});

const getTodayStatus = async (req, res) => {
    try {
        const { error, value } = querySchema.validate(req.query);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const queryDate = value.date 
            ? new Date(value.date).toISOString().split('T')[0] 
            : new Date().toISOString().split('T')[0];

        // --- FIXED QUERIES ---

        // 1. Retail Stats (Using Subqueries to avoid duplication)
        const retailStatsQuery = `
            SELECT 
                (
                    SELECT COALESCE(SUM(total_amount), 0) 
                    FROM retail_bills 
                    WHERE DATE(bill_date) = $1
                ) as revenue,
                (
                    SELECT COALESCE(SUM(rbi.quantity * p.cost_price), 0)
                    FROM retail_bill_items rbi
                    JOIN retail_bills rb ON rbi.retail_bill_id = rb.retail_bill_id
                    LEFT JOIN prices p ON rbi.product_id = p.product_id AND p.is_active = TRUE
                    WHERE DATE(rb.bill_date) = $1
                ) as total_cogs
        `;

        // 2. Wholesale Stats (Using Subqueries to avoid duplication)
        const wholesaleStatsQuery = `
            SELECT 
                (
                    SELECT COALESCE(SUM(total_amount), 0) 
                    FROM wholesale_bills 
                    WHERE DATE(bill_date) = $1
                ) as revenue,
                (
                    SELECT COALESCE(SUM(wbi.quantity * p.cost_price), 0)
                    FROM wholesale_bill_items wbi
                    JOIN wholesale_bills wb ON wbi.wholesale_bill_id = wb.wholesale_bill_id
                    LEFT JOIN prices p ON wbi.product_id = p.product_id AND p.is_active = TRUE
                    WHERE DATE(wb.bill_date) = $1
                ) as total_cogs
        `;

        // 3. Top Retail Products (Remains same, logic was already correct)
        const topRetailQuery = `
            SELECT 
                p.product_name, 
                SUM(rbi.quantity) as total_qty, 
                SUM(rbi.total_price) as total_sales
            FROM retail_bill_items rbi
            JOIN retail_bills rb ON rbi.retail_bill_id = rb.retail_bill_id
            JOIN products p ON rbi.product_id = p.product_id
            WHERE DATE(rb.bill_date) = $1
            GROUP BY p.product_name
            ORDER BY total_sales DESC
            LIMIT 5
        `;

        // 4. Top Wholesale Products (Remains same)
        const topWholesaleQuery = `
            SELECT 
                p.product_name, 
                SUM(wbi.quantity) as total_qty, 
                SUM(wbi.total_price) as total_sales
            FROM wholesale_bill_items wbi
            JOIN wholesale_bills wb ON wbi.wholesale_bill_id = wb.wholesale_bill_id
            JOIN products p ON wbi.product_id = p.product_id
            WHERE DATE(wb.bill_date) = $1
            GROUP BY p.product_name
            ORDER BY total_sales DESC
            LIMIT 5
        `;

        // Execute
        const [retailStats, wholesaleStats, topRetail, topWholesale] = await Promise.all([
            db.query(retailStatsQuery, [queryDate]),
            db.query(wholesaleStatsQuery, [queryDate]),
            db.query(topRetailQuery, [queryDate]),
            db.query(topWholesaleQuery, [queryDate])
        ]);

        // Calculations
        const retailRevenue = parseFloat(retailStats.rows[0].revenue);
        const retailCost = parseFloat(retailStats.rows[0].total_cogs);
        const retailProfit = retailRevenue - retailCost;

        const wholesaleRevenue = parseFloat(wholesaleStats.rows[0].revenue);
        const wholesaleCost = parseFloat(wholesaleStats.rows[0].total_cogs);
        const wholesaleProfit = wholesaleRevenue - wholesaleCost;

        res.status(200).json({
            date: queryDate,
            summary: {
                retail: {
                    revenue: retailRevenue.toFixed(2),
                    profit: retailProfit.toFixed(2)
                },
                wholesale: {
                    revenue: wholesaleRevenue.toFixed(2),
                    profit: wholesaleProfit.toFixed(2)
                },
                total: {
                    revenue: (retailRevenue + wholesaleRevenue).toFixed(2),
                    profit: (retailProfit + wholesaleProfit).toFixed(2)
                }
            },
            top_products: {
                retail: topRetail.rows,
                wholesale: topWholesale.rows
            }
        });

    } catch (err) {
        console.error("Dashboard Error:", err.message);
        res.status(500).json({ error: "Server Error" });
    }
};

module.exports = {
    getTodayStatus
};
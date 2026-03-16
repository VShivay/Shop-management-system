const db = require('../db');
const Joi = require('joi');
const { formatInTimeZone } = require('date-fns-tz'); // <-- Added import

const querySchema = Joi.object({
    date: Joi.date().iso().optional(),
    graph_filter: Joi.string().valid('week', 'month').default('week')
});

// --- HELPER: Get Today in strict IST ---
const getTodayIST = () => {
    // Generates "YYYY-MM-DD" securely locked to Indian Standard Time
    return formatInTimeZone(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
};

const getTodayStatus = async (req, res) => {
    try {
        const { error, value } = querySchema.validate(req.query);
        if (error) return res.status(400).json({ error: error.details[0].message });

        // 1. Setup Dates (Now uses strict IST fallback)
        const queryDate = value.date 
            ? new Date(value.date).toISOString().split('T')[0] 
            : getTodayIST();

        // Interval for graph (7 days or 30 days)
        const interval = value.graph_filter === 'month' ? '30 days' : '7 days';

        // =================================================================================
        // FIX 1: TODAY'S STATS (Separated Subqueries to prevent duplication)
        // =================================================================================
        
        // Retail: Revenue from Bills Table, Cost from Items Table
        const retailStatsQuery = `
            SELECT 
                (SELECT COALESCE(SUM(total_amount), 0) 
                 FROM retail_bills 
                 WHERE DATE(bill_date) = $1)::FLOAT as revenue,
                 
                (SELECT COALESCE(SUM(rbi.quantity * p.cost_price), 0)
                 FROM retail_bill_items rbi
                 JOIN retail_bills rb ON rbi.retail_bill_id = rb.retail_bill_id
                 LEFT JOIN prices p ON rbi.product_id = p.product_id AND p.is_active = TRUE
                 WHERE DATE(rb.bill_date) = $1)::FLOAT as total_cogs
        `;

        // Wholesale: Revenue from Bills Table, Cost from Items Table
        const wholesaleStatsQuery = `
            SELECT 
                (SELECT COALESCE(SUM(total_amount), 0) 
                 FROM wholesale_bills 
                 WHERE DATE(bill_date) = $1)::FLOAT as revenue,
                 
                (SELECT COALESCE(SUM(wbi.quantity * p.cost_price), 0)
                 FROM wholesale_bill_items wbi
                 JOIN wholesale_bills wb ON wbi.wholesale_bill_id = wb.wholesale_bill_id
                 LEFT JOIN prices p ON wbi.product_id = p.product_id AND p.is_active = TRUE
                 WHERE DATE(wb.bill_date) = $1)::FLOAT as total_cogs
        `;

        // =================================================================================
        // FIX 2: GRAPH QUERY (Strict Separation of Revenue & Cost CTEs)
        // Changed CURRENT_DATE to $1::DATE to sync graph with explicit IST date
        // =================================================================================
        const graphQuery = `
            WITH date_series AS (
                SELECT generate_series($1::DATE - INTERVAL '${interval}', $1::DATE, '1 day'::interval)::date AS day
            ),
            -- 1. Retail Revenue (Bills Table Only - No Join to Items)
            retail_rev AS (
                SELECT DATE(bill_date) as day, SUM(total_amount) as amount 
                FROM retail_bills 
                WHERE DATE(bill_date) >= $1::DATE - INTERVAL '${interval}' AND DATE(bill_date) <= $1::DATE
                GROUP BY 1
            ),
            -- 2. Retail Cost (Items Table Joined to Prices)
            retail_cost AS (
                SELECT DATE(rb.bill_date) as day, SUM(rbi.quantity * p.cost_price) as cost
                FROM retail_bill_items rbi
                JOIN retail_bills rb ON rbi.retail_bill_id = rb.retail_bill_id
                JOIN prices p ON rbi.product_id = p.product_id AND p.is_active = TRUE
                WHERE DATE(rb.bill_date) >= $1::DATE - INTERVAL '${interval}' AND DATE(rb.bill_date) <= $1::DATE
                GROUP BY 1
            ),
            -- 3. Wholesale Revenue (Bills Table Only)
            wholesale_rev AS (
                SELECT DATE(bill_date) as day, SUM(total_amount) as amount 
                FROM wholesale_bills 
                WHERE DATE(bill_date) >= $1::DATE - INTERVAL '${interval}' AND DATE(bill_date) <= $1::DATE
                GROUP BY 1
            ),
            -- 4. Wholesale Cost (Items Table Joined to Prices)
            wholesale_cost AS (
                SELECT DATE(wb.bill_date) as day, SUM(wbi.quantity * p.cost_price) as cost
                FROM wholesale_bill_items wbi
                JOIN wholesale_bills wb ON wbi.wholesale_bill_id = wb.wholesale_bill_id
                JOIN prices p ON wbi.product_id = p.product_id AND p.is_active = TRUE
                WHERE DATE(wb.bill_date) >= $1::DATE - INTERVAL '${interval}' AND DATE(wb.bill_date) <= $1::DATE
                GROUP BY 1
            )
            -- 5. Merge Everything on Date Series
            SELECT 
                TO_CHAR(ds.day, 'Mon DD') as date_label,
                -- Total Revenue = Retail Rev + Wholesale Rev
                (COALESCE(rr.amount, 0) + COALESCE(wr.amount, 0))::FLOAT as total_revenue,
                -- Total Profit = (Retail Rev - Retail Cost) + (Wholesale Rev - Wholesale Cost)
                (
                    (COALESCE(rr.amount, 0) - COALESCE(rc.cost, 0)) + 
                    (COALESCE(wr.amount, 0) - COALESCE(wc.cost, 0))
                )::FLOAT as total_profit
            FROM date_series ds
            LEFT JOIN retail_rev rr ON ds.day = rr.day
            LEFT JOIN retail_cost rc ON ds.day = rc.day
            LEFT JOIN wholesale_rev wr ON ds.day = wr.day
            LEFT JOIN wholesale_cost wc ON ds.day = wc.day
            ORDER BY ds.day ASC;
        `;

        // =================================================================================
        // TOP PRODUCTS (Standard Logic)
        // =================================================================================
        const topRetailQuery = `
            SELECT p.product_name, SUM(rbi.quantity)::FLOAT as total_qty, SUM(rbi.total_price)::FLOAT as total_sales
            FROM retail_bill_items rbi 
            JOIN retail_bills rb ON rbi.retail_bill_id = rb.retail_bill_id
            JOIN products p ON rbi.product_id = p.product_id 
            WHERE DATE(rb.bill_date) = $1
            GROUP BY p.product_name ORDER BY total_sales DESC LIMIT 5
        `;

        const topWholesaleQuery = `
            SELECT p.product_name, SUM(wbi.quantity)::FLOAT as total_qty, SUM(wbi.total_price)::FLOAT as total_sales
            FROM wholesale_bill_items wbi 
            JOIN wholesale_bills wb ON wbi.wholesale_bill_id = wb.wholesale_bill_id
            JOIN products p ON wbi.product_id = p.product_id 
            WHERE DATE(wb.bill_date) = $1
            GROUP BY p.product_name ORDER BY total_sales DESC LIMIT 5
        `;

        // Execute All in Parallel
        // Notice we are passing [queryDate] to the graphQuery now too!
        const [retailRes, wholesaleRes, graphRes, topRetailRes, topWholesaleRes] = await Promise.all([
            db.query(retailStatsQuery, [queryDate]),
            db.query(wholesaleStatsQuery, [queryDate]),
            db.query(graphQuery, [queryDate]), 
            db.query(topRetailQuery, [queryDate]),
            db.query(topWholesaleQuery, [queryDate])
        ]);

        // Process Results
        const retail = retailRes.rows[0];
        const wholesale = wholesaleRes.rows[0];

        // Safe Profit Calculation
        const retailProfit = (retail.revenue || 0) - (retail.total_cogs || 0);
        const wholesaleProfit = (wholesale.revenue || 0) - (wholesale.total_cogs || 0);

        res.json({
            summary: {
                retail: { revenue: retail.revenue, profit: retailProfit },
                wholesale: { revenue: wholesale.revenue, profit: wholesaleProfit },
                total: { 
                    revenue: retail.revenue + wholesale.revenue, 
                    profit: retailProfit + wholesaleProfit 
                }
            },
            graph_data: graphRes.rows,
            top_products: {
                retail: topRetailRes.rows,
                wholesale: topWholesaleRes.rows
            }
        });

    } catch (err) {
        console.error("Dashboard Error:", err);
        res.status(500).json({ error: "Server Error" });
    }
};

module.exports = { getTodayStatus };
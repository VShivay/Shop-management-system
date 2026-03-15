const db = require('../db');
const { reportFilterSchema } = require('../validation/reportValidation');
const { formatNumber } = require('../utils/reportUtils');
const { 
    startOfDay, 
    endOfDay, 
    startOfMonth, 
    endOfMonth, 
    startOfYear, 
    endOfYear, 
    parseISO, 
    format 
} = require('date-fns');

// Helper to fetch raw data (reused by PDF generator)
const fetchReportData = async (queryFilters) => {
    const { filterType, specificDate, month, year, startDate, endDate } = queryFilters;

    // 1. Build Date Filter using date-fns
    let start, end;
    const now = new Date();

    switch (filterType) {
        case 'today':
            start = startOfDay(now);
            end = endOfDay(now);
            break;
        case 'date':
            start = startOfDay(parseISO(specificDate));
            end = endOfDay(parseISO(specificDate));
            break;
        case 'month':
            const monthDate = new Date(year, month - 1, 1);
            start = startOfMonth(monthDate);
            end = endOfMonth(monthDate);
            break;
        case 'year':
            const yearDate = new Date(year, 0, 1);
            start = startOfYear(yearDate);
            end = endOfYear(yearDate);
            break;
        case 'range':
            start = startOfDay(parseISO(startDate));
            end = endOfDay(parseISO(endDate));
            break;
        default:
            start = startOfDay(now);
            end = endOfDay(now);
    }

    const params = [start, end];
    // This replaces the old string-replace logic cleanly
    const dateCondition = `it.transaction_date >= $1 AND it.transaction_date <= $2`;

    // 2. Sales Data Query (Added MAX(transaction_date))
    const salesQuery = `
        SELECT 
            p.product_id,
            p.product_name, 
            COALESCE(c.category_name, 'Uncategorized') AS category_name,
            COALESCE(u.unit_name, 'pcs') AS unit_name,
            SUM(it.quantity) AS total_quantity,
            MAX(i.available_quantity_in_hand) AS current_stock,
            MAX(i.available_quantity_in_hand * COALESCE(pr.cost_price, 0)) AS current_stock_value,
            MAX(it.transaction_date) AS transaction_date,
            SUM(
                CASE 
                    WHEN it.reference_type = 'retail_bill' THEN COALESCE(rbi.total_price, 0)
                    WHEN it.reference_type = 'wholesale_bill' THEN COALESCE(wbi.total_price, 0)
                    ELSE (it.quantity * COALESCE(pr.retail_price, pr.wholesale_price, 0))
                END
            ) AS actual_revenue
        FROM inventory_transactions it
        JOIN products p ON it.product_id = p.product_id
        LEFT JOIN inventory i ON p.product_id = i.product_id
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN units u ON p.unit_id = u.unit_id
        LEFT JOIN retail_bill_items rbi 
            ON it.reference_type = 'retail_bill' 
            AND it.reference_id = rbi.retail_bill_id 
            AND it.product_id = rbi.product_id
        LEFT JOIN wholesale_bill_items wbi 
            ON it.reference_type = 'wholesale_bill' 
            AND it.reference_id = wbi.wholesale_bill_id 
            AND it.product_id = wbi.product_id
        LEFT JOIN prices pr ON p.product_id = pr.product_id AND pr.is_active = TRUE
        WHERE it.transaction_type = 'sale' AND ${dateCondition}
        GROUP BY p.product_id, p.product_name, c.category_name, u.unit_name
        ORDER BY transaction_date DESC;
    `;

    // 3. Restock Data Query (Added MAX(transaction_date))
    const restockQuery = `
        SELECT 
            p.product_id,
            p.product_name, 
            COALESCE(s.supplier_name, 'Manual/Initial') AS supplier_name,
            COALESCE(u.unit_name, 'pcs') AS unit_name,
            SUM(it.quantity) AS total_quantity,
            MAX(i.available_quantity_in_hand) AS current_stock,
            MAX(i.available_quantity_in_hand * COALESCE(pr.cost_price, 0)) AS current_stock_value,
            MAX(it.transaction_date) AS transaction_date,
            SUM(it.quantity * COALESCE(pr.cost_price, 0)) AS estimated_cost
        FROM inventory_transactions it
        JOIN products p ON it.product_id = p.product_id
        LEFT JOIN inventory i ON p.product_id = i.product_id
        LEFT JOIN suppliers s ON it.supplier_id = s.supplier_id
        LEFT JOIN units u ON p.unit_id = u.unit_id
        LEFT JOIN prices pr ON p.product_id = pr.product_id AND pr.is_active = TRUE
        WHERE it.transaction_type IN ('restock', 'initial_stock') AND ${dateCondition}
        GROUP BY p.product_id, p.product_name, s.supplier_id, s.supplier_name, u.unit_name
        ORDER BY transaction_date DESC; 
    `;

    // 4. Total Stock Data Query
    const totalStockQuery = `
        SELECT 
            SUM(i.available_quantity_in_hand) AS grand_total_stock,
            SUM(i.available_quantity_in_hand * COALESCE(pr.cost_price, 0)) AS grand_total_stock_value
        FROM inventory i
        LEFT JOIN prices pr ON i.product_id = pr.product_id AND pr.is_active = TRUE;
    `;

    // Execute queries concurrently
    const [salesResult, restockResult, totalStockResult] = await Promise.all([
        db.query(salesQuery, params),
        db.query(restockQuery, params),
        db.query(totalStockQuery) 
    ]);

    // Calculate totals safely
    const summary = {
        totalSalesQuantity: salesResult.rows.reduce((sum, row) => sum + Number(row.total_quantity || 0), 0),
        totalRestockQuantity: restockResult.rows.reduce((sum, row) => sum + Number(row.total_quantity || 0), 0),
        totalEstimatedRevenue: salesResult.rows.reduce((sum, row) => sum + Number(row.actual_revenue || 0), 0),
        totalEstimatedCost: restockResult.rows.reduce((sum, row) => sum + Number(row.estimated_cost || 0), 0),
        
        totalCurrentStock: Number(totalStockResult.rows[0]?.grand_total_stock || 0),
        totalCurrentStockValue: Number(totalStockResult.rows[0]?.grand_total_stock_value || 0)
    };

    return {
        sales: salesResult.rows,
        restocks: restockResult.rows,
        summary,
        filters: queryFilters
    };
};

// API Endpoint: Get JSON Data
// API Endpoint: Get JSON Data
const getInventoryReports = async (req, res) => {
    try {
        const { error, value } = reportFilterSchema.validate(req.query);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const data = await fetchReportData(value);

        // Safely parse the Postgres timestamp and convert to a standard ISO string
        const formatDate = (dateString) => {
            if (!dateString) return '-';
            // This turns "2026-03-15 19:06:52.332224+05:30" into "2026-03-15T13:36:52.332Z"
            const dateObj = new Date(dateString);
            return isNaN(dateObj.getTime()) ? '-' : dateObj.toISOString(); 
        };

        // Format numbers and dates for JSON response
        const formattedSales = data.sales.map(item => ({
            ...item,
            transaction_date: formatDate(item.transaction_date),
            total_quantity: formatNumber(item.total_quantity),
            current_stock: formatNumber(item.current_stock),
            current_stock_value: formatNumber(item.current_stock_value),
            estimated_revenue: formatNumber(item.actual_revenue) 
        }));

        const formattedRestocks = data.restocks.map(item => ({
            ...item,
            transaction_date: formatDate(item.transaction_date),
            total_quantity: formatNumber(item.total_quantity),
            current_stock: formatNumber(item.current_stock),
            current_stock_value: formatNumber(item.current_stock_value),
            estimated_cost: formatNumber(item.estimated_cost)
        }));

        res.status(200).json({
            success: true,
            filters: value,
            summary: {
                totalSalesQuantity: formatNumber(data.summary.totalSalesQuantity),
                totalRestockQuantity: formatNumber(data.summary.totalRestockQuantity),
                totalEstimatedRevenue: formatNumber(data.summary.totalEstimatedRevenue),
                totalEstimatedCost: formatNumber(data.summary.totalEstimatedCost),
                totalCurrentStock: formatNumber(data.summary.totalCurrentStock),
                totalCurrentStockValue: formatNumber(data.summary.totalCurrentStockValue)
            },
            salesReport: formattedSales,
            restockReport: formattedRestocks
        });

    } catch (err) {
        console.error('Error fetching inventory reports:', err);
        res.status(500).json({ error: 'Server Error fetching inventory reports' });
    }
};
// Add these new functions to your existing controller file

// 1. Debounced Product Search API
const searchProducts = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.trim() === '') {
            return res.status(200).json({ success: true, data: [] });
        }

        const searchQuery = `
            SELECT p.product_id, p.product_name, COALESCE(c.category_name, 'Uncategorized') as category_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.category_id
            WHERE p.product_name ILIKE $1 AND p.is_active = TRUE
            LIMIT 10;
        `;
        
        const result = await db.query(searchQuery, [`%${q}%`]);
        res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error searching products:', error);
        res.status(500).json({ error: 'Server error while searching products' });
    }
};

// 2. Specific Product Inventory Report
const getProductReport = async (req, res) => {
    try {
        const { product_id } = req.params;

        // Query A: Basic Info & Current Stock
        const basicInfoQuery = `
            SELECT 
                p.product_name, p.sales_channel, 
                COALESCE(c.category_name, 'Uncategorized') AS category,
                COALESCE(u.unit_name, 'pcs') AS unit,
                COALESCE(i.available_quantity_in_hand, 0) AS current_stock,
                COALESCE(i.reserved_quantity, 0) AS reserved_quantity,
                i.last_updated
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.category_id
            LEFT JOIN units u ON p.unit_id = u.unit_id
            LEFT JOIN inventory i ON p.product_id = i.product_id
            WHERE p.product_id = $1;
        `;

        // Query B: Aggregate Calculations (Total In / Total Out)
        const calcQuery = `
            SELECT transaction_type, SUM(quantity) as total_quantity
            FROM inventory_transactions
            WHERE product_id = $1
            GROUP BY transaction_type;
        `;

        // Query C: Latest 10 Transactions
        const historyQuery = `
            SELECT 
                it.transaction_id, it.transaction_type, it.quantity, 
                it.transaction_date, it.reference_type, it.remarks,
                s.supplier_name
            FROM inventory_transactions it
            LEFT JOIN suppliers s ON it.supplier_id = s.supplier_id
            WHERE it.product_id = $1
            ORDER BY it.transaction_date DESC
            LIMIT 10;
        `;

        const [infoResult, calcResult, historyResult] = await Promise.all([
            db.query(basicInfoQuery, [product_id]),
            db.query(calcQuery, [product_id]),
            db.query(historyQuery, [product_id])
        ]);

        if (infoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Process Calculations for easy frontend rendering
        const calculations = {
            total_in: 0,
            total_out: 0,
            breakdown: {
                initial_stock: 0, restock: 0, sale: 0, return: 0, damage: 0, adjustment: 0
            }
        };

        calcResult.rows.forEach(row => {
            const qty = Number(row.total_quantity);
            const type = row.transaction_type;
            
            calculations.breakdown[type] = qty;

            // Grouping logic (Stock UP vs Stock DOWN)
            if (['initial_stock', 'restock', 'return'].includes(type)) {
                calculations.total_in += qty;
            } else if (['sale', 'damage'].includes(type)) {
                calculations.total_out += qty;
            } else if (type === 'adjustment') {
                // Assuming adjustments are logged appropriately; adapt if you split add/deduct
                calculations.breakdown.adjustment = qty;
            }
        });

        res.status(200).json({
            success: true,
            productInfo: infoResult.rows[0],
            calculations,
            recentTransactions: historyResult.rows
        });

    } catch (error) {
        console.error('Error fetching product report:', error);
        res.status(500).json({ error: 'Server error fetching product details' });
    }
};

module.exports = {
    getInventoryReports,
    fetchReportData,
    searchProducts, 
    getProductReport
};
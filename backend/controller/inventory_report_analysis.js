const db = require('../db');
const { reportFilterSchema } = require('../validation/reportValidation');
const { formatNumber, buildDateFilter } = require('../utils/reportUtils');

// Helper to fetch raw data (reused by PDF generator)
const fetchReportData = async (queryFilters) => {
    const { filterType } = queryFilters;
    const { dateCondition, params } = buildDateFilter(filterType, queryFilters);

    // 1. Sales Data
    const salesQuery = `
        SELECT 
            p.product_name, 
            c.category_name,
            u.unit_name,
            SUM(ABS(il.quantity_change)) as total_quantity
        FROM inventory_logs il
        JOIN products p ON il.product_id = p.product_id
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN units u ON p.unit_id = u.unit_id
        WHERE il.change_type = 'sale' AND ${dateCondition}
        GROUP BY p.product_name, c.category_name, u.unit_name
        ORDER BY total_quantity DESC;
    `;

    // 2. Restock Data
    // FIX: Changed ORDER BY il.change_date -> ORDER BY MAX(il.change_date)
    const restockQuery = `
        SELECT 
            p.product_name, 
            s.supplier_name,
            u.unit_name,
            SUM(il.quantity_change) as total_quantity
        FROM inventory_logs il
        JOIN products p ON il.product_id = p.product_id
        LEFT JOIN suppliers s ON il.supplier_id = s.supplier_id
        LEFT JOIN units u ON p.unit_id = u.unit_id
        WHERE il.change_type = 'restock' AND ${dateCondition}
        GROUP BY p.product_name, s.supplier_name, u.unit_name
        ORDER BY MAX(il.change_date) DESC; 
    `;

    const salesResult = await db.query(salesQuery, params);
    const restockResult = await db.query(restockQuery, params);

    // Calculate totals
    const totalSalesQty = salesResult.rows.reduce((sum, row) => sum + Number(row.total_quantity), 0);
    const totalRestockQty = restockResult.rows.reduce((sum, row) => sum + Number(row.total_quantity), 0);

    return {
        sales: salesResult.rows,
        restocks: restockResult.rows,
        summary: {
            totalSalesQuantity: totalSalesQty,
            totalRestockQuantity: totalRestockQty
        },
        filters: queryFilters
    };
};

// API Endpoint: Get JSON Data
const getInventoryReports = async (req, res) => {
    try {
        // Validate Inputs
        const { error, value } = reportFilterSchema.validate(req.query);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const data = await fetchReportData(value);

        // Format numbers for JSON response
        const formattedSales = data.sales.map(item => ({
            ...item,
            total_quantity: formatNumber(item.total_quantity)
        }));

        const formattedRestocks = data.restocks.map(item => ({
            ...item,
            total_quantity: formatNumber(item.total_quantity)
        }));

        res.status(200).json({
            success: true,
            filters: value,
            summary: {
                totalSalesQuantity: formatNumber(data.summary.totalSalesQuantity),
                totalRestockQuantity: formatNumber(data.summary.totalRestockQuantity)
            },
            salesReport: formattedSales,
            restockReport: formattedRestocks
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error fetching inventory reports' });
    }
};

module.exports = {
    getInventoryReports,
    fetchReportData 
};
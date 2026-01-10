const db = require('../db');
const Joi = require('joi');
const pdfService = require('../pdf/report_analysis_pdf');

// Helper: Calculate Date Range based on filter
const getDateRange = (filterType, customStart, customEnd) => {
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();

    switch (filterType) {
        case 'today':
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'this_week':
            // Assume week starts on Monday
            const day = startDate.getDay() || 7; 
            if (day !== 1) startDate.setHours(-24 * (day - 1));
            startDate.setHours(0,0,0,0);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'this_month':
            startDate.setDate(1);
            startDate.setHours(0,0,0,0);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'this_year':
            startDate.setMonth(0, 1);
            startDate.setHours(0,0,0,0);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'custom':
            if (!customStart || !customEnd) throw new Error('Custom dates required');
            startDate = new Date(customStart);
            endDate = new Date(customEnd);
            endDate.setHours(23, 59, 59, 999); // Ensure end of day
            break;
        default:
            // Default to last 6 months
            startDate.setMonth(startDate.getMonth() - 6);
            break;
    }
    return { startDate, endDate };
};

// Helper: Validation Schema
const reportSchema = Joi.object({
    type: Joi.string().valid('retail', 'wholesale').required(),
    filter: Joi.string().valid('today', 'this_week', 'this_month', 'this_year', 'custom').required(),
    startDate: Joi.date().iso().when('filter', { is: 'custom', then: Joi.required() }),
    endDate: Joi.date().iso().when('filter', { is: 'custom', then: Joi.required() }),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    downloadPdf: Joi.boolean().default(false)
});

// Generic Report Handler
const generateReport = async (req, res, tablePrefix) => {
    try {
        // --- FIX IS HERE: Merge type: tablePrefix explicitly ---
        const validationPayload = { 
            ...req.query, 
            ...req.params, 
            type: tablePrefix 
        };

        const { error, value } = reportSchema.validate(validationPayload);
        
        if (error) {
            console.error("Validation Error:", error.details[0].message);
            return res.status(400).json({ error: error.details[0].message });
        }

        const { filter, startDate: qStart, endDate: qEnd, page, limit, downloadPdf } = value;
        
        // Calculate dates
        let dateRange;
        try {
            dateRange = getDateRange(filter, qStart, qEnd);
        } catch (e) {
            return res.status(400).json({ error: e.message });
        }
        const { startDate, endDate } = dateRange;

        // 2. Define Table Names based on prefix (retail vs wholesale)
        const billTable = `${tablePrefix}_bills`;
        const itemTable = `${tablePrefix}_bill_items`;
        const billIdCol = `${tablePrefix}_bill_id`;

        // 3. SQL Query Construction
        const queryText = `
            WITH item_calculations AS (
                SELECT 
                    b.bill_date,
                    b.bill_number,
                    p.product_name,
                    i.quantity,
                    i.unit_price as selling_price,
                    i.total_price as total_revenue,
                    -- Subquery to find cost price active at the moment of bill creation
                    COALESCE(
                        (SELECT cost_price FROM prices pr 
                         WHERE pr.product_id = i.product_id 
                         AND pr.effective_from <= b.bill_date 
                         ORDER BY pr.effective_from DESC LIMIT 1),
                        0 
                    ) as historical_cost
                FROM ${itemTable} i
                JOIN ${billTable} b ON i.${billIdCol} = b.${billIdCol}
                JOIN products p ON i.product_id = p.product_id
                WHERE b.bill_date >= $1 AND b.bill_date <= $2
            ),
            aggregates AS (
                SELECT 
                    count(*) as total_count,
                    SUM(total_revenue) as period_revenue,
                    SUM(quantity * historical_cost) as period_cost
                FROM item_calculations
            )
            SELECT 
                ic.*,
                (ic.total_revenue - (ic.quantity * ic.historical_cost)) as profit_loss,
                ag.total_count,
                ag.period_revenue,
                ag.period_cost
            FROM item_calculations ic, aggregates ag
            ORDER BY ic.bill_date DESC
            ${downloadPdf ? '' : 'LIMIT $3 OFFSET $4'} 
        `;

        const offset = (page - 1) * limit;
        const queryParams = downloadPdf 
            ? [startDate, endDate] 
            : [startDate, endDate, limit, offset];

        const result = await db.query(queryText, queryParams);
        const rows = result.rows;

        // 4. Calculate Summary Metrics
        // If rows exist, the aggregates are repeated in every row. We pick them from the first one.
        const summary = rows.length > 0 ? {
            totalSales: Number(rows[0].period_revenue) || 0,
            totalCost: Number(rows[0].period_cost) || 0,
            totalProfit: (Number(rows[0].period_revenue) || 0) - (Number(rows[0].period_cost) || 0),
            totalRecords: parseInt(rows[0].total_count) || 0
        } : { totalSales: 0, totalCost: 0, totalProfit: 0, totalRecords: 0 };

        // Clean up rows for response (remove aggregate columns from individual rows)
        const cleanedRows = rows.map(r => ({
            bill_date: r.bill_date,
            bill_number: r.bill_number,
            product_name: r.product_name,
            quantity: r.quantity,
            selling_price: r.selling_price,
            cost_price: r.historical_cost,
            total_revenue: r.total_revenue,
            profit: r.profit_loss
        }));

        // 5. Handle PDF Download vs JSON Response
        if (downloadPdf) {
            return pdfService.createReportPDF(res, cleanedRows, summary, tablePrefix, startDate, endDate);
        }

        return res.json({
            meta: {
                filter,
                startDate,
                endDate,
                page,
                limit,
                totalPages: Math.ceil(summary.totalRecords / limit) || 1,
                ...summary
            },
            data: cleanedRows
        });

    } catch (err) {
        console.error("Report Generation Error:", err);
        res.status(500).json({ error: 'Server Error' });
    }
};

exports.getWholesaleAnalysis = (req, res) => {
    // We pass 'wholesale' as the third argument
    return generateReport(req, res, 'wholesale');
};

exports.getRetailAnalysis = (req, res) => {
    // We pass 'retail' as the third argument
    return generateReport(req, res, 'retail');
};
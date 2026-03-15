const db = require('../db');
const Joi = require('joi');
const pdfService = require('../pdf/report_analysis_pdf');
const { formatInTimeZone } = require('date-fns-tz'); // <-- Added import

// --- HELPER: IST Date Formatting ---
const formatDateToIST = (dateString) => {
    if (!dateString) return '-';
    const dateObj = new Date(dateString);
    if (isNaN(dateObj.getTime())) return '-';
    // Forces Indian Standard Time with 12-hour AM/PM format
    return formatInTimeZone(dateObj, 'Asia/Kolkata', 'yyyy-MM-dd hh:mm:ss a');
};

// --- HELPER: Get Current Time in India (IST) ---
const getIndiaDate = () => {
    const indiaTimeStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    return new Date(indiaTimeStr);
};

// --- HELPER: Calculate Date Range ---
const getDateRange = (filterType, customStart, customEnd, specificMonth, specificYear) => {
    const now = getIndiaDate();
    let startDate = new Date(now);
    let endDate = new Date(now);

    const startOfDay = (d) => { d.setHours(0, 0, 0, 0); return d; };
    const endOfDay = (d) => { d.setHours(23, 59, 59, 999); return d; };

    switch (filterType) {
        case 'today':
            startOfDay(startDate);
            endOfDay(endDate);
            break;

        case 'yesterday':
            // Move back 1 day
            startDate.setDate(startDate.getDate() - 1);
            endDate.setDate(endDate.getDate() - 1);
            
            startOfDay(startDate);
            endOfDay(endDate);
            break;

        case 'this_week':
            // logic: Calculate Monday (Start) to Sunday (End)
            const currentDay = startDate.getDay() || 7; // Mon=1, ... Sun=7
            
            // Set Start Date to Monday
            startDate.setDate(startDate.getDate() - (currentDay - 1));
            startOfDay(startDate);

            // Set End Date to Sunday (Monday + 6 days)
            endDate = new Date(startDate); // Copy Monday
            endDate.setDate(startDate.getDate() + 6); 
            endOfDay(endDate);
            break;

        case 'this_month':
            startDate.setDate(1); // 1st of current month
            startOfDay(startDate);
            endOfDay(endDate); // Today (or end of month if preferred, currently sets to 'now')
            break;

        case 'month': 
            if (!specificMonth || !specificYear) throw new Error('Month and Year required for month filter');
            startDate = new Date(specificYear, specificMonth - 1, 1);
            endDate = new Date(specificYear, specificMonth, 0);
            startOfDay(startDate);
            endOfDay(endDate);
            break;

        case 'year':
            if (!specificYear) throw new Error('Year required for year filter');
            startDate = new Date(specificYear, 0, 1); 
            endDate = new Date(specificYear, 11, 31); 
            startOfDay(startDate);
            endOfDay(endDate);
            break;

        case 'custom':
            if (!customStart || !customEnd) throw new Error('Custom dates required');
            startDate = new Date(customStart);
            endDate = new Date(customEnd);
            startOfDay(startDate);
            endOfDay(endDate);
            break;

        default:
            // Default: Last 6 months
            startDate.setMonth(startDate.getMonth() - 6);
            startOfDay(startDate);
            endOfDay(endDate);
            break;
    }

    // --- DEBUG LOGS ---
    console.log(`[Report Debug] Filter: ${filterType}`);
    console.log(`[Report Debug] Range Start: ${startDate.toLocaleString()}`);
    console.log(`[Report Debug] Range End:   ${endDate.toLocaleString()}`);

    return { startDate, endDate };
};

// --- VALIDATION SCHEMA ---
const reportSchema = Joi.object({
    type: Joi.string().valid('retail', 'wholesale').required(),
    // Updated filters: Removed 'tomorrow', Added 'yesterday'
    filter: Joi.string().valid('today', 'yesterday', 'this_week', 'this_month', 'month', 'year', 'custom').required(),
    
    startDate: Joi.date().iso().when('filter', { is: 'custom', then: Joi.required() }),
    endDate: Joi.date().iso().when('filter', { is: 'custom', then: Joi.required() }),
    
    selectedMonth: Joi.number().integer().min(1).max(12).when('filter', { is: 'month', then: Joi.required() }),
    selectedYear: Joi.number().integer().min(2000).max(2100).when('filter', { is: Joi.valid('month', 'year'), then: Joi.required() }),

    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    downloadPdf: Joi.boolean().default(false)
});

// --- MAIN HANDLER ---
const generateReport = async (req, res, tablePrefix) => {
    try {
        const validationPayload = { ...req.query, ...req.params, type: tablePrefix };
        const { error, value } = reportSchema.validate(validationPayload);
        
        if (error) {
            console.error("Validation Error:", error.details[0].message);
            return res.status(400).json({ error: error.details[0].message });
        }

        const { filter, startDate: qStart, endDate: qEnd, selectedMonth, selectedYear, page, limit, downloadPdf } = value;
        
        let dateRange;
        try {
            dateRange = getDateRange(filter, qStart, qEnd, selectedMonth, selectedYear);
        } catch (e) {
            return res.status(400).json({ error: e.message });
        }
        const { startDate, endDate } = dateRange;

        const billTable = `${tablePrefix}_bills`;
        const itemTable = `${tablePrefix}_bill_items`;
        const billIdCol = `${tablePrefix}_bill_id`;

        const queryText = `
            WITH item_calculations AS (
                SELECT 
                    b.bill_date,
                    b.bill_number,
                    p.product_name,
                    i.quantity,
                    i.unit_price as selling_price,
                    i.total_price as total_revenue,
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
                WHERE b.bill_date::date >= $1::date AND b.bill_date::date <= $2::date
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

        const summary = rows.length > 0 ? {
            totalSales: Number(rows[0].period_revenue) || 0,
            totalCost: Number(rows[0].period_cost) || 0,
            totalProfit: (Number(rows[0].period_revenue) || 0) - (Number(rows[0].period_cost) || 0),
            totalRecords: parseInt(rows[0].total_count) || 0
        } : { totalSales: 0, totalCost: 0, totalProfit: 0, totalRecords: 0 };

        // <-- Apply Date Formatting Here -->
        const cleanedRows = rows.map(r => ({
            bill_date: formatDateToIST(r.bill_date),
            bill_number: r.bill_number,
            product_name: r.product_name,
            quantity: r.quantity,
            selling_price: r.selling_price,
            cost_price: r.historical_cost,
            total_revenue: r.total_revenue,
            profit: r.profit_loss
        }));

        if (downloadPdf) {
            // Passing the nicely formatted cleanedRows to your PDF generator!
            return pdfService.createReportPDF(res, cleanedRows, summary, tablePrefix, startDate, endDate);
        }

        return res.json({
            meta: {
                filter,
                selectedMonth,
                selectedYear,
                startDate,
                endDate,
                page,
                limit,
                totalPages: Math.ceil(summary.totalRecords / limit) || 1,
                ...summary
            },
            data: cleanedRows // <-- Return the formatted array
        });

    } catch (err) {
        console.error("Report Generation Error:", err);
        res.status(500).json({ error: 'Server Error' });
    }
};

exports.getWholesaleAnalysis = (req, res) => generateReport(req, res, 'wholesale');
exports.getRetailAnalysis = (req, res) => generateReport(req, res, 'retail');
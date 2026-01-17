const db = require('../db');
const Joi = require('joi');
const pdfService = require('../pdf/customer_report_analysis_pdf');
const { formatCurrency } = require('../utils/formatters');
const moment = require('moment');

const getDateRange = (dateFilter, customStart, customEnd) => {
    let start, end;
    if (dateFilter && dateFilter !== 'custom') {
        if (moment(dateFilter, "MMM YYYY", true).isValid()) {
             start = moment(dateFilter, "MMM YYYY").startOf('month');
             end = moment(dateFilter, "MMM YYYY").endOf('month');
        } else if (dateFilter.toLowerCase() === 'last year') {
            start = moment().subtract(1, 'year').startOf('year');
            end = moment().subtract(1, 'year').endOf('year');
        } else {
             start = moment().startOf('month');
             end = moment().endOf('month');
        }
    } else if (customStart && customEnd) {
        start = moment(customStart);
        end = moment(customEnd).endOf('day');
    } else {
        start = moment().startOf('month');
        end = moment().endOf('month');
    }
    return { start: start.format('YYYY-MM-DD HH:mm:ss'), end: end.format('YYYY-MM-DD HH:mm:ss') };
};

const getAnalysisData = async (req, res) => {
    const schema = Joi.object({
        dateFilter: Joi.string().allow('', null),
        startDate: Joi.date().iso().allow(null),
        endDate: Joi.date().iso().allow(null),
        format: Joi.string().valid('json', 'pdf').default('json')
    });

    const { error, value } = schema.validate(req.query);
    if (error) return res.status(400).json({ error: error.details[0].message });

    try {
        const { start, end } = getDateRange(value.dateFilter, value.startDate, value.endDate);

        const summaryQuery = `
            SELECT 
                COALESCE(SUM(total_amount), 0) as grand_total_sales,
                COUNT(wholesale_bill_id) as total_bills,
                (SELECT COUNT(*) FROM customers WHERE is_active = TRUE) as active_customers
            FROM wholesale_bills
            WHERE bill_date BETWEEN $1 AND $2
        `;

        const customerQuery = `
            SELECT 
                c.customer_name,
                c.phone,
                COUNT(wb.wholesale_bill_id) as total_bills,
                COALESCE(SUM(wb.total_amount), 0) as total_sales_amount,
                COALESCE(SUM(wb.amount_paid), 0) as total_received,
                COALESCE(SUM(wb.total_amount - wb.amount_paid), 0) as pending_amount
            FROM customers c
            JOIN wholesale_bills wb ON c.customer_id = wb.customer_id
            WHERE wb.bill_date BETWEEN $1 AND $2
            GROUP BY c.customer_id, c.customer_name, c.phone
            ORDER BY total_sales_amount DESC
        `;

        const productQuery = `
            SELECT 
                p.product_name,
                u.unit_name,
                COALESCE(SUM(wbi.quantity), 0) as total_qty_sold,
                COALESCE(SUM(wbi.total_price), 0) as total_revenue
            FROM wholesale_bill_items wbi
            JOIN wholesale_bills wb ON wbi.wholesale_bill_id = wb.wholesale_bill_id
            JOIN products p ON wbi.product_id = p.product_id
            LEFT JOIN units u ON p.unit_id = u.unit_id
            WHERE wb.bill_date BETWEEN $1 AND $2
            GROUP BY p.product_id, p.product_name, u.unit_name
            ORDER BY total_revenue DESC
        `;

        const [summaryRes, customerRes, productRes] = await Promise.all([
            db.query(summaryQuery, [start, end]),
            db.query(customerQuery, [start, end]),
            db.query(productQuery, [start, end])
        ]);

        // CONSTRUCTION: Keep data as RAW NUMBERS for Frontend JSON
        // Note: Postgres SUM() often returns strings, so we cast with Number()
        const rawData = {
            dateRange: { start, end },
            summary: {
                grandTotalSales: Number(summaryRes.rows[0].grand_total_sales || 0),
                totalBillsGenerated: Number(summaryRes.rows[0].total_bills || 0),
                activeCustomers: Number(summaryRes.rows[0].active_customers || 0)
            },
            customerAnalysis: customerRes.rows.map(row => ({
                ...row,
                total_sales_amount: Number(row.total_sales_amount || 0),
                total_received: Number(row.total_received || 0),
                pending_amount: Number(row.pending_amount || 0)
            })),
            productAnalysis: productRes.rows.map(row => ({
                ...row,
                total_qty_sold: Number(row.total_qty_sold || 0),
                total_revenue: Number(row.total_revenue || 0)
            }))
        };

        // IF PDF REQUESTED: Format the data here (server-side) before sending to PDF generator
        if (value.format === 'pdf') {
            const formattedForPdf = {
                ...rawData,
                summary: {
                    ...rawData.summary,
                    grandTotalSales: formatCurrency(rawData.summary.grandTotalSales)
                },
                customerAnalysis: rawData.customerAnalysis.map(c => ({
                    ...c,
                    total_sales_amount: formatCurrency(c.total_sales_amount),
                    total_received: formatCurrency(c.total_received),
                    pending_amount: formatCurrency(c.pending_amount)
                })),
                productAnalysis: rawData.productAnalysis.map(p => ({
                    ...p,
                    total_revenue: formatCurrency(p.total_revenue)
                }))
            };
            return pdfService.generatePDF(res, formattedForPdf);
        }

        // IF JSON REQUESTED: Send raw numbers (Frontend will handle display)
        return res.status(200).json(rawData);

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getAnalysisData };
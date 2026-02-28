// index.js
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { format } = require('date-fns');
require('dotenv').config();

const loginRoutes = require('./route/login_route');
const productRoutes = require('./route/manage_product_route');
const supplierRoutes = require('./route/manage_supplier_route');
const customerRoutes = require('./route/manage_customer_route');
const retailBillRoutes = require('./route/create_retail_bill_route');
const ViewBillRoutes = require('./route/view_retail_bill_route');
const WholesaleBillRoutes = require('./route/create_wholesale_bill_route');
const ViewWholesaleBillRoutes = require('./route/view_wholesale_bill_route');
const status = require('./route/dashboard_home_route');
const ReStockRoute = require('./route/restock_product_route');
const report = require('./route/report_analysis_route');
const CRA = require('./route/customer_report_analysis_route');
const IRA = require('./route/inventory_report_analysis_route');





const app = express();

/**
 * Request & Response Logger Middleware
 */
app.use((req, res, next) => {
    const startTime = Date.now();

    const requestTime = format(new Date(), 'dd/MM/yyyy - hh:mm a');

    console.log(
        `[${requestTime}] REQUEST → ${req.method} ${req.originalUrl}`
    );

    res.on('finish', () => {
        const responseTime = format(new Date(), 'dd/MM/yyyy - hh:mm a');
        const duration = Date.now() - startTime;

        console.log(
            `[${responseTime}] RESPONSE ← ${req.method} ${req.originalUrl} | Status: ${res.statusCode} | ${duration}ms`
        );
    });

    next();
});

// Global Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', loginRoutes);
app.use('/api', productRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api', retailBillRoutes); 
app.use('/api/view-retail-bill', ViewBillRoutes);
app.use('/api/create-bill', WholesaleBillRoutes);
app.use('/api/view-wholesale-bill', ViewWholesaleBillRoutes);
app.use('/api/today-status', status);
app.use('/api/restock', ReStockRoute);
app.use('/api/report-analysis', report);
app.use('/api/CRA', CRA);
app.use('/api/IRA', IRA);



// Global Error Handler
app.use((err, req, res, next) => {
    const errorTime = format(new Date(), 'dd/MM/yyyy - hh:mm a');
    console.error(`[${errorTime}] ERROR →`, err.stack);
    res.status(500).send('Something broke!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    const serverTime = format(new Date(), 'dd/MM/yyyy - hh:mm a');
    console.log(`[${serverTime}] Server is running on port ${PORT}`);
});

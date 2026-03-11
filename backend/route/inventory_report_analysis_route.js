const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth'); 

// Import your existing and new controllers
const { 
    getInventoryReports, 
    searchProducts, 
    getProductReport 
} = require('../controller/inventory_report_analysis');

const { generateReportPDF } = require('../pdf/inventory_report_analysis_pdf');
const { generateProductReportPDF } = require('../pdf/inventory_product_report_analysis_pdf');

// --- EXISTING ROUTES ---
router.get('/reports', auth, getInventoryReports);
router.get('/pdf', auth, generateReportPDF);

// --- NEW ROUTES ---

// Route: /api/IRA/search
// Desc: Debounced search for products (use this on the frontend input's onChange)
// Params: ?q=productName
router.get('/search', auth, searchProducts);

// Route: /api/IRA/product/:product_id
// Desc: Get calculations, basic info, and top 10 recent transactions
router.get('/product/:product_id', auth, getProductReport);

// Route: /api/IRA/product/:product_id/pdf
// Desc: Download full transaction history PDF for a specific product
router.get('/product/:product_id/pdf', auth, generateProductReportPDF);

module.exports = router;
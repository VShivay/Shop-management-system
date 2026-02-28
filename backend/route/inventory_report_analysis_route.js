const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth'); // Your existing middleware

// Controllers
const { getInventoryReports } = require('../controller/inventory_report_analysis');
const { generateReportPDF } = require('../pdf/inventory_report_analysis_pdf');

// Route: /api/IRA/reports
// Desc: Get JSON data for Sales and Restocks with filters
// Params: ?filterType=today|month|year|range&specificDate=...&month=...
router.get('/reports', auth, getInventoryReports);

// Route: /api/IRA/pdf
// Desc: Download PDF version of the report
// Params: Same as above
router.get('/pdf', auth, generateReportPDF);

module.exports = router;
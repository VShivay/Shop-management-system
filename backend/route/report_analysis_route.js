const express = require('express');
const router = express.Router();
const reportController = require('../controller/report_analysis');
const auth = require('../middleware/auth'); // User supplied auth middleware
const allowed = ['shop owner', 'admin', 'staff', 'cashier'];


// Wholesale Routes
// GET /api/report-analysis/wholesale?filter=today&page=1
// GET /api/report-analysis/wholesale?filter=custom&startDate=2023-01-01&endDate=2023-01-31&downloadPdf=true
router.get('/wholesale', auth,auth.authorize(allowed), reportController.getWholesaleAnalysis);

// Retail Routes
router.get('/retail', auth,auth.authorize(allowed), reportController.getRetailAnalysis);

module.exports = router;
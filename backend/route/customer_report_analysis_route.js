const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth'); // User authentication middleware
const controller = require('../controller/customer_report_analysis');
const allowed = ['shop owner'];


// Route for getting analysis (JSON) or PDF download
// Example usage JSON: GET /api/CRA/analysis?dateFilter=Jan 2025
// Example usage PDF:  GET /api/CRA/analysis?dateFilter=last year&format=pdf
router.get('/analysis', auth,auth.authorize(allowed), controller.getAnalysisData);

module.exports = router;
const express = require('express');
const router = express.Router();
const dashboardController = require('../controller/dashboard_home');
const auth = require('../middleware/auth'); // Importing the auth middleware

// Route: GET /api/today-status
// Desc: Get today's revenue, profit, and top products
// Access: Private (Protected by auth)
router.get('/', auth, dashboardController.getTodayStatus);

module.exports = router;
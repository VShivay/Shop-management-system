const express = require('express');
const router = express.Router();
const staffController = require('../controller/manage_staff_controller');

// Import your custom auth middleware
const auth = require('../middleware/auth');

// Apply authentication and strict role-based authorization to ALL routes in this file
router.use(auth);
router.use(auth.authorize(['shop owner']));
// ... existing imports and auth middleware ...

// GET ALL LEAVES (Must be above /staff/:id routes)
router.get('/staff/leaves/all', staffController.getAllLeaves);

// GET methods for individual staff
router.get('/staff', staffController.getAllStaff);
router.get('/staff/:id/transactions', staffController.getStaffTransactions);
router.get('/staff/:id/leaves', staffController.getStaffLeaves); // NEW: Get staff leaves

// POST methods
router.post('/staff', staffController.addStaff); 
router.post('/staff/:id/transactions', staffController.addTransaction);
router.post('/staff/:id/leaves', staffController.markLeave); // NEW: Mark leave

// PUT / PATCH methods
router.put('/staff/:id', staffController.updateStaff); 
router.patch('/staff/:id/terminate', staffController.softDeleteStaff);
router.patch('/staff/leaves/:leave_id/status', staffController.updateLeaveStatus); // NEW: Update leave status

// DELETE methods
router.delete('/staff/:id', staffController.hardDeleteStaff);

// Add these with your other PUT/PATCH methods
router.put('/staff/leaves/:leave_id', staffController.updateLeave); 

// Add this with your other DELETE methods
router.delete('/staff/leaves/:leave_id', staffController.deleteLeave);
module.exports = router;
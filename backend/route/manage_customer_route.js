// route/manage_customer_route.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const customerController = require('../controller/manage_customer');
const allowed = ['shop owner', 'admin', 'staff', 'cashier'];


// Read
router.get('/', auth,auth.authorize(allowed), customerController.getCustomers);
router.get('/:id', auth,auth.authorize(allowed), customerController.getCustomerById);

// Create
router.post('/add', auth,auth.authorize(allowed), customerController.createCustomer);

// Update
router.put('/update/:id', auth,auth.authorize(allowed), customerController.updateCustomer);

// Delete
// Soft Delete (Preferred) - Uses PUT because it updates a status flag
router.put('/soft-delete/:id', auth,auth.authorize(allowed), customerController.softDeleteCustomer);

// Hard Delete (Restricted) - Uses DELETE method
router.delete('/hard-delete/:id', auth,auth.authorize(allowed), customerController.hardDeleteCustomer);

module.exports = router;
// route/login_route.js
const express = require('express');
const router = express.Router();
const loginController = require('../controller/login');
const auth = require('../middleware/auth');

// Public Route
router.post('/login', loginController.login);

// Protected Route (Requires Valid Token)
router.get('/me', auth, loginController.me);

module.exports = router;
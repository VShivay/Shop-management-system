// controller/login.js
const db = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Joi = require('joi');

// Joi Schema for Login Validation
const loginSchema = Joi.object({
    email: Joi.string().email().required().messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required'
    }),
    password: Joi.string().required().messages({
        'any.required': 'Password is required'
    })
});

// 1. Login Controller
// 1. Updated Login Controller
const login = async (req, res) => {
    try {
        // Validate Input
        const { error } = loginSchema.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const { email, password } = req.body;

        // JOIN with roles table to get role_name immediately
        const query = `
            SELECT u.*, r.role_name 
            FROM users u
            JOIN roles r ON u.role_id = r.role_id
            WHERE u.email = $1
        `;
        
        const result = await db.query(query, [email]);
        
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        const user = result.rows[0];

        // Check active status
        if (!user.is_active) {
            return res.status(403).json({ error: 'Account is inactive.' });
        }

        // Compare Password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        // Generate JWT (Now including role_name in the payload)
        const token = jwt.sign(
    { 
        user_id: user.user_id, 
        role_id: user.role_id,
        role_name: user.role_name, 
        email: user.email 
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' } // Changed from '1h' to '1m'
);

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.user_id,
                name: user.name,
                role: user.role_name // Passing role name to frontend
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
// 2. "Me" Controller (Get Logged User Details)
// 2. "Me" Controller (Get Logged User Details)
// 2. "Me" Controller (Get Logged User Details)
const me = async (req, res) => {
    try {
        // req.user comes from the auth middleware
        const userId = req.user.user_id;

        // 1. Fetch base user and role details (added login_id based on your schema alter)
        const userQuery = `
            SELECT 
                u.user_id, u.login_id, u.name, u.email, u.mobile, u.created_at, 
                r.role_name 
            FROM users u
            JOIN roles r ON u.role_id = r.role_id
            WHERE u.user_id = $1
        `;

        const userResult = await db.query(userQuery, [userId]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        let userData = userResult.rows[0];

        // 2. If the user is an 'admin' or 'staff', fetch their full profile and transaction data
        if (userData.role_name === 'admin' || userData.role_name === 'staff') {
            
            // Fetch Staff Profile
            const profileQuery = `
                SELECT * FROM staff_profiles 
                WHERE user_id = $1
            `;
            const profileResult = await db.query(profileQuery, [userId]);

            if (profileResult.rows.length > 0) {
                userData.staff_profile = profileResult.rows[0];
                const staffId = userData.staff_profile.staff_id;

                // Fetch Staff Transactions associated with this profile (LATEST 10 ONLY)
                const transactionQuery = `
                    SELECT * FROM staff_transactions 
                    WHERE staff_id = $1 
                    ORDER BY transaction_date DESC, created_at DESC
                    LIMIT 10
                `;
                const transactionResult = await db.query(transactionQuery, [staffId]);
                
                userData.transactions = transactionResult.rows;
            } else {
                // Failsafe in case a staff/admin doesn't have a profile record yet
                userData.staff_profile = null;
                userData.transactions = [];
            }
        }

        // Return the final aggregated object
        res.json(userData);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = {
    login,
    me
};
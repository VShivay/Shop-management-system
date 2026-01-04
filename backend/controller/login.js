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
const login = async (req, res) => {
    try {
        // Validate Input
        const { error } = loginSchema.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const { email, password } = req.body;

        // Check if user exists
        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        const user = result.rows[0];

        // Check active status
        if (!user.is_active) {
            return res.status(403).json({ error: 'Account is inactive. Please contact support.' });
        }

        // Compare Password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        // Generate JWT (Session time: 1 hour)
        const token = jwt.sign(
            { 
                user_id: user.user_id, 
                role_id: user.role_id,
                email: user.email 
            },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.user_id,
                name: user.name,
                role_id: user.role_id
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// 2. "Me" Controller (Get Logged User Details)
const me = async (req, res) => {
    try {
        // req.user comes from the auth middleware
        const userId = req.user.user_id;

        // Join with roles table to get role name
        const query = `
            SELECT 
                u.user_id, u.name, u.email, u.mobile, u.created_at, 
                r.role_name 
            FROM users u
            JOIN roles r ON u.role_id = r.role_id
            WHERE u.user_id = $1
        `;

        const result = await db.query(query, [userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(result.rows[0]);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = {
    login,
    me
};
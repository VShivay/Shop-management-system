// index.js
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
require('dotenv').config();

const loginRoutes = require('./route/login_route');

const app = express();

// Global Middleware
app.use(helmet()); // Security headers
app.use(cors());   // Cross-Origin Resource Sharing
app.use(express.json()); // Parse JSON bodies

// Routes
app.use('/api', loginRoutes);

// Global Error Handler (Optional but recommended)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
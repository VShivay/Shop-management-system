// middleware/auth.js
const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
    // ... your existing token verification logic ...
    try {
        const authHeader = req.header('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Access denied.' });
        }
        const token = authHeader.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; 
        next();
    } catch (error) {
        res.status(400).json({ error: 'Invalid token.' });
    }
};

// Instead of module.exports = { auth, authorize }
// Attach authorize directly to the auth function object
// middleware/auth.js

auth.authorize = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role_name) {
            return res.status(403).json({ error: 'Role not found in token.' });
        }

        // Convert the role from the token to lowercase
        const userRole = req.user.role_name.toLowerCase();
        
        // Convert the list of allowed roles to lowercase and check for a match
        const isAllowed = allowedRoles
            .map(role => role.toLowerCase())
            .includes(userRole);

        if (!isAllowed) {
            return res.status(403).json({ 
                error: `Access Denied: Your role (${userRole}) is not authorized.` 
            });
        }

        next();
    };
};
module.exports = auth; // Export the function directly
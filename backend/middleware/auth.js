const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
    try {
        const authHeader = req.header('Authorization');

        // 1. Check if header exists and has correct format
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // Status 400: Bad Request (Client sent wrong syntax/missing header)
            // The frontend will show "Bad Request" but WON'T log out (correct behavior for bug/syntax error)
            return res.status(400).json({ error: 'Access denied. No token provided or invalid format.' });
        }

        const token = authHeader.replace('Bearer ', '');
        
        // 2. Verify Token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; 
        next();

    } catch (error) {
        // Status 401: Unauthorized
        // This handles 'TokenExpiredError' and 'JsonWebTokenError'
        // CRITICAL: This triggers the ApiClient 401 interceptor -> Auto Logout
        res.status(401).json({ error: 'Invalid or expired token.' });
    }
};

// ... keep your authorize function same as before ...
auth.authorize = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role_name) {
            return res.status(401).json({ error: 'User not authenticated.' });
        }

        const userRole = req.user.role_name.toLowerCase();
        const isAllowed = allowedRoles.map(role => role.toLowerCase()).includes(userRole);

        if (!isAllowed) {
            // Status 403: Forbidden (Authenticated but not allowed)
            return res.status(403).json({ 
                error: `Access Denied: Your role (${userRole}) is not authorized.` 
            });
        }

        next();
    };
};

module.exports = auth;
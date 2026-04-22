const cors = require('cors');

function parseAllowedOrigins() {
    const raw = process.env.CORS_ORIGIN || '';
    return raw.split(',').map((v) => v.trim()).filter(Boolean);
}

function corsMiddleware() {
    const origins = parseAllowedOrigins();
    if (origins.length === 0) {
        return cors({ origin: false });
    }
    return cors({
        origin(origin, callback) {
            // Allow non-browser and same-origin requests.
            if (!origin) return callback(null, true);
            if (origins.includes(origin)) return callback(null, true);
            return callback(new Error('CORS policy blocked this origin'));
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Business-Id', 'X-Request-Id']
    });
}

function securityHeaders(req, res, next) {
    const csp = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'"
    ].join('; ');

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', csp);

    if (req.requestId) {
        res.setHeader('X-Request-Id', req.requestId);
    }
    next();
}

module.exports = {
    corsMiddleware,
    securityHeaders
};
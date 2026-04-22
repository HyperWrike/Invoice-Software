const { randomUUID } = require('crypto');

function baseLog(level, message, meta = {}) {
    const payload = {
        ts: new Date().toISOString(),
        level,
        message,
        ...meta
    };
    const output = JSON.stringify(payload);
    if (level === 'error') {
        console.error(output);
        return;
    }
    if (level === 'warn') {
        console.warn(output);
        return;
    }
    console.log(output);
}

function sanitizeError(err) {
    if (!err) return null;
    return {
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
        code: err.code,
        status: err.status
    };
}

function requestContext(req, _res, next) {
    req.requestId = req.headers['x-request-id'] || randomUUID();
    next();
}

function reqMeta(req, extra = {}) {
    return {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        userId: req.user ? req.user.id : null,
        businessId: req.business ? req.business.id : null,
        ...extra
    };
}

module.exports = {
    baseLog,
    requestContext,
    reqMeta,
    sanitizeError
};
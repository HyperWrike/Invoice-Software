/**
 * Invoice Software - Express server entry point.
 */
require('dotenv').config();
const path = require('path');
const express = require('express');

const { router: authRouter } = require('./src/auth');
const { initPromise } = require('./src/db');
const { requestContext, baseLog, reqMeta, sanitizeError } = require('./src/logger');
const { corsMiddleware, securityHeaders } = require('./src/middleware/security');
const businesses = require('./src/routes/businesses');
const customers = require('./src/routes/customers');
const items = require('./src/routes/items');
const invoices = require('./src/routes/invoices');
const reports = require('./src/routes/reports');
const adminBilling = require('./src/routes/adminBilling');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(requestContext);
app.use(corsMiddleware());
app.use(securityHeaders);
app.use(express.json({ limit: '2mb' }));

app.use((req, _res, next) => {
    baseLog('info', 'Incoming request', reqMeta(req));
    next();
});

// ---- API ----
app.use('/api/auth', authRouter);
app.use('/api/businesses', businesses);
app.use('/api/customers', customers);
app.use('/api/items', items);
app.use('/api/invoices', invoices);
app.use('/api/reports', reports);
app.use('/api/admin/billing', adminBilling);

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ---- Static frontend ----
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---- Errors ----
app.use((err, req, res, _next) => {
    const status = Number(err.status) || 500;
    const isServerError = status >= 500;
    baseLog(isServerError ? 'error' : 'warn', 'Request failed', reqMeta(req, {
        status,
        error: sanitizeError(err)
    }));
    res.status(status).json({
        error: isServerError ? 'Unexpected server error. Please try again.' : (err.message || 'Request failed'),
        requestId: req.requestId
    });
});

if (require.main === module) {
    initPromise
        .then(() => {
            app.listen(PORT, () => {
                baseLog('info', 'Invoice Software server started', {
                    port: PORT,
                    nodeEnv: process.env.NODE_ENV || 'development'
                });
            });
        })
        .catch((err) => {
            baseLog('error', 'Failed to initialize database', { error: sanitizeError(err) });
            process.exit(1);
        });
}

module.exports = app;
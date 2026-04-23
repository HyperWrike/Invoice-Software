/**
 * Business management routes (async / Postgres).
 */
const express = require('express');
const { db, logAudit } = require('../db');
const { authRequired } = require('../auth');

const router = express.Router();
router.use(authRequired);

// GET /api/businesses - all businesses owned by user
router.get('/', async (req, res, next) => {
    try {
        const rows = await db.prepare(
            'SELECT * FROM businesses WHERE user_id = ? ORDER BY id'
        ).all(req.user.id);
        res.json(rows);
    } catch (err) { next(err); }
});

// GET /api/businesses/current
router.get('/current', (req, res) => {
    res.json(req.business);
});

// PUT /api/businesses/:id
router.put('/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const biz = await db.prepare(
            'SELECT * FROM businesses WHERE id = ? AND user_id = ?'
        ).get(id, req.user.id);
        if (!biz) return res.status(404).json({ error: 'Business not found' });

        const {
            name, gstin, address, phone, email, state,
            invoice_prefix, next_invoice_number, currency, currency_symbol
        } = req.body || {};

        await db.prepare(`
            UPDATE businesses SET
                name = COALESCE(?, name),
                gstin = ?,
                address = ?,
                phone = ?,
                email = ?,
                state = ?,
                invoice_prefix = COALESCE(?, invoice_prefix),
                next_invoice_number = COALESCE(?, next_invoice_number),
                currency = COALESCE(?, currency),
                currency_symbol = COALESCE(?, currency_symbol)
            WHERE id = ?
        `).run(
            name, gstin || null, address || null, phone || null, email || null, state || null,
            invoice_prefix, next_invoice_number, currency, currency_symbol, id
        );

        await logAudit({
            businessId: id, userId: req.user.id,
            entityType: 'business', entityId: id, action: 'update',
            details: req.body
        });

        const row = await db.prepare('SELECT * FROM businesses WHERE id = ?').get(id);
        res.json(row);
    } catch (err) { next(err); }
});

// POST /api/businesses
router.post('/', async (req, res, next) => {
    try {
        const { name, gstin, address, phone, email, state, invoice_prefix } = req.body || {};
        if (!name) return res.status(400).json({ error: 'name is required' });
        const r = await db.prepare(`
            INSERT INTO businesses (user_id, name, gstin, address, phone, email, state, invoice_prefix)
            VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, 'INV'))
        `).run(req.user.id, name, gstin || null, address || null, phone || null, email || null, state || null, invoice_prefix);
        await logAudit({
            businessId: r.lastInsertRowid, userId: req.user.id,
            entityType: 'business', entityId: r.lastInsertRowid, action: 'create'
        });
        const row = await db.prepare('SELECT * FROM businesses WHERE id = ?').get(r.lastInsertRowid);
        res.json(row);
    } catch (err) { next(err); }
});

module.exports = router;

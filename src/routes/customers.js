/**
 * Customer management routes (async / Postgres).
 */
const express = require('express');
const { db, logAudit } = require('../db');
const { authRequired } = require('../auth');

const router = express.Router();
router.use(authRequired);

// GET /api/customers - list with optional search
router.get('/', async (req, res, next) => {
    try {
        const q = (req.query.q || '').trim();
        if (q) {
            const like = `%${q}%`;
            const rows = await db.prepare(`
                SELECT * FROM customers
                WHERE business_id = ?
                  AND (name LIKE ? OR email LIKE ? OR phone LIKE ? OR gstin LIKE ?)
                ORDER BY name
            `).all(req.business.id, like, like, like, like);
            return res.json(rows);
        }
        const rows = await db.prepare(
            'SELECT * FROM customers WHERE business_id = ? ORDER BY name'
        ).all(req.business.id);
        res.json(rows);
    } catch (err) { next(err); }
});

// GET /api/customers/:id
router.get('/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const row = await db.prepare(
            'SELECT * FROM customers WHERE id = ? AND business_id = ?'
        ).get(id, req.business.id);
        if (!row) return res.status(404).json({ error: 'Customer not found' });
        res.json(row);
    } catch (err) { next(err); }
});

// POST /api/customers
router.post('/', async (req, res, next) => {
    try {
        const { name, email, phone, gstin, address, state } = req.body || {};
        if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
        const r = await db.prepare(`
            INSERT INTO customers (business_id, name, email, phone, gstin, address, state)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(req.business.id, name.trim(), email || null, phone || null, gstin || null, address || null, state || null);
        await logAudit({
            businessId: req.business.id, userId: req.user.id,
            entityType: 'customer', entityId: r.lastInsertRowid, action: 'create',
            details: { name }
        });
        const row = await db.prepare('SELECT * FROM customers WHERE id = ?').get(r.lastInsertRowid);
        res.json(row);
    } catch (err) { next(err); }
});

// PUT /api/customers/:id
router.put('/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const existing = await db.prepare(
            'SELECT * FROM customers WHERE id = ? AND business_id = ?'
        ).get(id, req.business.id);
        if (!existing) return res.status(404).json({ error: 'Customer not found' });
        const { name, email, phone, gstin, address, state } = req.body || {};
        await db.prepare(`
            UPDATE customers SET
                name = COALESCE(?, name),
                email = ?, phone = ?, gstin = ?, address = ?, state = ?
            WHERE id = ?
        `).run(name || null, email || null, phone || null, gstin || null, address || null, state || null, id);
        await logAudit({
            businessId: req.business.id, userId: req.user.id,
            entityType: 'customer', entityId: id, action: 'update',
            details: req.body
        });
        const row = await db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
        res.json(row);
    } catch (err) { next(err); }
});

// DELETE /api/customers/:id
router.delete('/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const existing = await db.prepare(
            'SELECT * FROM customers WHERE id = ? AND business_id = ?'
        ).get(id, req.business.id);
        if (!existing) return res.status(404).json({ error: 'Customer not found' });
        const inUseRow = await db.prepare('SELECT COUNT(*) AS c FROM invoices WHERE customer_id = ?').get(id);
        if (Number(inUseRow.c) > 0) {
            return res.status(409).json({ error: 'Cannot delete customer with existing invoices' });
        }
        await db.prepare('DELETE FROM customers WHERE id = ?').run(id);
        await logAudit({
            businessId: req.business.id, userId: req.user.id,
            entityType: 'customer', entityId: id, action: 'delete'
        });
        res.json({ ok: true });
    } catch (err) { next(err); }
});

module.exports = router;

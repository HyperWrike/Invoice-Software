/**
 * Customer management routes.
 */
const express = require('express');
const { db, logAudit } = require('../db');
const { authRequired } = require('../auth');

const router = express.Router();
router.use(authRequired);

// GET /api/customers - list with optional search
router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  if (q) {
    const like = `%${q}%`;
    const rows = db.prepare(`
      SELECT * FROM customers
      WHERE business_id = ?
        AND (name LIKE ? OR email LIKE ? OR phone LIKE ? OR gstin LIKE ?)
      ORDER BY name
    `).all(req.business.id, like, like, like, like);
    return res.json(rows);
  }
  const rows = db.prepare('SELECT * FROM customers WHERE business_id = ? ORDER BY name').all(req.business.id);
  res.json(rows);
});

// GET /api/customers/:id
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = db.prepare('SELECT * FROM customers WHERE id = ? AND business_id = ?').get(id, req.business.id);
  if (!row) return res.status(404).json({ error: 'Customer not found' });
  res.json(row);
});

// POST /api/customers
router.post('/', (req, res) => {
  const { name, email, phone, gstin, address, state } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  const r = db.prepare(`
    INSERT INTO customers (business_id, name, email, phone, gstin, address, state)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.business.id, name.trim(), email || null, phone || null, gstin || null, address || null, state || null);
  logAudit({
    businessId: req.business.id, userId: req.user.id,
    entityType: 'customer', entityId: r.lastInsertRowid, action: 'create',
    details: { name }
  });
  res.json(db.prepare('SELECT * FROM customers WHERE id = ?').get(r.lastInsertRowid));
});

// PUT /api/customers/:id
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM customers WHERE id = ? AND business_id = ?').get(id, req.business.id);
  if (!existing) return res.status(404).json({ error: 'Customer not found' });
  const { name, email, phone, gstin, address, state } = req.body || {};
  db.prepare(`
    UPDATE customers SET
      name = COALESCE(?, name),
      email = ?, phone = ?, gstin = ?, address = ?, state = ?
    WHERE id = ?
  `).run(name || null, email || null, phone || null, gstin || null, address || null, state || null, id);
  logAudit({
    businessId: req.business.id, userId: req.user.id,
    entityType: 'customer', entityId: id, action: 'update',
    details: req.body
  });
  res.json(db.prepare('SELECT * FROM customers WHERE id = ?').get(id));
});

// DELETE /api/customers/:id
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM customers WHERE id = ? AND business_id = ?').get(id, req.business.id);
  if (!existing) return res.status(404).json({ error: 'Customer not found' });
  const inUse = db.prepare('SELECT COUNT(*) AS c FROM invoices WHERE customer_id = ?').get(id).c;
  if (inUse > 0) return res.status(409).json({ error: 'Cannot delete customer with existing invoices' });
  db.prepare('DELETE FROM customers WHERE id = ?').run(id);
  logAudit({
    businessId: req.business.id, userId: req.user.id,
    entityType: 'customer', entityId: id, action: 'delete'
  });
  res.json({ ok: true });
});

module.exports = router;

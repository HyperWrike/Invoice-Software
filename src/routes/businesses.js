/**
 * Business management routes.
 */
const express = require('express');
const { db, logAudit } = require('../db');
const { authRequired } = require('../auth');

const router = express.Router();
router.use(authRequired);

// GET /api/businesses - all businesses owned by user
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM businesses WHERE user_id = ? ORDER BY id').all(req.user.id);
  res.json(rows);
});

// GET /api/businesses/current - current active business
router.get('/current', (req, res) => {
  res.json(req.business);
});

// PUT /api/businesses/:id - update business profile
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const biz = db.prepare('SELECT * FROM businesses WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!biz) return res.status(404).json({ error: 'Business not found' });

  const {
    name, gstin, address, phone, email, state,
    invoice_prefix, next_invoice_number, currency, currency_symbol
  } = req.body || {};

  db.prepare(`
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

  logAudit({
    businessId: id, userId: req.user.id,
    entityType: 'business', entityId: id, action: 'update',
    details: req.body
  });

  res.json(db.prepare('SELECT * FROM businesses WHERE id = ?').get(id));
});

// POST /api/businesses - create additional business
router.post('/', (req, res) => {
  const { name, gstin, address, phone, email, state, invoice_prefix } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const r = db.prepare(`
    INSERT INTO businesses (user_id, name, gstin, address, phone, email, state, invoice_prefix)
    VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, 'INV'))
  `).run(req.user.id, name, gstin || null, address || null, phone || null, email || null, state || null, invoice_prefix);
  logAudit({
    businessId: r.lastInsertRowid, userId: req.user.id,
    entityType: 'business', entityId: r.lastInsertRowid, action: 'create'
  });
  res.json(db.prepare('SELECT * FROM businesses WHERE id = ?').get(r.lastInsertRowid));
});

module.exports = router;

/**
 * Item/product management routes.
 */
const express = require('express');
const { db, logAudit } = require('../db');
const { authRequired } = require('../auth');

const router = express.Router();
router.use(authRequired);

function validateItem(body) {
  const errs = [];
  if (!body.name || !String(body.name).trim()) errs.push('name is required');
  const price = parseFloat(body.unit_price);
  if (isNaN(price) || price < 0) errs.push('unit_price must be a non-negative number');
  const gst = parseFloat(body.gst_rate);
  if (isNaN(gst) || gst < 0 || gst > 100) errs.push('gst_rate must be between 0 and 100');
  return errs;
}

// GET /api/items
router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  if (q) {
    const like = `%${q}%`;
    const rows = db.prepare(`
      SELECT * FROM items
      WHERE business_id = ? AND (name LIKE ? OR description LIKE ? OR hsn_code LIKE ?)
      ORDER BY name
    `).all(req.business.id, like, like, like);
    return res.json(rows);
  }
  res.json(db.prepare('SELECT * FROM items WHERE business_id = ? ORDER BY name').all(req.business.id));
});

// POST /api/items
router.post('/', (req, res) => {
  const errs = validateItem(req.body || {});
  if (errs.length) return res.status(400).json({ error: errs.join(', ') });
  const { name, description, unit_price, gst_rate, hsn_code, unit } = req.body;
  const r = db.prepare(`
    INSERT INTO items (business_id, name, description, unit_price, gst_rate, hsn_code, unit)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.business.id, name.trim(), description || null,
         parseFloat(unit_price), parseFloat(gst_rate),
         hsn_code || null, unit || 'pcs');
  logAudit({
    businessId: req.business.id, userId: req.user.id,
    entityType: 'item', entityId: r.lastInsertRowid, action: 'create', details: { name }
  });
  res.json(db.prepare('SELECT * FROM items WHERE id = ?').get(r.lastInsertRowid));
});

// PUT /api/items/:id
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM items WHERE id = ? AND business_id = ?').get(id, req.business.id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  const errs = validateItem({ ...existing, ...req.body });
  if (errs.length) return res.status(400).json({ error: errs.join(', ') });
  const { name, description, unit_price, gst_rate, hsn_code, unit } = req.body;
  db.prepare(`
    UPDATE items SET
      name = COALESCE(?, name),
      description = ?,
      unit_price = COALESCE(?, unit_price),
      gst_rate = COALESCE(?, gst_rate),
      hsn_code = ?,
      unit = COALESCE(?, unit)
    WHERE id = ?
  `).run(
    name || null, description || null,
    unit_price != null ? parseFloat(unit_price) : null,
    gst_rate != null ? parseFloat(gst_rate) : null,
    hsn_code || null, unit || null, id
  );
  logAudit({
    businessId: req.business.id, userId: req.user.id,
    entityType: 'item', entityId: id, action: 'update', details: req.body
  });
  res.json(db.prepare('SELECT * FROM items WHERE id = ?').get(id));
});

// DELETE /api/items/:id
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM items WHERE id = ? AND business_id = ?').get(id, req.business.id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  db.prepare('DELETE FROM items WHERE id = ?').run(id);
  logAudit({
    businessId: req.business.id, userId: req.user.id,
    entityType: 'item', entityId: id, action: 'delete'
  });
  res.json({ ok: true });
});

module.exports = router;

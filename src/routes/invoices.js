/**
 * Invoice routes: create, read, update, delete, list/search,
 * PDF export, and GST-compliant totals computation.
 */
const express = require('express');
const { db, logAudit } = require('../db');
const { authRequired } = require('../auth');
const { buildInvoicePdf } = require('../pdf');

const router = express.Router();
router.use(authRequired);

/**
 * Compute invoice totals with GST breakdown.
 * - Each line: amount = qty * unit_price
 *              gst_amount = amount * gst_rate / 100
 *              line_total = amount + gst_amount
 * - Interstate (different state from business) => IGST full
 *   Intrastate => CGST + SGST split equally
 */
function computeTotals(lines, { isInterstate, discount = 0 }) {
    let subtotal = 0,
        gstTotal = 0,
        cgst = 0,
        sgst = 0,
        igst = 0;
    const normalizedLines = lines.map((l) => {
        const quantity = parseFloat(l.quantity);
        const unit_price = parseFloat(l.unit_price);
        const gst_rate = parseFloat(l.gst_rate);
        if (!(quantity > 0)) throw new Error('Line quantity must be > 0');
        if (unit_price < 0) throw new Error('Line unit_price must be >= 0');
        if (gst_rate < 0 || gst_rate > 100) throw new Error('Line gst_rate must be 0-100');
        const amount = +(quantity * unit_price).toFixed(2);
        const gst_amount = +(amount * gst_rate / 100).toFixed(2);
        const total = +(amount + gst_amount).toFixed(2);
        subtotal += amount;
        gstTotal += gst_amount;
        if (isInterstate) {
            igst += gst_amount;
        } else {
            cgst += gst_amount / 2;
            sgst += gst_amount / 2;
        }
        return {
            description: l.description,
            hsn_code: l.hsn_code || null,
            item_id: l.item_id || null,
            quantity,
            unit_price,
            gst_rate,
            amount,
            gst_amount,
            total
        };
    });
    const disc = Math.max(0, parseFloat(discount) || 0);
    subtotal = +subtotal.toFixed(2);
    gstTotal = +gstTotal.toFixed(2);
    cgst = +cgst.toFixed(2);
    sgst = +sgst.toFixed(2);
    igst = +igst.toFixed(2);
    const grand = +(subtotal + gstTotal - disc).toFixed(2);
    return {
        lines: normalizedLines,
        subtotal,
        gst_total: gstTotal,
        cgst_total: cgst,
        sgst_total: sgst,
        igst_total: igst,
        discount: disc,
        total: grand
    };
}

/**
 * Generate next invoice number for this business and reserve it.
 * Format: <prefix>-<YYYY>-<seq padded 4>
 */
function nextInvoiceNumber(businessId) {
    const biz = db.prepare('SELECT invoice_prefix, next_invoice_number FROM businesses WHERE id = ?').get(businessId);
    const seq = biz.next_invoice_number;
    const year = new Date().getFullYear();
    const num = `${biz.invoice_prefix || 'INV'}-${year}-${String(seq).padStart(4, '0')}`;
    db.prepare('UPDATE businesses SET next_invoice_number = next_invoice_number + 1 WHERE id = ?').run(businessId);
    return num;
}

// Attach a full invoice (with items and customer) by id (scoped to business)
function loadInvoice(id, businessId) {
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ? AND business_id = ?').get(id, businessId);
    if (!inv) return null;
    inv.items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id').all(id);
    inv.customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(inv.customer_id);
    return inv;
}

// GET /api/invoices - list with filters
router.get('/', (req, res) => {
    const { q, status, customer_id, from, to, sort = 'issue_date', order = 'desc' } = req.query;
    const clauses = ['i.business_id = ?'];
    const params = [req.business.id];
    if (status) {
        clauses.push('i.status = ?');
        params.push(status);
    }
    if (customer_id) {
        clauses.push('i.customer_id = ?');
        params.push(parseInt(customer_id, 10));
    }
    if (from) {
        clauses.push('date(i.issue_date) >= date(?)');
        params.push(from);
    }
    if (to) {
        clauses.push('date(i.issue_date) <= date(?)');
        params.push(to);
    }
    if (q) {
        clauses.push('(i.invoice_number LIKE ? OR c.name LIKE ? OR i.notes LIKE ?)');
        const like = `%${q}%`;
        params.push(like, like, like);
    }
    const allowedSort = ['issue_date', 'invoice_number', 'total', 'status', 'created_at'];
    const s = allowedSort.includes(sort) ? sort : 'issue_date';
    const o = order === 'asc' ? 'ASC' : 'DESC';

    const rows = db.prepare(`
    SELECT i.*, c.name AS customer_name, c.email AS customer_email
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY i.${s} ${o}
  `).all(...params);
    res.json(rows);
});

// GET /api/invoices/:id
router.get('/:id', (req, res) => {
    const inv = loadInvoice(parseInt(req.params.id, 10), req.business.id);
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    res.json(inv);
});

// POST /api/invoices - create
router.post('/', (req, res) => {
    try {
        const {
            customer_id,
            issue_date,
            due_date,
            items,
            notes,
            is_interstate = 0,
            discount = 0,
            status = 'draft',
            invoice_number
        } = req.body || {};
        if (!customer_id) return res.status(400).json({ error: 'customer_id is required' });
        if (!issue_date) return res.status(400).json({ error: 'issue_date is required' });
        if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'At least one line item is required' });

        const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND business_id = ?').get(customer_id, req.business.id);
        if (!customer) return res.status(400).json({ error: 'Invalid customer_id' });

        const totals = computeTotals(items, { isInterstate: !!is_interstate, discount });
        const invNumber = invoice_number && invoice_number.trim() ?
            invoice_number.trim() :
            nextInvoiceNumber(req.business.id);

        const txn = db.transaction(() => {
            const r = db.prepare(`
        INSERT INTO invoices (
          business_id, customer_id, invoice_number, issue_date, due_date,
          status, notes, is_interstate, subtotal, discount,
          cgst_total, sgst_total, igst_total, gst_total, total
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
                req.business.id, customer_id, invNumber, issue_date, due_date || null,
                status, notes || null, is_interstate ? 1 : 0,
                totals.subtotal, totals.discount,
                totals.cgst_total, totals.sgst_total, totals.igst_total,
                totals.gst_total, totals.total
            );
            const invId = r.lastInsertRowid;
            const insLine = db.prepare(`
        INSERT INTO invoice_items
          (invoice_id, item_id, description, hsn_code, quantity, unit_price, gst_rate, amount, gst_amount, total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
            for (const l of totals.lines) {
                insLine.run(invId, l.item_id, l.description, l.hsn_code,
                    l.quantity, l.unit_price, l.gst_rate, l.amount, l.gst_amount, l.total);
            }
            return invId;
        });
        const invId = txn();

        logAudit({
            businessId: req.business.id,
            userId: req.user.id,
            entityType: 'invoice',
            entityId: invId,
            action: 'create',
            details: { invoice_number: invNumber, total: totals.total }
        });
        res.json(loadInvoice(invId, req.business.id));
    } catch (e) {
        if (String(e.message).includes('UNIQUE')) {
            return res.status(409).json({ error: 'Invoice number already exists' });
        }
        res.status(400).json({ error: e.message });
    }
});

// PUT /api/invoices/:id
router.put('/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const existing = db.prepare('SELECT * FROM invoices WHERE id = ? AND business_id = ?').get(id, req.business.id);
        if (!existing) return res.status(404).json({ error: 'Invoice not found' });

        const {
            customer_id,
            issue_date,
            due_date,
            items,
            notes,
            is_interstate,
            discount,
            status,
            payment_method,
            payment_date,
            invoice_number
        } = req.body || {};

        let totals = null;
        if (Array.isArray(items) && items.length > 0) {
            totals = computeTotals(items, {
                isInterstate: is_interstate != null ? !!is_interstate : !!existing.is_interstate,
                discount: discount != null ? discount : existing.discount
            });
        }

        const txn = db.transaction(() => {
            db.prepare(`
        UPDATE invoices SET
          customer_id = COALESCE(?, customer_id),
          invoice_number = COALESCE(?, invoice_number),
          issue_date = COALESCE(?, issue_date),
          due_date = ?,
          notes = ?,
          is_interstate = COALESCE(?, is_interstate),
          discount = COALESCE(?, discount),
          status = COALESCE(?, status),
          payment_method = ?,
          payment_date = ?,
          subtotal = COALESCE(?, subtotal),
          cgst_total = COALESCE(?, cgst_total),
          sgst_total = COALESCE(?, sgst_total),
          igst_total = COALESCE(?, igst_total),
          gst_total = COALESCE(?, gst_total),
          total = COALESCE(?, total),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
                customer_id || null,
                invoice_number || null,
                issue_date || null,
                due_date != null ? due_date : existing.due_date,
                notes != null ? notes : existing.notes,
                is_interstate != null ? (is_interstate ? 1 : 0) : null,
                discount != null ? discount : null,
                status || null,
                payment_method != null ? payment_method : existing.payment_method,
                payment_date != null ? payment_date : existing.payment_date,
                totals ? totals.subtotal : null,
                totals ? totals.cgst_total : null,
                totals ? totals.sgst_total : null,
                totals ? totals.igst_total : null,
                totals ? totals.gst_total : null,
                totals ? totals.total : null,
                id
            );
            if (totals) {
                db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(id);
                const insLine = db.prepare(`
          INSERT INTO invoice_items
            (invoice_id, item_id, description, hsn_code, quantity, unit_price, gst_rate, amount, gst_amount, total)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
                for (const l of totals.lines) {
                    insLine.run(id, l.item_id, l.description, l.hsn_code,
                        l.quantity, l.unit_price, l.gst_rate, l.amount, l.gst_amount, l.total);
                }
            }
        });
        txn();
        logAudit({
            businessId: req.business.id,
            userId: req.user.id,
            entityType: 'invoice',
            entityId: id,
            action: 'update',
            details: req.body
        });
        res.json(loadInvoice(id, req.business.id));
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// POST /api/invoices/:id/mark-paid
router.post('/:id/mark-paid', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = db.prepare('SELECT * FROM invoices WHERE id = ? AND business_id = ?').get(id, req.business.id);
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });
    const { payment_method, payment_date } = req.body || {};
    db.prepare(`
    UPDATE invoices SET
      status = 'paid',
      payment_method = COALESCE(?, payment_method),
      payment_date = COALESCE(?, date('now')),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(payment_method || null, payment_date || null, id);
    logAudit({
        businessId: req.business.id,
        userId: req.user.id,
        entityType: 'invoice',
        entityId: id,
        action: 'mark-paid',
        details: { payment_method, payment_date }
    });
    res.json(loadInvoice(id, req.business.id));
});

// DELETE /api/invoices/:id
router.delete('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = db.prepare('SELECT * FROM invoices WHERE id = ? AND business_id = ?').get(id, req.business.id);
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });
    db.prepare('DELETE FROM invoices WHERE id = ?').run(id);
    logAudit({
        businessId: req.business.id,
        userId: req.user.id,
        entityType: 'invoice',
        entityId: id,
        action: 'delete',
        details: { invoice_number: existing.invoice_number }
    });
    res.json({ ok: true });
});

// GET /api/invoices/:id/pdf
router.get('/:id/pdf', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const inv = loadInvoice(id, req.business.id);
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${inv.invoice_number}.pdf"`);
    buildInvoicePdf(res, { invoice: inv, business: req.business });
});

module.exports = router;
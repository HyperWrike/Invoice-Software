/**
 * Admin billing routes (async / Postgres).
 */
const express = require('express');
const { db, logAudit } = require('../db');
const { authRequired, adminRequired } = require('../auth');

const router = express.Router();
router.use(authRequired, adminRequired);

async function loadInvoice(invoiceId, businessId) {
    const invoice = await db.prepare(
        'SELECT * FROM invoices WHERE id = ? AND business_id = ?'
    ).get(invoiceId, businessId);
    if (!invoice) return null;
    const items = await db.prepare(
        'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id'
    ).all(invoiceId);
    const customer = await db.prepare(
        'SELECT * FROM customers WHERE id = ? AND business_id = ?'
    ).get(invoice.customer_id, businessId);
    return { invoice, items, customer };
}

router.get('/config-status', (_req, res) => {
    res.json({
        billingMode: 'internal',
        externalIntegrationsEnabled: false
    });
});

router.get('/customers', async (req, res, next) => {
    try {
        const q = (req.query.q || '').trim();
        const params = [req.business.id];
        let where = 'c.business_id = ?';
        if (q) {
            where += ' AND (c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? OR c.gstin LIKE ?)';
            const like = `%${q}%`;
            params.push(like, like, like, like);
        }

        const rows = await db.prepare(`
            SELECT
                c.id, c.name, c.email, c.phone, c.gstin, c.address, c.state,
                COUNT(i.id) AS invoice_count,
                COALESCE(SUM(CASE WHEN i.status IN ('draft','sent','overdue') THEN i.total ELSE 0 END), 0) AS outstanding_total,
                COALESCE(SUM(i.total), 0) AS lifetime_total
            FROM customers c
            LEFT JOIN invoices i ON i.customer_id = c.id
            WHERE ${where}
            GROUP BY c.id
            ORDER BY c.name
        `).all(...params);

        res.json(rows);
    } catch (err) { next(err); }
});

router.get('/invoices', async (req, res, next) => {
    try {
        const rows = await db.prepare(`
            SELECT i.id, i.invoice_number, i.issue_date, i.due_date, i.status, i.total,
                   i.payment_method, i.payment_date, i.notes,
                   c.name AS customer_name, c.email AS customer_email
            FROM invoices i
            JOIN customers c ON c.id = i.customer_id
            WHERE i.business_id = ?
            ORDER BY i.created_at DESC
            LIMIT 200
        `).all(req.business.id);
        res.json(rows);
    } catch (err) { next(err); }
});

router.post('/invoices/:id/send', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const invoice = await db.prepare(
            'SELECT * FROM invoices WHERE id = ? AND business_id = ?'
        ).get(id, req.business.id);
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

        await db.prepare(`
            UPDATE invoices
            SET status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END,
                updated_at = NOW()
            WHERE id = ?
        `).run(id);

        await logAudit({
            businessId: req.business.id,
            userId: req.user.id,
            entityType: 'invoice',
            entityId: id,
            action: 'mark-sent',
            details: { invoice_number: invoice.invoice_number }
        });

        const result = await loadInvoice(id, req.business.id);
        res.json(result);
    } catch (err) { next(err); }
});

router.post('/invoices/:id/record-payment', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const invoice = await db.prepare(
            'SELECT * FROM invoices WHERE id = ? AND business_id = ?'
        ).get(id, req.business.id);
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

        const { payment_method, payment_date } = req.body || {};
        await db.prepare(`
            UPDATE invoices SET
                status = 'paid',
                payment_method = COALESCE(?, payment_method),
                payment_date = COALESCE(?, CURRENT_DATE),
                updated_at = NOW()
            WHERE id = ?
        `).run(payment_method || null, payment_date || null, id);

        await logAudit({
            businessId: req.business.id,
            userId: req.user.id,
            entityType: 'invoice',
            entityId: id,
            action: 'record-payment',
            details: { payment_method, payment_date }
        });

        const result = await loadInvoice(id, req.business.id);
        res.json(result);
    } catch (err) { next(err); }
});

router.get('/invoices/:id/payments', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const invoice = await db.prepare(
            'SELECT * FROM invoices WHERE id = ? AND business_id = ?'
        ).get(id, req.business.id);
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

        const payments = [];
        if (invoice.status === 'paid') {
            payments.push({
                date: invoice.payment_date || invoice.updated_at,
                method: invoice.payment_method || 'Unknown',
                amount: invoice.total,
                source: 'local'
            });
        }
        res.json(payments);
    } catch (err) { next(err); }
});

router.get('/summary', async (req, res, next) => {
    try {
        const businessId = req.business.id;
        const row = async (sql) => (await db.prepare(sql).get(businessId)) || {};
        const all = async (sql) => (await db.prepare(sql).all(businessId)) || [];

        const totalCustomers = (await row('SELECT COUNT(*) AS c FROM customers WHERE business_id = ?')).c || 0;
        const totalInvoices = (await row('SELECT COUNT(*) AS c FROM invoices WHERE business_id = ?')).c || 0;
        const paidTotal = (await row(
            "SELECT COALESCE(SUM(total), 0) AS s FROM invoices WHERE business_id = ? AND status = 'paid'"
        )).s || 0;
        const outstandingTotal = (await row(
            "SELECT COALESCE(SUM(total), 0) AS s FROM invoices WHERE business_id = ? AND status IN ('draft','sent','overdue')"
        )).s || 0;
        const recentPayments = await all(`
            SELECT id, invoice_number, payment_method, payment_date, total
            FROM invoices
            WHERE business_id = ? AND status = 'paid'
            ORDER BY COALESCE(payment_date, updated_at) DESC
            LIMIT 8
        `);

        res.json({
            totalCustomers,
            totalInvoices,
            paidTotal,
            outstandingTotal,
            recentPayments
        });
    } catch (err) { next(err); }
});

module.exports = router;

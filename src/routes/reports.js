/**
 * Reports & summaries (async / Postgres).
 */
const express = require('express');
const { db } = require('../db');
const { authRequired } = require('../auth');

const router = express.Router();
router.use(authRequired);

// GET /api/reports/summary - dashboard KPIs
router.get('/summary', async (req, res, next) => {
    try {
        const bid = req.business.id;
        const pickRow = async (sql, ...params) => (await db.prepare(sql).get(bid, ...params)) || {};
        const pickAll = async (sql, ...params) => (await db.prepare(sql).all(bid, ...params)) || [];

        const totalInvoices = (await pickRow(
            'SELECT COUNT(*) AS c FROM invoices WHERE business_id = ?'
        )).c || 0;
        const totalRevenue = (await pickRow(
            `SELECT COALESCE(SUM(total),0) AS s FROM invoices WHERE business_id = ? AND status = 'paid'`
        )).s || 0;
        const outstanding = (await pickRow(
            `SELECT COALESCE(SUM(total),0) AS s FROM invoices WHERE business_id = ? AND status IN ('sent','overdue','draft')`
        )).s || 0;
        const gstCollected = (await pickRow(
            `SELECT COALESCE(SUM(gst_total),0) AS s FROM invoices WHERE business_id = ? AND status = 'paid'`
        )).s || 0;

        const byStatus = await pickAll(`
            SELECT status, COUNT(*) AS count, COALESCE(SUM(total),0) AS total
            FROM invoices WHERE business_id = ? GROUP BY status
        `);

        const monthly = await pickAll(`
            SELECT strftime('%Y-%m', issue_date) AS month,
                   COUNT(*) AS count,
                   COALESCE(SUM(total),0) AS total,
                   COALESCE(SUM(gst_total),0) AS gst
            FROM invoices
            WHERE business_id = ? AND issue_date >= date('now','-12 months')
            GROUP BY month
            ORDER BY month
        `);

        const topCustomers = await pickAll(`
            SELECT c.id, c.name, COUNT(i.id) AS invoices, COALESCE(SUM(i.total),0) AS total
            FROM customers c
            LEFT JOIN invoices i ON i.customer_id = c.id
            WHERE c.business_id = ?
            GROUP BY c.id
            ORDER BY total DESC
            LIMIT 5
        `);

        const recent = await pickAll(`
            SELECT i.id, i.invoice_number, i.issue_date, i.total, i.status, c.name AS customer_name
            FROM invoices i JOIN customers c ON c.id = i.customer_id
            WHERE i.business_id = ?
            ORDER BY i.created_at DESC LIMIT 6
        `);

        res.json({
            totalInvoices, totalRevenue, outstanding, gstCollected,
            byStatus, monthly, topCustomers, recent
        });
    } catch (err) { next(err); }
});

// GET /api/reports/gst
router.get('/gst', async (req, res, next) => {
    try {
        const { from, to } = req.query;
        const clauses = ['i.business_id = ?'];
        const params = [req.business.id];
        if (from) { clauses.push('date(i.issue_date) >= date(?)'); params.push(from); }
        if (to) { clauses.push('date(i.issue_date) <= date(?)'); params.push(to); }
        const rows = await db.prepare(`
            SELECT ii.gst_rate,
                   COALESCE(SUM(ii.amount),0) AS taxable,
                   COALESCE(SUM(CASE WHEN i.is_interstate = 0 THEN ii.gst_amount/2 ELSE 0 END),0) AS cgst,
                   COALESCE(SUM(CASE WHEN i.is_interstate = 0 THEN ii.gst_amount/2 ELSE 0 END),0) AS sgst,
                   COALESCE(SUM(CASE WHEN i.is_interstate = 1 THEN ii.gst_amount ELSE 0 END),0) AS igst,
                   COALESCE(SUM(ii.gst_amount),0) AS total_gst
            FROM invoice_items ii
            JOIN invoices i ON i.id = ii.invoice_id
            WHERE ${clauses.join(' AND ')}
            GROUP BY ii.gst_rate
            ORDER BY ii.gst_rate
        `).all(...params);
        res.json(rows);
    } catch (err) { next(err); }
});

// GET /api/reports/audit
router.get('/audit', async (req, res, next) => {
    try {
        const rows = await db.prepare(`
            SELECT a.*, u.email AS user_email
            FROM audit_log a
            LEFT JOIN users u ON u.id = a.user_id
            WHERE a.business_id = ?
            ORDER BY a.timestamp DESC LIMIT 200
        `).all(req.business.id);
        rows.forEach((r) => {
            try { r.details = r.details ? JSON.parse(r.details) : null; } catch (_) { /* ignore */ }
        });
        res.json(rows);
    } catch (err) { next(err); }
});

module.exports = router;

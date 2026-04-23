/**
 * Authentication: user signup/login + JWT middleware.
 * All DB access is async (Supabase Postgres).
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, logAudit } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

function publicSignupAllowed() {
    if (process.env.ALLOW_PUBLIC_SIGNUP === 'true') return true;
    return process.env.NODE_ENV !== 'production';
}

async function hasAnyUsers() {
    const row = await db.prepare('SELECT COUNT(*) AS c FROM users').get();
    return (row && Number(row.c) > 0) || false;
}

function mustHaveJwtSecret(res) {
    if (!JWT_SECRET) {
        res.status(500).json({ error: 'Server is not configured: missing JWT secret' });
        return false;
    }
    return true;
}

async function resolveRoleForSignup(email) {
    if (ADMIN_EMAILS.includes(email)) return 'admin';
    return (await hasAnyUsers()) ? 'user' : 'admin';
}

const router = express.Router();

// POST /api/auth/signup
router.post('/signup', async (req, res, next) => {
    try {
        const bootstrapSignupAllowed = !(await hasAnyUsers());
        if (!publicSignupAllowed() && !bootstrapSignupAllowed) {
            return res.status(403).json({ error: 'Public signup is disabled in production' });
        }
        if (!mustHaveJwtSecret(res)) return;

        const { email, password, name, businessName, gstin, state } = req.body || {};
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'email, password, and name are required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'password must be at least 6 characters' });
        }
        const normalizedEmail = String(email).toLowerCase();
        const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
        if (existing) return res.status(409).json({ error: 'Email already registered' });

        const hash = bcrypt.hashSync(password, 10);
        const role = await resolveRoleForSignup(normalizedEmail);
        const result = await db.prepare(
            'INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, ?, ?)'
        ).run(normalizedEmail, hash, role, name);

        const userId = result.lastInsertRowid;
        const bizResult = await db.prepare(`
            INSERT INTO businesses (user_id, name, gstin, state, invoice_prefix)
            VALUES (?, ?, ?, ?, 'INV')
        `).run(userId, businessName || `${name}'s Business`, gstin || null, state || null);

        await logAudit({
            businessId: bizResult.lastInsertRowid,
            userId,
            entityType: 'user',
            entityId: userId,
            action: 'signup',
            details: { email: normalizedEmail }
        });

        const token = jwt.sign({ userId, email: normalizedEmail, role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        res.json({
            token,
            user: { id: userId, email: normalizedEmail, name, role },
            businessId: bizResult.lastInsertRowid
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
    try {
        if (!mustHaveJwtSecret(res)) return;

        const { email, password } = req.body || {};
        if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

        const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        if (!user.is_active) return res.status(403).json({ error: 'Account is disabled' });
        if (!bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const business = await db.prepare(
            'SELECT id FROM businesses WHERE user_id = ? ORDER BY id LIMIT 1'
        ).get(user.id);
        const token = jwt.sign(
            { userId: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        await logAudit({
            businessId: business ? business.id : null,
            userId: user.id,
            entityType: 'user',
            entityId: user.id,
            action: 'login'
        });

        res.json({
            token,
            user: { id: user.id, email: user.email, name: user.name, role: user.role },
            businessId: business ? business.id : null
        });
    } catch (err) {
        next(err);
    }
});

/**
 * Middleware: verify JWT and load user + default business into req.
 */
async function authRequired(req, res, next) {
    if (!mustHaveJwtSecret(res)) return;

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        const user = await db.prepare(
            'SELECT id, email, name, role, is_active FROM users WHERE id = ?'
        ).get(payload.userId);
        if (!user) return res.status(401).json({ error: 'Unauthorized' });
        if (!user.is_active) return res.status(403).json({ error: 'Account is disabled' });
        req.user = user;

        const reqBizId = parseInt(req.headers['x-business-id'], 10);
        let business;
        if (reqBizId) {
            business = await db.prepare(
                'SELECT * FROM businesses WHERE id = ? AND user_id = ?'
            ).get(reqBizId, user.id);
        } else {
            business = await db.prepare(
                'SELECT * FROM businesses WHERE user_id = ? ORDER BY id LIMIT 1'
            ).get(user.id);
        }
        if (!business) return res.status(403).json({ error: 'No business found for user' });
        req.business = business;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

function adminRequired(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access is required' });
    }
    return next();
}

module.exports = { router, authRequired, adminRequired };

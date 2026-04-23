/**
 * Database module - Supabase Postgres.
 *
 * Provides a thin async adapter whose surface mirrors the subset of
 * better-sqlite3 we were using: `prepare(sql).get/all/run(...params)`,
 * `transaction(fn)`, and `exec(sql)`.
 *
 * All methods are async. Callers MUST `await` them.
 */
const { Pool } = require('pg');
const { AsyncLocalStorage } = require('node:async_hooks');

const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!SUPABASE_DB_URL) {
    throw new Error(
        'Missing SUPABASE_DB_URL (or DATABASE_URL) environment variable. ' +
        'Set it in .env to your Supabase Postgres connection string.'
    );
}

const pool = new Pool({
    connectionString: SUPABASE_DB_URL,
    ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false }
});

const txStorage = new AsyncLocalStorage();

/**
 * Translate SQLite-flavoured SQL fragments used in legacy queries into
 * Postgres-compatible equivalents, and replace `?` placeholders with
 * numbered `$1, $2, ...` parameters.
 */
function transformSql(sql) {
    let out = String(sql);

    // SQLite function compatibility.
    out = out.replace(/datetime\('now'\)/gi, 'NOW()');
    out = out.replace(/date\('now'\s*,\s*'-12 months'\)/gi, "(CURRENT_DATE - INTERVAL '12 months')");
    out = out.replace(/date\('now'\)/gi, 'CURRENT_DATE');
    out = out.replace(/strftime\('%Y-%m',\s*([^)]+)\)/gi, "TO_CHAR($1, 'YYYY-MM')");
    // `date(col)` comparisons collapse into the column itself (already DATE).
    out = out.replace(/date\(\s*([a-zA-Z_][\w\.]*)\s*\)/gi, '$1');
    // LIKE is case-sensitive in Postgres; prefer ILIKE for the search patterns used here.
    out = out.replace(/\bLIKE\b/g, 'ILIKE');

    // Convert positional `?` placeholders to Postgres `$n`, preserving quoted strings.
    let result = '';
    let index = 1;
    let inSingle = false;
    let inDouble = false;

    for (let i = 0; i < out.length; i += 1) {
        const ch = out[i];
        const prev = i > 0 ? out[i - 1] : '';

        if (ch === "'" && !inDouble && prev !== '\\') {
            inSingle = !inSingle;
            result += ch;
            continue;
        }
        if (ch === '"' && !inSingle && prev !== '\\') {
            inDouble = !inDouble;
            result += ch;
            continue;
        }

        if (ch === '?' && !inSingle && !inDouble) {
            result += `$${index}`;
            index += 1;
        } else {
            result += ch;
        }
    }

    return result;
}

async function executeQuery(sql, params) {
    const text = transformSql(sql);
    const client = txStorage.getStore() || pool;
    return client.query(text, params);
}

/**
 * Coerce Postgres row values (NUMERIC comes back as string) into the
 * plain JS numbers/ints that the existing code paths expect.
 */
function coerceRow(row) {
    if (!row || typeof row !== 'object') return row;
    const out = {};
    for (const [k, v] of Object.entries(row)) {
        if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) {
            const n = Number(v);
            out[k] = Number.isFinite(n) ? n : v;
        } else {
            out[k] = v;
        }
    }
    return out;
}

function prepare(sql) {
    return {
        async get(...params) {
            const r = await executeQuery(sql, params);
            return r.rows[0] ? coerceRow(r.rows[0]) : undefined;
        },
        async all(...params) {
            const r = await executeQuery(sql, params);
            return r.rows.map(coerceRow);
        },
        async run(...params) {
            const normalized = String(sql).trim();
            const isInsert = /^insert\s+/i.test(normalized);
            const hasReturning = /\breturning\b/i.test(normalized);
            const runSql = isInsert && !hasReturning ? `${normalized} RETURNING id` : normalized;
            const r = await executeQuery(runSql, params);
            const lastInsertRowid = r.rows && r.rows[0] && r.rows[0].id != null
                ? Number(r.rows[0].id)
                : undefined;
            return {
                changes: r.rowCount || 0,
                lastInsertRowid
            };
        }
    };
}

/**
 * Run `fn` inside a Postgres transaction. The returned wrapper is async
 * and resolves with whatever `fn` returns.
 */
function transaction(fn) {
    return async (...args) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await txStorage.run(client, () => fn(...args));
            await client.query('COMMIT');
            return result;
        } catch (err) {
            try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
            throw err;
        } finally {
            client.release();
        }
    };
}

async function exec(sql) {
    const client = txStorage.getStore() || pool;
    await client.query(sql);
}

const db = { prepare, transaction, exec };

async function initSchema() {
    await db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')),
  is_active INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS businesses (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  gstin TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  state TEXT,
  invoice_prefix TEXT DEFAULT 'INV',
  next_invoice_number INTEGER DEFAULT 1,
  currency TEXT DEFAULT 'INR',
  currency_symbol TEXT DEFAULT '₹',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  gstin TEXT,
  address TEXT,
  state TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS items (
  id BIGSERIAL PRIMARY KEY,
  business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(unit_price >= 0),
  gst_rate NUMERIC(5,2) NOT NULL DEFAULT 18 CHECK(gst_rate >= 0 AND gst_rate <= 100),
  hsn_code TEXT,
  unit TEXT DEFAULT 'pcs',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id BIGSERIAL PRIMARY KEY,
  business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  invoice_number TEXT NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','paid','overdue','cancelled')),
  payment_method TEXT,
  payment_date DATE,
  notes TEXT,
  is_interstate INTEGER NOT NULL DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  cgst_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  sgst_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  igst_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(business_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id BIGSERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_id BIGINT REFERENCES items(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  hsn_code TEXT,
  quantity NUMERIC(12,2) NOT NULL CHECK(quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK(unit_price >= 0),
  gst_rate NUMERIC(5,2) NOT NULL CHECK(gst_rate >= 0 AND gst_rate <= 100),
  amount NUMERIC(12,2) NOT NULL,
  gst_amount NUMERIC(12,2) NOT NULL,
  total NUMERIC(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  business_id BIGINT REFERENCES businesses(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id BIGINT,
  action TEXT NOT NULL,
  details TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_business ON invoices(business_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON invoices(issue_date);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_customers_business ON customers(business_id);
CREATE INDEX IF NOT EXISTS idx_items_business ON items(business_id);
CREATE INDEX IF NOT EXISTS idx_audit_business ON audit_log(business_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active INTEGER NOT NULL DEFAULT 1;
`);
}

const initPromise = initSchema();

/**
 * Log an auditable action. Fire-and-forget-safe; callers may choose to await.
 */
async function logAudit({ businessId, userId, entityType, entityId, action, details }) {
    try {
        await db.prepare(`
            INSERT INTO audit_log (business_id, user_id, entity_type, entity_id, action, details)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            businessId || null,
            userId || null,
            entityType,
            entityId || null,
            action,
            details ? JSON.stringify(details) : null
        );
    } catch (err) {
        // Audit failures must never break a request flow.
        // eslint-disable-next-line no-console
        console.error(JSON.stringify({
            level: 'error',
            message: 'audit_log insert failed',
            error: err && err.message
        }));
    }
}

module.exports = { db, logAudit, initPromise, pool };

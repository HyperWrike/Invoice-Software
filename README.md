# Invoice Software

Production invoice management application with GST support, secure authentication, and an internal billing dashboard inspired by modern invoicing tools.

## What Changed For Production

- Removed demo seeding workflow and demo credentials
- Hardened auth flow with explicit admin role checks
- Added billing admin APIs for local invoice and payment management
- Added structured logging + request IDs for critical operations
- Added production security headers (CSP, HSTS, frame deny, etc.)
- Added strict CORS allowlist support via environment variables
- Added Vercel deployment configuration

## Tech Stack

- Backend: Node.js + Express
- Database: SQLite via better-sqlite3
- Auth: JWT + bcryptjs
- Frontend: Vanilla JS SPA in public/

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
```

3. Set minimum required values in .env:

- JWT_SECRET
- ADMIN_EMAILS
- CORS_ORIGIN

4. Start the app:

```bash
npm run dev
```

## Billing Dashboard

Admin users can access Billing Admin from the sidebar to:

- Review customer billing totals and invoice counts
- Inspect invoice status and payment history
- Mark invoices as sent
- Record payments and reconcile balances
- Monitor audit trails for billing changes

## Security Configuration

- Public signup is disabled by default in production (`ALLOW_PUBLIC_SIGNUP=false`)
- Only users with role admin can access `/api/admin/billing/*`
- CORS is restricted to the `CORS_ORIGIN` allowlist
- Security headers are applied globally (CSP/HSTS/XFO/etc.)
- JWT secret is mandatory in every environment

## Vercel Deployment

This project includes `vercel.json` routing the Express app as a serverless function.

### 1. Import Repository

- In Vercel dashboard, import your GitHub repository
- Framework preset: `Other`
- Build command: leave empty
- Output directory: leave empty

### 2. Configure Environment Variables (Production)

Set all required values from `.env.example`, especially:

- NODE_ENV=production
- JWT_SECRET
- CORS_ORIGIN (your production domain)
- ADMIN_EMAILS

### 3. Deploy

- Trigger deployment from Vercel UI or push to the connected branch
- Validate health endpoint:
  - `GET /api/health`

## Important Serverless Note

SQLite files are ephemeral in serverless runtimes. For durable production persistence on Vercel, migrate to a managed database (for example, Postgres or serverless SQLite provider). This code currently keeps SQLite for compatibility with your existing project structure.

## Admin Operations Checklist

- Verify billing dashboard data from the Billing Admin page
- Mark invoices as sent when they leave draft state
- Record payments as they are received
- Review payment history for reconciliation
- Monitor logs for billing-related errors and request IDs
# Invoice-Software

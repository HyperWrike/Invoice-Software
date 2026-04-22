/* ====================================================================
 * Invoice Software - Frontend SPA
 * Vanilla JS (no build step). Renders dashboard, invoices, customers,
 * items, reports, settings. Talks to the /api backend with JWT auth.
 * ==================================================================== */
// ---------- State ----------
const State = {
    token: localStorage.getItem('token') || null,
    user: JSON.parse(localStorage.getItem('user') || 'null'),
    business: null,
    route: 'dashboard',
};

// ---------- API ----------
async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (State.token) headers['Authorization'] = `Bearer ${State.token}`;
    const res = await fetch('/api' + path, {...options, headers });
    if (res.status === 401) { logout(); throw new Error('Session expired'); }
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok) throw new Error((data && data.error) || res.statusText || 'Request failed');
    return el;
};
const esc = (s) => String(s ? ? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[c]));

function money(n, sym) {
    const s = sym || (State.business ? .currency_symbol === '₹' ? '₹' : (State.business ? .currency_symbol || '$'));
}[c]));
const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'html') el.innerHTML = v;
        else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const c of children.flat()) {
        if (c == null || c === false) continue;
        el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
};
const esc = (s) => String(s ? ? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[c]));

function money(n, sym) {
    const s = sym || (State.business ? .currency_symbol === '₹' ? '₹' : (State.business ? .currency_symbol || '$'));
    const v = (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
    const [i, d] = v.split('.');
    return s + i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + d;
}

function fmtDate(s) {
    if (!s) return '-';
    try { return new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return s; }
}

function today() { return new Date().toISOString().slice(0, 10); }

function addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

// ---------- Toasts ----------
function toast(msg, type = 'info') {
    const el = h('div', { class: 'toast ' + (type || '') }, msg);
    $('#toast-root').append(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transition = 'opacity .2s';
        setTimeout(() => el.remove(), 200);
    }, 2800);
}

// ---------- Modal ----------
function openModal({ title, body, wide, footer }) {
    return new Promise((resolve) => {
        const root = $('#modal-root');
        root.innerHTML = '';
        const close = (val) => {
            root.innerHTML = '';
            resolve(val);
        };
        const overlay = h('div', { class: 'modal-overlay', onClick: (e) => { if (e.target === overlay) close(null); } },
            h('div', { class: 'modal' + (wide ? ' wide' : '') },
                h('div', { class: 'modal-header' },
                    h('h3', { class: 'modal-title' }, title),
                    h('button', { class: 'close-x', onClick: () => close(null) }, '×')
                ),
                h('div', { class: 'modal-body' }, body || ''),
                footer ? h('div', { class: 'modal-footer' }, footer(close)) : null
            )
        );
        root.append(overlay);
    });
}

async function confirmDialog(msg, { danger } = {}) {
    return await openModal({
        title: 'Confirm',
        body: h('p', {}, msg),
        footer: (close) => [
            h('button', { class: 'btn btn-secondary', onClick: () => close(false) }, 'Cancel'),
            h('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), onClick: () => close(true) }, danger ? 'Delete' : 'Confirm'),
        ]
    });
}

// ---------- Auth ----------
function saveSession({ token, user, businessId }) {
    State.token = token;
    State.user = user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    if (businessId) localStorage.setItem('businessId', businessId);
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('businessId');
    State.token = null;
    State.user = null;
    State.business = null;
    render();
}

function renderAuth() {
    const app = $('#app');
    app.innerHTML = '';
    let mode = 'login';

    const root = h('div', { class: 'auth-wrap' });
    const card = h('div', { class: 'auth-card' });

    const renderForm = () => {
        card.innerHTML = '';
        card.append(
            h('div', { class: 'auth-brand' },
                h('div', { style: { fontSize: '40px' } }, '🧾'),
                h('h1', {}, 'Invoice Software'),
                h('p', {}, 'GST-compliant invoicing for modern businesses')
            ),
            h('div', { class: 'auth-tabs' },
                h('button', {
                    class: 'auth-tab' + (mode === 'login' ? ' active' : ''),
                    onClick: () => {
                        mode = 'login';
                        renderForm();
                    }
                }, 'Log in'),
                h('button', {
                    class: 'auth-tab' + (mode === 'signup' ? ' active' : ''),
                    onClick: () => {
                        mode = 'signup';
                        renderForm();
                    }
                }, 'Sign up')
            )
        );

        const errBox = h('div', { class: 'form-err', style: { display: 'none' } });

        const submit = async(e) => {
            e.preventDefault();
            errBox.style.display = 'none';
            const fd = new FormData(e.target);
            const body = Object.fromEntries(fd.entries());
            try {
                const endpoint = mode === 'login' ? '/auth/login' : '/auth/signup';
                const data = await api(endpoint, { method: 'POST', body: JSON.stringify(body) });
                saveSession(data);
                render();
            } catch (err) {
                errBox.textContent = err.message;
                errBox.style.display = 'block';
            }
        };

        const form = h('form', { onSubmit: submit, class: 'form-grid', style: { gridTemplateColumns: '1fr' } });
        if (mode === 'signup') {
            form.append(
                h('div', { class: 'field' }, h('label', {}, 'Your name'), h('input', { name: 'name', required: true, placeholder: 'Jane Doe' })),
                h('div', { class: 'field' }, h('label', {}, 'Business name'), h('input', { name: 'businessName', placeholder: 'Acme Pvt Ltd' })),
                h('div', { class: 'field' }, h('label', {}, 'GSTIN (optional)'), h('input', { name: 'gstin', placeholder: '29ABCDE1234F1Z5' })),
                h('div', { class: 'field' }, h('label', {}, 'State (optional)'), h('input', { name: 'state', placeholder: 'Karnataka' })),
            );
        }
        form.append(
            h('div', { class: 'field' }, h('label', {}, 'Email'), h('input', { type: 'email', name: 'email', required: true, placeholder: 'you@company.com' })),
            h('div', { class: 'field' }, h('label', {}, 'Password'), h('input', { type: 'password', name: 'password', required: true, minlength: 6, placeholder: '••••••••' })),
            errBox,
            h('button', { type: 'submit', class: 'btn btn-primary btn-block', style: { marginTop: '8px' } }, mode === 'login' ? 'Log in' : 'Create account')
        );
        card.append(form);
    };
    renderForm();
    root.append(card);
    app.append(root);
}

// ---------- Layout ----------
function renderLayout(content) {
    const app = $('#app');
    app.innerHTML = '';
    const nav = [
        { id: 'dashboard', label: 'Dashboard', icon: '📊' },
        { id: 'invoices', label: 'Invoices', icon: '🧾' },
        { id: 'customers', label: 'Customers', icon: '👥' },
        { id: 'items', label: 'Items', icon: '📦' },
        { id: 'reports', label: 'Reports', icon: '📈' },
        ...(State.user ? .role === 'admin' ? [{ id: 'billing-admin', label: 'Billing Admin', icon: '💳' }] : []),
        { id: 'settings', label: 'Settings', icon: '⚙️' },
    ];
    const layout = h('div', { class: 'layout' },
        h('aside', { class: 'sidebar' },
            h('div', { class: 'brand' },
                h('div', { class: 'brand-icon' }, '🧾'),
                h('span', {}, 'Invoice')
            ),
            h('div', { class: 'nav-section' }, 'Main'),
            ...nav.map(n =>
                h('a', {
                    class: 'nav-item' + (State.route === n.id ? ' active' : ''),
                    onClick: (e) => {
                        e.preventDefault();
                        navigate(n.id);
                    },
                    href: '#' + n.id
                }, h('span', {}, n.icon), h('span', {}, n.label))
            ),
            h('div', { class: 'nav-spacer' }),
            h('div', { class: 'user-box' },
                h('div', { class: 'user-avatar' }, (State.user ? .name || '?').slice(0, 1).toUpperCase()),
                h('div', {},
                    h('div', { class: 'name' }, State.user ? .name || ''),
                    h('div', { class: 'email' }, State.user ? .email || '')
                )
            ),
            h('button', { class: 'logout', onClick: logout }, 'Sign out')
        ),
        h('main', { class: 'main', id: 'main-content' }, content)
    );
    app.append(layout);
}

// ---------- Navigate / Router ----------
function navigate(route, params = {}) {
    State.route = route;
    State.params = params;
    render();
}

async function render() {
    if (!State.token) { renderAuth(); return; }
    if (!State.business) {
        try { State.business = await api('/businesses/current'); } catch { logout(); return; }
    }
    const content = h('div');
    renderLayout(content);
    switch (State.route) {
        case 'dashboard':
            await renderDashboard(content);
            break;
        case 'invoices':
            await renderInvoices(content);
            break;
        case 'invoice-new':
            await renderInvoiceForm(content, null);
            break;
        case 'invoice-edit':
            await renderInvoiceForm(content, State.params.id);
            break;
        case 'invoice-view':
            await renderInvoiceView(content, State.params.id);
            break;
        case 'customers':
            await renderCustomers(content);
            break;
        case 'items':
            await renderItems(content);
            break;
        case 'reports':
            await renderReports(content);
            break;
        case 'billing-admin':
            await renderBillingAdmin(content);
            break;
        case 'settings':
            await renderSettings(content);
            break;
        default:
            State.route = 'dashboard';
            await renderDashboard(content);
    }
}

// ==========================================================
// Dashboard
// ==========================================================
async function renderDashboard(root) {
    root.append(
        h('div', { class: 'page-header' },
            h('div', {},
                h('h1', { class: 'page-title' }, 'Dashboard'),
                h('div', { class: 'page-sub' }, `Welcome back, ${State.user.name} — ${State.business.name}`)
            ),
            h('button', { class: 'btn btn-primary', onClick: () => navigate('invoice-new') }, '+ New Invoice')
        ),
        h('div', { id: 'kpi-loading' }, 'Loading...')
    );
    const summary = await api('/reports/summary');
    $('#kpi-loading').remove();

    const kpis = h('div', { class: 'kpi-grid' },
        kpiCard('blue', '💰', 'Total Revenue (Paid)', money(summary.totalRevenue)),
        kpiCard('orange', '⏳', 'Outstanding', money(summary.outstanding)),
        kpiCard('purple', '📑', 'GST Collected', money(summary.gstCollected)),
        kpiCard('green', '🧾', 'Total Invoices', String(summary.totalInvoices))
    );
    root.append(kpis);

    // Status breakdown
    const byStatus = ['draft', 'sent', 'paid', 'overdue', 'cancelled'].map(st => {
        const row = summary.byStatus.find(s => s.status === st);
        return { status: st, count: row ? .count || 0, total: row ? .total || 0 };
    });
    const statusGrid = h('div', { class: 'kpi-grid' });
    byStatus.forEach(s => {
        statusGrid.append(
            h('div', { class: 'kpi-card' },
                h('div', { class: 'kpi-label' }, h('span', { class: 'badge badge-' + s.status }, s.status)),
                h('div', { class: 'kpi-value' }, String(s.count)),
                h('div', { class: 'form-hint' }, money(s.total))
            )
        );
    });
    root.append(statusGrid);

    // Monthly chart
    const maxTotal = Math.max(1, ...summary.monthly.map(m => m.total));
    const bars = summary.monthly.map(m =>
        h('div', { class: 'bar' },
            h('div', { class: 'bar-value' }, money(m.total)),
            h('div', { class: 'bar-fill', style: { height: `${Math.max(4, (m.total / maxTotal) * 140)}px` } }),
            h('div', { class: 'bar-label' }, m.month)
        )
    );
    root.append(
        h('div', { class: 'card', style: { marginBottom: '24px' } },
            h('div', { class: 'card-header' }, h('h3', { class: 'card-title' }, 'Monthly Revenue (last 12 months)')),
            h('div', { class: 'card-body' },
                summary.monthly.length === 0 ? h('div', { class: 'empty' }, 'No data yet. Create your first invoice.') :
                h('div', { class: 'bar-chart' }, ...bars)
            )
        )
    );

    // Recent + top customers
    const grid = h('div', { class: 'detail-grid' });
    const recentCard = h('div', { class: 'card' },
        h('div', { class: 'card-header' }, h('h3', { class: 'card-title' }, 'Recent Invoices')),
        h('div', { class: 'table-wrap' },
            summary.recent.length === 0 ?
            h('div', { class: 'empty' }, 'No invoices yet.') :
            h('table', { class: 'data' },
                h('thead', {}, h('tr', {},
                    h('th', {}, '#'), h('th', {}, 'Customer'), h('th', {}, 'Date'),
                    h('th', { class: 'num' }, 'Total'), h('th', {}, 'Status')
                )),
                h('tbody', {}, ...summary.recent.map(inv =>
                    h('tr', { class: 'clickable', onClick: () => navigate('invoice-view', { id: inv.id }) },
                        h('td', {}, inv.invoice_number),
                        h('td', {}, inv.customer_name),
                        h('td', {}, fmtDate(inv.issue_date)),
                        h('td', { class: 'num' }, money(inv.total)),
                        h('td', {}, h('span', { class: 'badge badge-' + inv.status }, inv.status))
                    )
                ))
            )
        )
    );
    const topCustomers = h('div', { class: 'card' },
        h('div', { class: 'card-header' }, h('h3', { class: 'card-title' }, 'Top Customers')),
        h('div', { class: 'table-wrap' },
            summary.topCustomers.length === 0 ?
            h('div', { class: 'empty' }, 'No customers yet.') :
            h('table', { class: 'data' },
                h('thead', {}, h('tr', {},
                    h('th', {}, 'Customer'),
                    h('th', { class: 'num' }, 'Invoices'),
                    h('th', { class: 'num' }, 'Total')
                )),
                h('tbody', {}, ...summary.topCustomers.map(c =>
                    h('tr', {},
                        h('td', {}, c.name),
                        h('td', { class: 'num' }, String(c.invoices)),
                        h('td', { class: 'num' }, money(c.total))
                    )
                ))
            )
        )
    );
    grid.append(recentCard, topCustomers);
    root.append(grid);
}

function kpiCard(accent, icon, label, value) {
    return h('div', { class: 'kpi-card' },
        h('div', { class: 'kpi-accent accent-' + accent }, icon),
        h('div', { class: 'kpi-label' }, label),
        h('div', { class: 'kpi-value' }, value)
    );
}

// ==========================================================
// Invoices - list
// ==========================================================
async function renderInvoices(root) {
    root.append(
        h('div', { class: 'page-header' },
            h('div', {},
                h('h1', { class: 'page-title' }, 'Invoices'),
                h('div', { class: 'page-sub' }, 'Create, manage and track all invoices')
            ),
            h('button', { class: 'btn btn-primary', onClick: () => navigate('invoice-new') }, '+ New Invoice')
        )
    );

    const filters = {
        q: '',
        status: '',
        customer_id: '',
        from: '',
        to: ''
    };

    const toolbar = h('div', { class: 'toolbar' },
        h('input', {
            class: 'search',
            placeholder: 'Search invoice #, customer, notes…',
            id: 'f-q',
            onInput: e => {
                filters.q = e.target.value;
                reload();
            }
        }),
        h('select', {
                id: 'f-status',
                onChange: e => {
                    filters.status = e.target.value;
                    reload();
                }
            },
            h('option', { value: '' }, 'All statuses'),
            ...['draft', 'sent', 'paid', 'overdue', 'cancelled'].map(s => h('option', { value: s }, s))
        ),
        h('input', {
            type: 'date',
            onChange: e => {
                filters.from = e.target.value;
                reload();
            }
        }),
        h('input', {
            type: 'date',
            onChange: e => {
                filters.to = e.target.value;
                reload();
            }
        })
    );
    root.append(toolbar);

    const card = h('div', { class: 'card' });
    root.append(card);

    const reload = async() => {
        card.innerHTML = '<div class="empty">Loading…</div>';
        const qs = new URLSearchParams();
        Object.entries(filters).forEach(([k, v]) => { if (v) qs.set(k, v); });
        const rows = await api('/invoices?' + qs.toString());
        card.innerHTML = '';
        if (rows.length === 0) {
            card.append(h('div', { class: 'empty' }, 'No invoices found.'));
            return;
        }
        card.append(h('div', { class: 'table-wrap' },
            h('table', { class: 'data' },
                h('thead', {}, h('tr', {},
                    h('th', {}, '#'), h('th', {}, 'Customer'), h('th', {}, 'Issue Date'), h('th', {}, 'Due'),
                    h('th', { class: 'num' }, 'Total'), h('th', {}, 'Status'), h('th', {}, '')
                )),
                h('tbody', {}, ...rows.map(inv =>
                    h('tr', { class: 'clickable', onClick: () => navigate('invoice-view', { id: inv.id }) },
                        h('td', {}, inv.invoice_number),
                        h('td', {}, inv.customer_name),
                        h('td', {}, fmtDate(inv.issue_date)),
                        h('td', {}, fmtDate(inv.due_date)),
                        h('td', { class: 'num' }, money(inv.total)),
                        h('td', {}, h('span', { class: 'badge badge-' + inv.status }, inv.status)),
                        h('td', {}, h('button', {
                            class: 'btn btn-sm btn-ghost',
                            onClick: (e) => {
                                e.stopPropagation();
                                openInvoicePdf(inv.id);
                            }
                        }, 'PDF'))
                    )
                ))
            )
        ));
    };
    reload();
}

// Open PDF with token: the route is authenticated — for simplicity we handle via blob fetch
async function openInvoicePdf(id) {
    try {
        const res = await fetch(`/api/invoices/${id}/pdf`, { headers: { Authorization: `Bearer ${State.token}` } });
        if (!res.ok) throw new Error('Failed to load PDF');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { toast(e.message, 'error'); }
}

// ==========================================================
// Invoice - view detail
// ==========================================================
async function renderInvoiceView(root, id) {
    const inv = await api('/invoices/' + id);
    const c = inv.customer || {};
    const sym = State.business ? .currency_symbol || '₹';
    root.append(
        h('div', { class: 'page-header' },
            h('div', {},
                h('h1', { class: 'page-title' }, 'Invoice ' + inv.invoice_number),
                h('div', { class: 'page-sub' }, h('span', { class: 'badge badge-' + inv.status }, inv.status))
            ),
            h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
                h('button', { class: 'btn btn-secondary', onClick: () => navigate('invoices') }, '← Back'),
                h('button', { class: 'btn btn-secondary', onClick: () => openInvoicePdf(inv.id) }, 'Download PDF'),
                inv.status !== 'paid' ? h('button', { class: 'btn btn-primary', onClick: () => markPaid(inv.id) }, 'Mark as Paid') : null,
                h('button', { class: 'btn btn-secondary', onClick: () => navigate('invoice-edit', { id: inv.id }) }, 'Edit'),
                h('button', { class: 'btn btn-danger', onClick: () => deleteInvoice(inv.id) }, 'Delete')
            )
        )
    );

    root.append(
        h('div', { class: 'card' },
            h('div', { class: 'card-body' },
                h('div', { class: 'detail-grid' },
                    h('div', { class: 'detail-section' },
                        h('h4', {}, 'From'),
                        h('p', { style: { fontWeight: 600 } }, State.business.name),
                        State.business.address ? h('p', {}, State.business.address) : null,
                        State.business.gstin ? h('p', {}, 'GSTIN: ' + State.business.gstin) : null,
                        State.business.email ? h('p', {}, State.business.email) : null
                    ),
                    h('div', { class: 'detail-section' },
                        h('h4', {}, 'Bill To'),
                        h('p', { style: { fontWeight: 600 } }, c.name || ''),
                        c.address ? h('p', {}, c.address) : null,
                        c.gstin ? h('p', {}, 'GSTIN: ' + c.gstin) : null,
                        c.email ? h('p', {}, c.email) : null
                    ),
                    h('div', { class: 'detail-section' },
                        h('h4', {}, 'Issue Date'),
                        h('p', {}, fmtDate(inv.issue_date))
                    ),
                    h('div', { class: 'detail-section' },
                        h('h4', {}, 'Due Date'),
                        h('p', {}, fmtDate(inv.due_date))
                    ),
                    h('div', { class: 'detail-section' },
                        h('h4', {}, 'Supply Type'),
                        h('p', {}, inv.is_interstate ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)')
                    ),
                    inv.payment_method ? h('div', { class: 'detail-section' },
                        h('h4', {}, 'Payment'),
                        h('p', {}, `${inv.payment_method}${inv.payment_date ? ' on ' + fmtDate(inv.payment_date) : ''}`)
                    ) : null
                ),
                h('div', { class: 'table-wrap' },
                    h('table', { class: 'data' },
                        h('thead', {}, h('tr', {},
                            h('th', {}, 'Description'), h('th', {}, 'HSN'),
                            h('th', { class: 'num' }, 'Qty'),
                            h('th', { class: 'num' }, 'Rate'),
                            h('th', { class: 'num' }, 'GST%'),
                            h('th', { class: 'num' }, 'GST'),
                            h('th', { class: 'num' }, 'Total')
                        )),
                        h('tbody', {}, ...inv.items.map(li =>
                            h('tr', {},
                                h('td', {}, li.description),
                                h('td', {}, li.hsn_code || '-'),
                                h('td', { class: 'num' }, String(li.quantity)),
                                h('td', { class: 'num' }, money(li.unit_price, sym)),
                                h('td', { class: 'num' }, li.gst_rate + '%'),
                                h('td', { class: 'num' }, money(li.gst_amount, sym)),
                                h('td', { class: 'num' }, money(li.total, sym))
                            )
                        ))
                    )
                ),
                h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: '20px' } },
                    h('div', { class: 'totals-box', style: { minWidth: '320px' } },
                        row('Subtotal', money(inv.subtotal, sym)),
                        inv.is_interstate ? row('IGST', money(inv.igst_total, sym)) : [
                            row('CGST', money(inv.cgst_total, sym)),
                            row('SGST', money(inv.sgst_total, sym))
                        ],
                        inv.discount > 0 ? row('Discount', '- ' + money(inv.discount, sym)) : null,
                        h('div', { class: 'totals-row grand' },
                            h('span', {}, 'Total'),
                            h('span', {}, money(inv.total, sym))
                        )
                    )
                ),
                inv.notes ? h('div', { style: { marginTop: '24px' } },
                    h('h4', { style: { margin: '0 0 6px', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' } }, 'Notes'),
                    h('p', { style: { margin: 0 } }, inv.notes)
                ) : null
            )
        )
    );
}

function row(label, val) {
    return h('div', { class: 'totals-row' }, h('span', {}, label), h('span', {}, val));
}

async function markPaid(id) {
    const form = h('form', { class: 'form-grid' },
        h('div', { class: 'field' }, h('label', {}, 'Payment method'),
            h('select', { name: 'payment_method' },
                ...['Bank Transfer', 'UPI', 'Cash', 'Cheque', 'Credit Card', 'Other'].map(m => h('option', {}, m))
            )
        ),
        h('div', { class: 'field' }, h('label', {}, 'Payment date'),
            h('input', { type: 'date', name: 'payment_date', value: today() })
        )
    );
    const ok = await openModal({
        title: 'Mark as paid',
        body: form,
        footer: (close) => [
            h('button', { class: 'btn btn-secondary', onClick: () => close(false) }, 'Cancel'),
            h('button', { class: 'btn btn-primary', onClick: () => close(Object.fromEntries(new FormData(form).entries())) }, 'Mark Paid')
        ]
    });
    if (!ok) return;
    try {
        await api(`/invoices/${id}/mark-paid`, { method: 'POST', body: JSON.stringify(ok) });
        toast('Invoice marked as paid', 'success');
        render();
    } catch (e) { toast(e.message, 'error'); }
}

async function deleteInvoice(id) {
    if (!(await confirmDialog('Delete this invoice permanently?', { danger: true }))) return;
    try {
        await api('/invoices/' + id, { method: 'DELETE' });
        toast('Invoice deleted', 'success');
        navigate('invoices');
    } catch (e) { toast(e.message, 'error'); }
}

// ==========================================================
// Invoice form (new / edit)
// ==========================================================
async function renderInvoiceForm(root, editId) {
    const [customers, items] = await Promise.all([api('/customers'), api('/items')]);
    let invoice = null;
    if (editId) invoice = await api('/invoices/' + editId);

    const defaults = invoice ? {
        customer_id: String(invoice.customer_id),
        issue_date: invoice.issue_date,
        due_date: invoice.due_date || '',
        is_interstate: !!invoice.is_interstate,
        notes: invoice.notes || '',
        status: invoice.status,
        discount: invoice.discount || 0,
        invoice_number: invoice.invoice_number,
        lines: invoice.items.map(li => ({
            description: li.description,
            hsn_code: li.hsn_code || '',
            quantity: li.quantity,
            unit_price: li.unit_price,
            gst_rate: li.gst_rate,
            item_id: li.item_id || null
        }))
    } : {
        customer_id: '',
        issue_date: today(),
        due_date: addDays(today(), 15),
        is_interstate: false,
        notes: '',
        status: 'draft',
        discount: 0,
        invoice_number: '',
        lines: [{ description: '', hsn_code: '', quantity: 1, unit_price: 0, gst_rate: 18, item_id: null }]
    };

    root.append(
        h('div', { class: 'page-header' },
            h('div', {},
                h('h1', { class: 'page-title' }, editId ? 'Edit Invoice' : 'New Invoice'),
                h('div', { class: 'page-sub' }, editId ? invoice.invoice_number : 'Fill in the details below')
            ),
            h('button', { class: 'btn btn-secondary', onClick: () => navigate('invoices') }, '← Cancel')
        )
    );

    const formCard = h('div', { class: 'card' });
    root.append(formCard);
    const formBody = h('div', { class: 'card-body' });
    formCard.append(formBody);

    // Header fields
    const fields = h('div', { class: 'form-grid three', style: { marginBottom: '24px' } },
        h('div', { class: 'field' }, h('label', {}, 'Customer *'),
            h('select', { id: 'f-customer' },
                h('option', { value: '' }, '— Select customer —'),
                ...customers.map(c => h('option', { value: c.id, selected: String(c.id) === defaults.customer_id }, c.name))
            ),
            h('button', { type: 'button', class: 'btn btn-sm btn-ghost', style: { marginTop: '4px', alignSelf: 'flex-start' }, onClick: onAddCustomer }, '+ New customer')
        ),
        h('div', { class: 'field' }, h('label', {}, 'Invoice # (optional)'),
            h('input', { id: 'f-number', placeholder: 'Auto-generated', value: defaults.invoice_number })
        ),
        h('div', { class: 'field' }, h('label', {}, 'Status'),
            h('select', { id: 'f-status' },
                ...['draft', 'sent', 'paid', 'overdue', 'cancelled'].map(s =>
                    h('option', { value: s, selected: s === defaults.status }, s))
            )
        ),
        h('div', { class: 'field' }, h('label', {}, 'Issue date *'),
            h('input', { type: 'date', id: 'f-issue', value: defaults.issue_date, required: true })
        ),
        h('div', { class: 'field' }, h('label', {}, 'Due date'),
            h('input', { type: 'date', id: 'f-due', value: defaults.due_date })
        ),
        h('div', { class: 'field' }, h('label', {}, 'Supply type'),
            h('select', { id: 'f-supply' },
                h('option', { value: '0', selected: !defaults.is_interstate }, 'Intra-state (CGST + SGST)'),
                h('option', { value: '1', selected: defaults.is_interstate }, 'Inter-state (IGST)')
            )
        )
    );
    formBody.append(fields);

    // Line items
    formBody.append(h('h3', { style: { margin: '0 0 10px', fontSize: '15px' } }, 'Line Items'));
    const linesBox = h('div', { class: 'invoice-lines' });
    formBody.append(linesBox);
    let lines = [...defaults.lines];

    function lineRow(idx) {
        const l = lines[idx];
        const tr = h('tr', {},
            h('td', { class: 'col-desc' },
                h('select', {
                        onChange: (e) => {
                            const item = items.find(i => String(i.id) === e.target.value);
                            if (item) {
                                lines[idx] = {
                                    ...l,
                                    description: item.name,
                                    hsn_code: item.hsn_code || '',
                                    unit_price: item.unit_price,
                                    gst_rate: item.gst_rate,
                                    item_id: item.id
                                };
                                redrawLines();
                            }
                        }
                    },
                    h('option', { value: '' }, '— Pick item or type below —'),
                    ...items.map(it => h('option', { value: it.id, selected: l.item_id === it.id }, it.name))
                ),
                h('input', { placeholder: 'Description', value: l.description, oninput: function() { l.description = this.value; }, style: { marginTop: '4px' } })
            ),
            h('td', {}, h('input', { value: l.hsn_code, placeholder: 'HSN', oninput: function() { l.hsn_code = this.value; } })),
            h('td', { class: 'col-qty' }, h('input', {
                type: 'number',
                min: '0.01',
                step: '0.01',
                value: l.quantity,
                oninput: function() {
                    l.quantity = parseFloat(this.value) || 0;
                    recalc();
                }
            })),
            h('td', { class: 'col-price' }, h('input', {
                type: 'number',
                min: '0',
                step: '0.01',
                value: l.unit_price,
                oninput: function() {
                    l.unit_price = parseFloat(this.value) || 0;
                    recalc();
                }
            })),
            h('td', { class: 'col-gst' }, h('select', {
                    onChange: function() {
                        l.gst_rate = parseFloat(this.value);
                        recalc();
                    }
                },
                ...[0, 3, 5, 12, 18, 28].map(r => h('option', { value: r, selected: r === Number(l.gst_rate) }, r + '%'))
            )),
            h('td', { class: 'col-total', id: `line-total-${idx}` }, money((l.quantity || 0) * (l.unit_price || 0) * (1 + (l.gst_rate || 0) / 100))),
            h('td', { class: 'col-remove' },
                h('button', {
                    type: 'button',
                    class: 'icon-btn',
                    title: 'Remove',
                    onClick: () => {
                        if (lines.length > 1) {
                            lines.splice(idx, 1);
                            redrawLines();
                        }
                    }
                }, '✕')
            )
        );
        return tr;
    }

    function redrawLines() {
        linesBox.innerHTML = '';
        linesBox.append(
            h('table', {},
                h('thead', {}, h('tr', {},
                    h('th', {}, 'Item / Description'), h('th', {}, 'HSN'),
                    h('th', {}, 'Qty'), h('th', {}, 'Rate'), h('th', {}, 'GST%'),
                    h('th', { style: { textAlign: 'right' } }, 'Line Total'), h('th', {})
                )),
                h('tbody', {}, ...lines.map((_, i) => lineRow(i)))
            )
        );
        recalc();
    }

    function recalc() {
        const isInter = $('#f-supply').value === '1';
        let sub = 0,
            gst = 0,
            cgst = 0,
            sgst = 0,
            igst = 0;
        lines.forEach((l, i) => {
            const amount = (l.quantity || 0) * (l.unit_price || 0);
            const g = amount * (l.gst_rate || 0) / 100;
            sub += amount;
            gst += g;
            if (isInter) igst += g;
            else {
                cgst += g / 2;
                sgst += g / 2;
            }
            const node = document.getElementById(`line-total-${i}`);
            if (node) node.textContent = money(amount + g);
        });
        const disc = parseFloat(($('#f-discount') || {}).value || 0) || 0;
        const total = sub + gst - disc;
        $('#sum-sub').textContent = money(sub);
        $('#sum-gst').innerHTML = isInter ?
            `IGST</span><span>${money(igst)}` :
            `CGST + SGST</span><span>${money(gst)}`;
        $('#sum-cgst-row').style.display = isInter ? 'none' : 'flex';
        $('#sum-sgst-row').style.display = isInter ? 'none' : 'flex';
        $('#sum-igst-row').style.display = isInter ? 'flex' : 'none';
        $('#sum-cgst').textContent = money(cgst);
        $('#sum-sgst').textContent = money(sgst);
        $('#sum-igst').textContent = money(igst);
        $('#sum-total').textContent = money(total);
    }

    formBody.append(
        h('button', {
                type: 'button',
                class: 'btn btn-secondary btn-sm',
                style: { marginTop: '10px' },
                onClick: () => {
                    lines.push({ description: '', hsn_code: '', quantity: 1, unit_price: 0, gst_rate: 18 });
                    redrawLines();
                }
            },
            '+ Add line'
        ),
        // Totals + notes
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 360px', gap: '24px', marginTop: '24px' } },
            h('div', {},
                h('div', { class: 'field' },
                    h('label', {}, 'Notes'),
                    h('textarea', { id: 'f-notes', placeholder: 'Thank you for your business…' }, defaults.notes)
                )
            ),
            h('div', { class: 'totals-box' },
                h('div', { class: 'totals-row' }, h('span', {}, 'Subtotal'), h('span', { id: 'sum-sub' }, money(0))),
                h('div', { class: 'totals-row', id: 'sum-cgst-row' }, h('span', {}, 'CGST'), h('span', { id: 'sum-cgst' }, money(0))),
                h('div', { class: 'totals-row', id: 'sum-sgst-row' }, h('span', {}, 'SGST'), h('span', { id: 'sum-sgst' }, money(0))),
                h('div', { class: 'totals-row', id: 'sum-igst-row', style: { display: 'none' } }, h('span', {}, 'IGST'), h('span', { id: 'sum-igst' }, money(0))),
                h('div', { class: 'totals-row' },
                    h('span', {}, 'Discount'),
                    h('input', {
                        type: 'number',
                        id: 'f-discount',
                        min: '0',
                        step: '0.01',
                        value: defaults.discount || 0,
                        style: { width: '120px', textAlign: 'right' },
                        oninput: recalc
                    })
                ),
                h('div', { class: 'totals-row grand' }, h('span', {}, 'Total'), h('span', { id: 'sum-total' }, money(0)))
            )
        )
    );

    $('#f-supply').addEventListener('change', recalc);
    redrawLines();

    formCard.append(h('div', { class: 'modal-footer' },
        h('button', { class: 'btn btn-secondary', onClick: () => navigate('invoices') }, 'Cancel'),
        h('button', { class: 'btn btn-primary', onClick: saveInvoice }, editId ? 'Update Invoice' : 'Create Invoice')
    ));

    async function saveInvoice() {
        const customer_id = parseInt($('#f-customer').value, 10);
        if (!customer_id) { toast('Select a customer', 'error'); return; }
        if (lines.length === 0) { toast('Add at least one line', 'error'); return; }
        for (const l of lines) {
            if (!l.description || !l.description.trim()) { toast('All lines need a description', 'error'); return; }
            if (!(l.quantity > 0)) { toast('Quantity must be > 0', 'error'); return; }
            if (l.unit_price < 0) { toast('Price must be >= 0', 'error'); return; }
        }
        const body = {
            customer_id,
            invoice_number: $('#f-number').value.trim() || undefined,
            issue_date: $('#f-issue').value,
            due_date: $('#f-due').value || null,
            status: $('#f-status').value,
            is_interstate: $('#f-supply').value === '1' ? 1 : 0,
            discount: parseFloat($('#f-discount').value) || 0,
            notes: $('#f-notes').value || null,
            items: lines
        };
        try {
            const res = editId ?
                await api('/invoices/' + editId, { method: 'PUT', body: JSON.stringify(body) }) :
                await api('/invoices', { method: 'POST', body: JSON.stringify(body) });
            toast(editId ? 'Invoice updated' : 'Invoice created', 'success');
            navigate('invoice-view', { id: res.id });
        } catch (e) { toast(e.message, 'error'); }
    }

    async function onAddCustomer() {
        const saved = await customerForm();
        if (saved) {
            customers.push(saved);
            const sel = $('#f-customer');
            sel.append(h('option', { value: saved.id, selected: true }, saved.name));
            sel.value = saved.id;
        }
    }
}

// ==========================================================
// Customers
// ==========================================================
async function renderCustomers(root) {
    root.append(
        h('div', { class: 'page-header' },
            h('div', {},
                h('h1', { class: 'page-title' }, 'Customers'),
                h('div', { class: 'page-sub' }, 'Your clients and their GST details')
            ),
            h('button', {
                class: 'btn btn-primary',
                onClick: async() => {
                    await customerForm();
                    render();
                }
            }, '+ New Customer')
        )
    );
    const searchBox = h('input', { class: 'search', placeholder: 'Search by name, email, GSTIN…' });
    root.append(h('div', { class: 'toolbar' }, searchBox));
    const tableCard = h('div', { class: 'card' });
    root.append(tableCard);

    async function load() {
        tableCard.innerHTML = '<div class="empty">Loading…</div>';
        const q = searchBox.value.trim();
        const rows = await api('/customers' + (q ? '?q=' + encodeURIComponent(q) : ''));
        tableCard.innerHTML = '';
        if (rows.length === 0) {
            tableCard.append(h('div', { class: 'empty' }, 'No customers yet.'));
            return;
        }
        tableCard.append(h('div', { class: 'table-wrap' },
            h('table', { class: 'data' },
                h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Email'), h('th', {}, 'Phone'), h('th', {}, 'GSTIN'), h('th', {}, 'State'), h('th', {}, ''))),
                h('tbody', {}, ...rows.map(c =>
                    h('tr', {},
                        h('td', { style: { fontWeight: 500 } }, c.name),
                        h('td', {}, c.email || '-'),
                        h('td', {}, c.phone || '-'),
                        h('td', {}, c.gstin || '-'),
                        h('td', {}, c.state || '-'),
                        h('td', { style: { textAlign: 'right' } },
                            h('button', {
                                class: 'btn btn-sm btn-ghost',
                                onClick: async() => {
                                    await customerForm(c);
                                    load();
                                }
                            }, 'Edit'),
                            h('button', {
                                class: 'btn btn-sm btn-ghost',
                                onClick: async() => {
                                    if (!(await confirmDialog('Delete this customer?', { danger: true }))) return;
                                    try {
                                        await api('/customers/' + c.id, { method: 'DELETE' });
                                        toast('Deleted', 'success');
                                        load();
                                    } catch (e) { toast(e.message, 'error'); }
                                }
                            }, 'Delete')
                        )
                    )
                ))
            )
        ));
    }
    searchBox.addEventListener('input', load);
    load();
}

async function customerForm(existing) {
    const form = h('form', { class: 'form-grid' },
        h('div', { class: 'field full' }, h('label', {}, 'Name *'),
            h('input', { name: 'name', required: true, value: existing ? .name || '' })),
        h('div', { class: 'field' }, h('label', {}, 'Email'),
            h('input', { type: 'email', name: 'email', value: existing ? .email || '' })),
        h('div', { class: 'field' }, h('label', {}, 'Phone'),
            h('input', { name: 'phone', value: existing ? .phone || '' })),
        h('div', { class: 'field' }, h('label', {}, 'GSTIN'),
            h('input', { name: 'gstin', value: existing ? .gstin || '' })),
        h('div', { class: 'field' }, h('label', {}, 'State'),
            h('input', { name: 'state', value: existing ? .state || '' })),
        h('div', { class: 'field full' }, h('label', {}, 'Address'),
            h('textarea', { name: 'address' }, existing ? .address || ''))
    );
    const result = await openModal({
        title: existing ? 'Edit customer' : 'New customer',
        body: form,
        footer: (close) => [
            h('button', { class: 'btn btn-secondary', onClick: () => close(null) }, 'Cancel'),
            h('button', {
                class: 'btn btn-primary',
                onClick: () => {
                    const body = Object.fromEntries(new FormData(form).entries());
                    if (!body.name || !body.name.trim()) { toast('Name is required', 'error'); return; }
                    close(body);
                }
            }, 'Save')
        ]
    });
    if (!result) return null;
    try {
        const saved = existing ?
            await api('/customers/' + existing.id, { method: 'PUT', body: JSON.stringify(result) }) :
            await api('/customers', { method: 'POST', body: JSON.stringify(result) });
        toast('Customer saved', 'success');
        return saved;
    } catch (e) { toast(e.message, 'error'); return null; }
}

// ==========================================================
// Items
// ==========================================================
async function renderItems(root) {
    root.append(
        h('div', { class: 'page-header' },
            h('div', {},
                h('h1', { class: 'page-title' }, 'Items / Services'),
                h('div', { class: 'page-sub' }, 'Product catalog with prices and GST rates')
            ),
            h('button', {
                class: 'btn btn-primary',
                onClick: async() => {
                    await itemForm();
                    render();
                }
            }, '+ New Item')
        )
    );
    const search = h('input', { class: 'search', placeholder: 'Search by name, HSN…' });
    root.append(h('div', { class: 'toolbar' }, search));
    const card = h('div', { class: 'card' });
    root.append(card);
    async function load() {
        card.innerHTML = '<div class="empty">Loading…</div>';
        const q = search.value.trim();
        const rows = await api('/items' + (q ? '?q=' + encodeURIComponent(q) : ''));
        card.innerHTML = '';
        if (rows.length === 0) { card.append(h('div', { class: 'empty' }, 'No items yet.')); return; }
        card.append(h('div', { class: 'table-wrap' },
            h('table', { class: 'data' },
                h('thead', {}, h('tr', {},
                    h('th', {}, 'Name'), h('th', {}, 'Description'),
                    h('th', {}, 'HSN'),
                    h('th', { class: 'num' }, 'Price'),
                    h('th', { class: 'num' }, 'GST'),
                    h('th', {}, 'Unit'), h('th', {}, '')
                )),
                h('tbody', {}, ...rows.map(it => h('tr', {},
                    h('td', { style: { fontWeight: 500 } }, it.name),
                    h('td', { style: { color: 'var(--text-muted)' } }, (it.description || '').slice(0, 60)),
                    h('td', {}, it.hsn_code || '-'),
                    h('td', { class: 'num' }, money(it.unit_price)),
                    h('td', { class: 'num' }, it.gst_rate + '%'),
                    h('td', {}, it.unit || 'pcs'),
                    h('td', { style: { textAlign: 'right' } },
                        h('button', {
                            class: 'btn btn-sm btn-ghost',
                            onClick: async() => {
                                await itemForm(it);
                                load();
                            }
                        }, 'Edit'),
                        h('button', {
                            class: 'btn btn-sm btn-ghost',
                            onClick: async() => {
                                if (!(await confirmDialog('Delete this item?', { danger: true }))) return;
                                try {
                                    await api('/items/' + it.id, { method: 'DELETE' });
                                    toast('Deleted', 'success');
                                    load();
                                } catch (e) { toast(e.message, 'error'); }
                            }
                        }, 'Delete')
                    )
                )))
            )
        ));
    }
    search.addEventListener('input', load);
    load();
}

async function itemForm(existing) {
    const form = h('form', { class: 'form-grid' },
        h('div', { class: 'field full' }, h('label', {}, 'Name *'),
            h('input', { name: 'name', required: true, value: existing ? .name || '' })),
        h('div', { class: 'field full' }, h('label', {}, 'Description'),
            h('textarea', { name: 'description' }, existing ? .description || '')),
        h('div', { class: 'field' }, h('label', {}, 'Unit price *'),
            h('input', { type: 'number', step: '0.01', min: '0', name: 'unit_price', value: existing ? .unit_price ? ? 0, required: true })),
        h('div', { class: 'field' }, h('label', {}, 'GST rate (%) *'),
            h('select', { name: 'gst_rate' },
                ...[0, 3, 5, 12, 18, 28].map(r => h('option', { value: r, selected: Number(existing ? .gst_rate) === r }, r + '%'))
            )),
        h('div', { class: 'field' }, h('label', {}, 'HSN / SAC code'),
            h('input', { name: 'hsn_code', value: existing ? .hsn_code || '' })),
        h('div', { class: 'field' }, h('label', {}, 'Unit'),
            h('input', { name: 'unit', value: existing ? .unit || 'pcs' }))
    );
    const result = await openModal({
        title: existing ? 'Edit item' : 'New item',
        body: form,
        footer: (close) => [
            h('button', { class: 'btn btn-secondary', onClick: () => close(null) }, 'Cancel'),
            h('button', {
                class: 'btn btn-primary',
                onClick: () => {
                    const body = Object.fromEntries(new FormData(form).entries());
                    if (!body.name || !body.name.trim()) { toast('Name is required', 'error'); return; }
                    if (parseFloat(body.unit_price) < 0) { toast('Price cannot be negative', 'error'); return; }
                    close(body);
                }
            }, 'Save')
        ]
    });
    if (!result) return null;
    try {
        const saved = existing ?
            await api('/items/' + existing.id, { method: 'PUT', body: JSON.stringify(result) }) :
            await api('/items', { method: 'POST', body: JSON.stringify(result) });
        toast('Item saved', 'success');
        return saved;
    } catch (e) { toast(e.message, 'error'); return null; }
}

// ==========================================================
// Reports
// ==========================================================
async function renderReports(root) {
    root.append(
        h('div', { class: 'page-header' },
            h('div', {},
                h('h1', { class: 'page-title' }, 'Reports'),
                h('div', { class: 'page-sub' }, 'GST summary and audit trail')
            )
        )
    );
    const from = h('input', { type: 'date' });
    const to = h('input', { type: 'date' });
    const reload = h('button', { class: 'btn btn-secondary', onClick: () => load() }, 'Apply');
    root.append(h('div', { class: 'toolbar' },
        h('label', {}, 'From', from),
        h('label', {}, 'To', to),
        reload
    ));

    const gstCard = h('div', { class: 'card', style: { marginBottom: '20px' } });
    const auditCard = h('div', { class: 'card' });
    root.append(gstCard, auditCard);

    async function load() {
        const qs = new URLSearchParams();
        if (from.value) qs.set('from', from.value);
        if (to.value) qs.set('to', to.value);
        const [gst, audit] = await Promise.all([
            api('/reports/gst?' + qs.toString()),
            api('/reports/audit')
        ]);
        gstCard.innerHTML = '';
        gstCard.append(
            h('div', { class: 'card-header' }, h('h3', { class: 'card-title' }, 'GST Summary by Rate')),
            h('div', { class: 'table-wrap' },
                gst.length === 0 ? h('div', { class: 'empty' }, 'No taxable transactions in this range.') :
                h('table', { class: 'data' },
                    h('thead', {}, h('tr', {},
                        h('th', {}, 'GST Rate'),
                        h('th', { class: 'num' }, 'Taxable Value'),
                        h('th', { class: 'num' }, 'CGST'),
                        h('th', { class: 'num' }, 'SGST'),
                        h('th', { class: 'num' }, 'IGST'),
                        h('th', { class: 'num' }, 'Total Tax')
                    )),
                    h('tbody', {}, ...gst.map(r => h('tr', {},
                        h('td', {}, r.gst_rate + '%'),
                        h('td', { class: 'num' }, money(r.taxable)),
                        h('td', { class: 'num' }, money(r.cgst)),
                        h('td', { class: 'num' }, money(r.sgst)),
                        h('td', { class: 'num' }, money(r.igst)),
                        h('td', { class: 'num', style: { fontWeight: 600 } }, money(r.total_gst))
                    )))
                )
            )
        );
        auditCard.innerHTML = '';
        auditCard.append(
            h('div', { class: 'card-header' }, h('h3', { class: 'card-title' }, 'Audit Trail (last 200)')),
            h('div', { class: 'table-wrap' },
                audit.length === 0 ? h('div', { class: 'empty' }, 'No audit events.') :
                h('table', { class: 'data' },
                    h('thead', {}, h('tr', {},
                        h('th', {}, 'When'), h('th', {}, 'User'), h('th', {}, 'Entity'),
                        h('th', {}, 'ID'), h('th', {}, 'Action'), h('th', {}, 'Details')
                    )),
                    h('tbody', {}, ...audit.map(a => h('tr', {},
                        h('td', {}, a.timestamp),
                        h('td', {}, a.user_email || '-'),
                        h('td', {}, a.entity_type),
                        h('td', {}, a.entity_id || '-'),
                        h('td', {}, a.action),
                        h('td', { style: { fontSize: '12px', color: 'var(--text-muted)', maxWidth: '360px', wordBreak: 'break-all' } },
                            a.details ? JSON.stringify(a.details) : '')
                    )))
                )
            )
        );
    }
    load();
}

// ==========================================================
// Settings
// ==========================================================
async function renderSettings(root) {
    const biz = State.business;
    root.append(
        h('div', { class: 'page-header' },
            h('div', {},
                h('h1', { class: 'page-title' }, 'Business Settings'),
                h('div', { class: 'page-sub' }, 'Configure invoicing details for your business')
            )
        )
    );
    const form = h('form', {
            class: 'form-grid',
            onSubmit: async(e) => {
                e.preventDefault();
                const body = Object.fromEntries(new FormData(form).entries());
                if (body.next_invoice_number) body.next_invoice_number = parseInt(body.next_invoice_number, 10);
                try {
                    const updated = await api('/businesses/' + biz.id, { method: 'PUT', body: JSON.stringify(body) });
                    State.business = updated;
                    toast('Saved', 'success');
                } catch (err) { toast(err.message, 'error'); }
            }
        },
        h('div', { class: 'field' }, h('label', {}, 'Business name'),
            h('input', { name: 'name', value: biz.name || '', required: true })),
        h('div', { class: 'field' }, h('label', {}, 'GSTIN'),
            h('input', { name: 'gstin', value: biz.gstin || '' })),
        h('div', { class: 'field' }, h('label', {}, 'Email'),
            h('input', { type: 'email', name: 'email', value: biz.email || '' })),
        h('div', { class: 'field' }, h('label', {}, 'Phone'),
            h('input', { name: 'phone', value: biz.phone || '' })),
        h('div', { class: 'field full' }, h('label', {}, 'Address'),
            h('textarea', { name: 'address' }, biz.address || '')),
        h('div', { class: 'field' }, h('label', {}, 'State'),
            h('input', { name: 'state', value: biz.state || '' })),
        h('div', { class: 'field' }, h('label', {}, 'Currency symbol'),
            h('input', { name: 'currency_symbol', value: biz.currency_symbol || '₹' })),
        h('div', { class: 'field' }, h('label', {}, 'Invoice prefix'),
            h('input', { name: 'invoice_prefix', value: biz.invoice_prefix || 'INV' })),
        h('div', { class: 'field' }, h('label', {}, 'Next invoice number'),
            h('input', { type: 'number', min: '1', name: 'next_invoice_number', value: biz.next_invoice_number || 1 })),
        h('div', { class: 'field full' },
            h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save changes')
        )
    );
    root.append(h('div', { class: 'card' }, h('div', { class: 'card-body' }, form)));
}

// ==========================================================
// Billing Admin
// ==========================================================
async function renderBillingAdmin(root) {
    if (State.user ? .role !== 'admin') {
        root.append(h('div', { class: 'empty' }, 'Admin access required for billing tools.'));
        return;
    }

    root.append(
        h('div', { class: 'page-header' },
            h('div', {},
                h('h1', { class: 'page-title' }, 'Billing Admin'),
                h('div', { class: 'page-sub' }, 'Internal billing controls, payment history, and invoice tracking')
            )
        )
    );

    const [config, localCustomers, localInvoices] = await Promise.all([
        api('/admin/billing/config-status'),
        api('/admin/billing/customers'),
        api('/admin/billing/invoices')
    ]);

    root.append(
        h('div', { class: 'card', style: { marginBottom: '20px' } },
            h('div', { class: 'card-body' },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
                    h('strong', {}, 'Billing mode:'),
                    h('span', { class: 'badge badge-paid' }, config.billingMode || 'internal')
                ),
                h('p', { class: 'form-hint', style: { marginBottom: 0 } },
                    'This dashboard uses local invoice data only. It is modeled after modern billing tools, but it is not connected to any external invoicing API.'
                )
            )
        )
    );

    const customerCard = h('div', { class: 'card', style: { marginBottom: '20px' } },
        h('div', { class: 'card-header' }, h('h3', { class: 'card-title' }, 'Customer Billing Management')),
        h('div', { class: 'table-wrap' },
            localCustomers.length === 0 ? h('div', { class: 'empty' }, 'No customers found.') :
            h('table', { class: 'data' },
                h('thead', {}, h('tr', {},
                    h('th', {}, 'Customer'),
                    h('th', {}, 'Email'),
                    h('th', { class: 'num' }, 'Invoices'),
                    h('th', { class: 'num' }, 'Outstanding'),
                    h('th', {}, '')
                )),
                h('tbody', {}, ...localCustomers.map((customer) => h('tr', {},
                    h('td', {}, customer.name),
                    h('td', {}, customer.email || '-'),
                    h('td', { class: 'num' }, String(customer.invoice_count || 0)),
                    h('td', { class: 'num' }, money(customer.outstanding_total || 0)),
                    h('td', { style: { textAlign: 'right' } },
                        h('button', {
                            class: 'btn btn-sm btn-secondary',
                            onClick: async() => {
                                toast('Customer billing data is managed locally.', 'success');
                            }
                        }, 'View')
                    )
                )))
            )
        )
    );
    root.append(customerCard);

    const invoicesCard = h('div', { class: 'card' },
        h('div', { class: 'card-header' }, h('h3', { class: 'card-title' }, 'Invoice Generation, Tracking, and Payments')),
        h('div', { class: 'table-wrap' },
            localInvoices.length === 0 ? h('div', { class: 'empty' }, 'No invoices found.') :
            h('table', { class: 'data' },
                h('thead', {}, h('tr', {},
                    h('th', {}, 'Invoice'),
                    h('th', {}, 'Customer'),
                    h('th', {}, 'Due'),
                    h('th', { class: 'num' }, 'Total'),
                    h('th', {}, 'Status'),
                    h('th', {}, '')
                )),
                h('tbody', {}, ...localInvoices.map((invoice) => h('tr', {},
                    h('td', {}, invoice.invoice_number),
                    h('td', {}, invoice.customer_name),
                    h('td', {}, invoice.due_date || '-'),
                    h('td', { class: 'num' }, money(invoice.total)),
                    h('td', {}, h('span', { class: 'badge badge-' + invoice.status }, invoice.status)),
                    h('td', { style: { textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
                        h('button', {
                            class: 'btn btn-sm btn-secondary',
                            onClick: async() => {
                                try {
                                    await api(`/admin/billing/invoices/${invoice.id}/send`, { method: 'POST' });
                                    toast('Invoice marked as sent', 'success');
                                    render();
                                } catch (err) {
                                    toast(err.message, 'error');
                                }
                            }
                        }, 'Mark Sent'),
                        h('button', {
                            class: 'btn btn-sm btn-secondary',
                            onClick: async() => {
                                try {
                                    await api(`/admin/billing/invoices/${invoice.id}/record-payment`, {
                                        method: 'POST',
                                        body: JSON.stringify({
                                            payment_method: invoice.payment_method || 'Bank Transfer',
                                            payment_date: today()
                                        })
                                    });
                                    toast('Payment recorded', 'success');
                                    render();
                                } catch (err) {
                                    toast(err.message, 'error');
                                }
                            }
                        }, 'Record Payment'),
                        h('button', {
                            class: 'btn btn-sm btn-secondary',
                            onClick: async() => {
                                try {
                                    const payments = await api(`/admin/billing/invoices/${invoice.id}/payments`);
                                    const body = payments.length === 0 ?
                                        h('p', {}, 'No payments recorded for this invoice.') :
                                        h('div', { class: 'table-wrap' },
                                            h('table', { class: 'data' },
                                                h('thead', {}, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Method'), h('th', { class: 'num' }, 'Amount'))),
                                                h('tbody', {}, ...payments.map((payment) => h('tr', {},
                                                    h('td', {}, payment.date || '-'),
                                                    h('td', {}, payment.method || '-'),
                                                    h('td', { class: 'num' }, money(payment.amount))
                                                )))
                                            )
                                        );

                                    await openModal({
                                        title: `Payment History - ${invoice.invoice_number}`,
                                        wide: true,
                                        body,
                                        footer: (close) => [
                                            h('button', { class: 'btn btn-secondary', onClick: () => close(true) }, 'Close')
                                        ]
                                    });
                                } catch (err) {
                                    toast(err.message, 'error');
                                }
                            }
                        }, 'Payments')
                    )
                )))
            )
        )
    );

    root.append(invoicesCard);
}

// ---------- Boot ----------
render();
/* Clean frontend entrypoint for the internal billing app */
function createSafeStorage() {
    try {
        const testKey = '__storage_test__';
        window.localStorage.setItem(testKey, '1');
        window.localStorage.removeItem(testKey);
        return window.localStorage;
    } catch {
        const memory = new Map();
        return {
            getItem: (key) => (memory.has(key) ? memory.get(key) : null),
            setItem: (key, value) => { memory.set(key, String(value)); },
            removeItem: (key) => { memory.delete(key); }
        };
    }
}

const storage = createSafeStorage();

function readStoredJson(key) {
    try {
        const value = storage.getItem(key);
        return value ? JSON.parse(value) : null;
    } catch {
        return null;
    }
}

const State = {
    token: storage.getItem('token') || null,
    user: readStoredJson('user'),
    business: null,
    route: 'dashboard'
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (key === 'class') node.className = value;
        else if (key === 'style' && value && typeof value === 'object') Object.assign(node.style, value);
        else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
        else if (key === 'html') node.innerHTML = value;
        else if (value !== false && value != null) node.setAttribute(key, value);
    }
    for (const child of children.flat()) {
        if (child == null || child === false) continue;
        node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
}

function money(value, symbol) {
    const curr = symbol || ((State.business && State.business.currency_symbol) || '₹');
    const amount = (Math.round((Number(value) || 0) * 100) / 100).toFixed(2);
    const [whole, fraction] = amount.split('.');
    return curr + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + fraction;
}

function fmtDate(value) {
    if (!value) return '-';
    try {
        return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return value;
    }
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
}

async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (State.token) headers.Authorization = `Bearer ${State.token}`;
    const response = await fetch('/api' + path, {...options, headers });
    if (response.status === 401) {
        logout();
        throw new Error('Session expired');
    }
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) throw new Error((data && data.error) || response.statusText || 'Request failed');
    return data;
}

function toast(message, type = 'info') {
    const root = $('#toast-root');
    if (!root) return;
    const note = el('div', { class: `toast ${type}` }, message);
    root.append(note);
    setTimeout(() => {
        note.style.opacity = '0';
        note.style.transition = 'opacity .2s';
        setTimeout(() => note.remove(), 200);
    }, 2400);
}

function openModal({ title, body, wide = false, footer }) {
    return new Promise((resolve) => {
        const root = $('#modal-root');
        root.innerHTML = '';
        const close = (value) => {
            root.innerHTML = '';
            resolve(value);
        };
        const modal = el('div', { class: 'modal-overlay', onClick: (e) => { if (e.target === modal) close(null); } },
            el('div', { class: `modal${wide ? ' wide' : ''}` },
                el('div', { class: 'modal-header' },
                    el('h3', { class: 'modal-title' }, title),
                    el('button', { class: 'close-x', onClick: () => close(null) }, '×')
                ),
                el('div', { class: 'modal-body' }, body || ''),
                footer ? el('div', { class: 'modal-footer' }, footer(close)) : null
            )
        );
        root.append(modal);
    });
}

async function confirmDialog(message, danger = false) {
    return openModal({
        title: 'Confirm',
        body: el('p', {}, message),
        footer: (close) => [
            el('button', { class: 'btn btn-secondary', onClick: () => close(false) }, 'Cancel'),
            el('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onClick: () => close(true) }, danger ? 'Delete' : 'Confirm')
        ]
    });
}

function saveSession(data) {
    State.token = data.token;
    State.user = data.user;
    try {
        storage.setItem('token', data.token);
        storage.setItem('user', JSON.stringify(data.user));
        if (data.businessId) storage.setItem('businessId', String(data.businessId));
    } catch {
        // Some browser contexts disallow persistent storage; the session can still continue in-memory.
    }
}

function logout() {
    try {
        storage.removeItem('token');
        storage.removeItem('user');
        storage.removeItem('businessId');
    } catch {
        // Ignore storage failures during sign-out.
    }
    State.token = null;
    State.user = null;
    State.business = null;
    State.route = 'dashboard';
    render();
}

function renderAuth() {
    const app = $('#app');
    app.innerHTML = '';
    let mode = 'login';
    const card = el('div', { class: 'auth-card' });

    const paint = () => {
        card.innerHTML = '';
        const err = el('div', { class: 'form-err', style: { display: 'none' } });
        const form = el('form', {
                class: 'form-grid',
                style: { gridTemplateColumns: '1fr' },
                onSubmit: async(e) => {
                    e.preventDefault();
                    err.style.display = 'none';
                    try {
                        const body = Object.fromEntries(new FormData(form).entries());
                        const result = await api(mode === 'login' ? '/auth/login' : '/auth/signup', {
                            method: 'POST',
                            body: JSON.stringify(body)
                        });
                        saveSession(result);
                        render();
                    } catch (error) {
                        err.textContent = error.message;
                        err.style.display = 'block';
                    }
                }
            },
            el('div', { class: 'auth-brand' },
                el('div', { style: { fontSize: '40px' } }, '🧾'),
                el('h1', {}, 'Invoice Software'),
                el('p', {}, 'Internal billing and GST management')
            ),
            el('div', { class: 'auth-tabs' },
                el('button', {
                    type: 'button',
                    class: `auth-tab ${mode === 'login' ? 'active' : ''}`,
                    onClick: () => {
                        mode = 'login';
                        paint();
                    }
                }, 'Log in'),
                el('button', {
                    type: 'button',
                    class: `auth-tab ${mode === 'signup' ? 'active' : ''}`,
                    onClick: () => {
                        mode = 'signup';
                        paint();
                    }
                }, 'Sign up')
            ),
            mode === 'signup' ? [
                el('div', { class: 'field' }, el('label', {}, 'Your name'), el('input', { name: 'name', required: true, placeholder: 'Jane Doe' })),
                el('div', { class: 'field' }, el('label', {}, 'Business name'), el('input', { name: 'businessName', placeholder: 'Acme Pvt Ltd' })),
                el('div', { class: 'field' }, el('label', {}, 'GSTIN (optional)'), el('input', { name: 'gstin', placeholder: '29ABCDE1234F1Z5' })),
                el('div', { class: 'field' }, el('label', {}, 'State (optional)'), el('input', { name: 'state', placeholder: 'Karnataka' }))
            ] : [],
            el('div', { class: 'field' }, el('label', {}, 'Email'), el('input', { type: 'email', name: 'email', required: true, placeholder: 'you@company.com' })),
            el('div', { class: 'field' }, el('label', {}, 'Password'), el('input', { type: 'password', name: 'password', minlength: 6, required: true, placeholder: '••••••••' })),
            err,
            el('button', { type: 'submit', class: 'btn btn-primary btn-block', style: { marginTop: '8px' } }, mode === 'login' ? 'Log in' : 'Create account')
        );
        card.append(form);
    };

    paint();
    app.append(el('div', { class: 'auth-wrap' }, card));
}

function renderShell(content) {
    const nav = [
        ['dashboard', 'Dashboard', '📊'],
        ['invoices', 'Invoices', '🧾'],
        ['customers', 'Customers', '👥'],
        ['items', 'Items', '📦'],
        ['reports', 'Reports', '📈'],
        ...((State.user && State.user.role === 'admin') ? [
            ['billing-admin', 'Billing Admin', '💳']
        ] : []), ['settings', 'Settings', '⚙️']
    ];

    const sidebar = el('aside', { class: 'sidebar' },
        el('div', { class: 'brand' }, el('div', { class: 'brand-icon' }, '🧾'), el('span', {}, 'Invoice')),
        el('div', { class: 'nav-section' }, 'Main'),
        ...nav.map(([id, label, icon]) => el('a', {
            href: '#' + id,
            class: `nav-item ${State.route === id ? 'active' : ''}`,
            onClick: (e) => {
                e.preventDefault();
                navigate(id);
            }
        }, el('span', {}, icon), el('span', {}, label))),
        el('div', { class: 'nav-spacer' }),
        el('div', { class: 'user-box' },
            el('div', { class: 'user-avatar' }, (((State.user && State.user.name) || '?').slice(0, 1).toUpperCase())),
            el('div', {},
                el('div', { class: 'name' }, (State.user && State.user.name) || ''),
                el('div', { class: 'email' }, (State.user && State.user.email) || '')
            )
        ),
        el('button', { class: 'logout', onClick: logout }, 'Sign out')
    );

    const app = $('#app');
    app.innerHTML = '';
    app.append(el('div', { class: 'layout' }, sidebar, el('main', { class: 'main' }, content)));
}

function navigate(route, params = {}) {
    State.route = route;
    State.params = params;
    render();
}

async function render() {
    if (!State.token) {
        renderAuth();
        return;
    }
    if (!State.business) {
        try {
            State.business = await api('/businesses/current');
        } catch {
            logout();
            return;
        }
    }
    const content = el('div');
    renderShell(content);
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

function kpiCard(accent, icon, label, value) {
    return el('div', { class: 'kpi-card' },
        el('div', { class: `kpi-accent accent-${accent}` }, icon),
        el('div', { class: 'kpi-label' }, label),
        el('div', { class: 'kpi-value' }, value)
    );
}

async function renderDashboard(root) {
    root.append(
        el('div', { class: 'page-header' },
            el('div', {},
                el('h1', { class: 'page-title' }, 'Dashboard'),
                el('div', { class: 'page-sub' }, `${State.business.name}`)
            ),
            el('button', { class: 'btn btn-primary', onClick: () => navigate('invoice-new') }, '+ New Invoice')
        ),
        el('div', { class: 'empty' }, 'Loading...')
    );

    const summary = await api('/reports/summary');
    root.lastElementChild.remove();
    root.append(
        el('div', { class: 'kpi-grid' },
            kpiCard('blue', '💰', 'Paid Revenue', money(summary.totalRevenue)),
            kpiCard('orange', '⏳', 'Outstanding', money(summary.outstanding)),
            kpiCard('purple', '📑', 'GST Collected', money(summary.gstCollected)),
            kpiCard('green', '🧾', 'Invoices', String(summary.totalInvoices))
        ),
        el('div', { class: 'detail-grid' },
            el('div', { class: 'card' },
                el('div', { class: 'card-header' }, el('h3', { class: 'card-title' }, 'Recent Invoices')),
                el('div', { class: 'table-wrap' },
                    summary.recent.length === 0 ? el('div', { class: 'empty' }, 'No invoices yet.') :
                    el('table', { class: 'data' },
                        el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, 'Customer'), el('th', {}, 'Date'), el('th', { class: 'num' }, 'Total'), el('th', {}, 'Status'))),
                        el('tbody', {}, ...summary.recent.map(inv => el('tr', { class: 'clickable', onClick: () => navigate('invoice-view', { id: inv.id }) },
                            el('td', {}, inv.invoice_number),
                            el('td', {}, inv.customer_name),
                            el('td', {}, fmtDate(inv.issue_date)),
                            el('td', { class: 'num' }, money(inv.total)),
                            el('td', {}, el('span', { class: `badge badge-${inv.status}` }, inv.status))
                        )))
                    )
                )
            ),
            el('div', { class: 'card' },
                el('div', { class: 'card-header' }, el('h3', { class: 'card-title' }, 'Top Customers')),
                el('div', { class: 'table-wrap' },
                    summary.topCustomers.length === 0 ? el('div', { class: 'empty' }, 'No customers yet.') :
                    el('table', { class: 'data' },
                        el('thead', {}, el('tr', {}, el('th', {}, 'Customer'), el('th', { class: 'num' }, 'Invoices'), el('th', { class: 'num' }, 'Total'))),
                        el('tbody', {}, ...summary.topCustomers.map(c => el('tr', {},
                            el('td', {}, c.name),
                            el('td', { class: 'num' }, String(c.invoices)),
                            el('td', { class: 'num' }, money(c.total))
                        )))
                    )
                )
            )
        )
    );
}

async function renderInvoices(root) {
    root.append(
        el('div', { class: 'page-header' },
            el('div', {}, el('h1', { class: 'page-title' }, 'Invoices'), el('div', { class: 'page-sub' }, 'Create, manage, and track invoices')),
            el('button', { class: 'btn btn-primary', onClick: () => navigate('invoice-new') }, '+ New Invoice')
        )
    );

    const toolbar = el('div', { class: 'toolbar' },
        el('input', { class: 'search', placeholder: 'Search invoice, customer, notes...' }),
        el('select', {}, el('option', { value: '' }, 'All statuses'), ...['draft', 'sent', 'paid', 'overdue', 'cancelled'].map(s => el('option', { value: s }, s))),
        el('button', { class: 'btn btn-secondary', type: 'button' }, 'Apply')
    );
    root.append(toolbar);

    const card = el('div', { class: 'card' }, el('div', { class: 'empty' }, 'Loading...'));
    root.append(card);

    async function load() {
        const [searchInput, statusSelect] = $$('input, select', toolbar);
        const q = searchInput.value.trim();
        const status = statusSelect.value;
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        if (status) params.set('status', status);
        const rows = await api('/invoices?' + params.toString());
        card.innerHTML = '';
        if (rows.length === 0) {
            card.append(el('div', { class: 'empty' }, 'No invoices found.'));
            return;
        }
        card.append(el('div', { class: 'table-wrap' },
            el('table', { class: 'data' },
                el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, 'Customer'), el('th', {}, 'Issue Date'), el('th', { class: 'num' }, 'Total'), el('th', {}, 'Status'))),
                el('tbody', {}, ...rows.map(inv => el('tr', { class: 'clickable', onClick: () => navigate('invoice-view', { id: inv.id }) },
                    el('td', {}, inv.invoice_number),
                    el('td', {}, inv.customer_name),
                    el('td', {}, fmtDate(inv.issue_date)),
                    el('td', { class: 'num' }, money(inv.total)),
                    el('td', {}, el('span', { class: `badge badge-${inv.status}` }, inv.status))
                )))
            )
        ));
    }

    $('button', toolbar).addEventListener('click', load);
    $('input', toolbar).addEventListener('input', () => load());
    $('select', toolbar).addEventListener('change', load);
    load();
}

async function openInvoicePdf(id) {
    const response = await fetch(`/api/invoices/${id}/pdf`, { headers: { Authorization: `Bearer ${State.token}` } });
    if (!response.ok) throw new Error('Failed to open PDF');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function renderInvoiceView(root, id) {
    const invoice = await api('/invoices/' + id);
    const customer = invoice.customer || {};
    root.append(
        el('div', { class: 'page-header' },
            el('div', {}, el('h1', { class: 'page-title' }, `Invoice ${invoice.invoice_number}`), el('div', { class: 'page-sub' }, el('span', { class: `badge badge-${invoice.status}` }, invoice.status))),
            el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
                el('button', { class: 'btn btn-secondary', onClick: () => navigate('invoices') }, '← Back'),
                el('button', { class: 'btn btn-secondary', onClick: () => openInvoicePdf(invoice.id) }, 'PDF'),
                invoice.status !== 'paid' ? el('button', { class: 'btn btn-primary', onClick: () => markPaid(invoice.id) }, 'Mark Paid') : null,
                el('button', { class: 'btn btn-secondary', onClick: () => navigate('invoice-edit', { id: invoice.id }) }, 'Edit'),
                el('button', { class: 'btn btn-danger', onClick: () => deleteInvoice(invoice.id) }, 'Delete')
            )
        ),
        el('div', { class: 'card' },
            el('div', { class: 'card-body' },
                el('div', { class: 'detail-grid' },
                    el('div', { class: 'detail-section' }, el('h4', {}, 'From'), el('p', { style: { fontWeight: '600' } }, State.business.name), State.business.address ? el('p', {}, State.business.address) : null, State.business.gstin ? el('p', {}, `GSTIN: ${State.business.gstin}`) : null),
                    el('div', { class: 'detail-section' }, el('h4', {}, 'Bill To'), el('p', { style: { fontWeight: '600' } }, customer.name || ''), customer.address ? el('p', {}, customer.address) : null, customer.gstin ? el('p', {}, `GSTIN: ${customer.gstin}`) : null),
                    el('div', { class: 'detail-section' }, el('h4', {}, 'Issue Date'), el('p', {}, fmtDate(invoice.issue_date))),
                    el('div', { class: 'detail-section' }, el('h4', {}, 'Due Date'), el('p', {}, fmtDate(invoice.due_date))),
                    el('div', { class: 'detail-section' }, el('h4', {}, 'Supply Type'), el('p', {}, invoice.is_interstate ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)')),
                    invoice.payment_method ? el('div', { class: 'detail-section' }, el('h4', {}, 'Payment'), el('p', {}, `${invoice.payment_method}${invoice.payment_date ? ' on ' + fmtDate(invoice.payment_date) : ''}`)) : null
                ),
                el('div', { class: 'table-wrap' },
                    el('table', { class: 'data' },
                        el('thead', {}, el('tr', {}, el('th', {}, 'Description'), el('th', {}, 'HSN'), el('th', { class: 'num' }, 'Qty'), el('th', { class: 'num' }, 'Rate'), el('th', { class: 'num' }, 'GST%'), el('th', { class: 'num' }, 'Total'))),
                        el('tbody', {}, ...invoice.items.map(item => el('tr', {},
                            el('td', {}, item.description),
                            el('td', {}, item.hsn_code || '-'),
                            el('td', { class: 'num' }, String(item.quantity)),
                            el('td', { class: 'num' }, money(item.unit_price)),
                            el('td', { class: 'num' }, `${item.gst_rate}%`),
                            el('td', { class: 'num' }, money(item.total))
                        )))
                    )
                ),
                el('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: '20px' } },
                    el('div', { class: 'totals-box', style: { minWidth: '320px' } },
                        row('Subtotal', money(invoice.subtotal)),
                        invoice.is_interstate ? row('IGST', money(invoice.igst_total)) : [row('CGST', money(invoice.cgst_total)), row('SGST', money(invoice.sgst_total))],
                        invoice.discount > 0 ? row('Discount', '- ' + money(invoice.discount)) : null,
                        el('div', { class: 'totals-row grand' }, el('span', {}, 'Total'), el('span', {}, money(invoice.total)))
                    )
                )
            )
        )
    );
}

function row(label, value) {
    return el('div', { class: 'totals-row' }, el('span', {}, label), el('span', {}, value));
}

async function markPaid(id) {
    const form = el('form', { class: 'form-grid' },
        el('div', { class: 'field' }, el('label', {}, 'Payment method'), el('select', { name: 'payment_method' }, ...['Bank Transfer', 'UPI', 'Cash', 'Cheque', 'Credit Card', 'Other'].map(item => el('option', {}, item)))),
        el('div', { class: 'field' }, el('label', {}, 'Payment date'), el('input', { type: 'date', name: 'payment_date', value: today() }))
    );
    const values = await openModal({
        title: 'Mark as paid',
        body: form,
        footer: (close) => [
            el('button', { class: 'btn btn-secondary', onClick: () => close(null) }, 'Cancel'),
            el('button', { class: 'btn btn-primary', onClick: () => close(Object.fromEntries(new FormData(form).entries())) }, 'Save')
        ]
    });
    if (!values) return;
    await api(`/invoices/${id}/mark-paid`, { method: 'POST', body: JSON.stringify(values) });
    toast('Invoice marked as paid', 'success');
    render();
}

async function deleteInvoice(id) {
    if (!(await confirmDialog('Delete this invoice permanently?', true))) return;
    await api('/invoices/' + id, { method: 'DELETE' });
    toast('Invoice deleted', 'success');
    navigate('invoices');
}

async function renderInvoiceForm(root, editId) {
    const [customers, items] = await Promise.all([api('/customers'), api('/items')]);
    const invoice = editId ? await api('/invoices/' + editId) : null;
    const data = invoice ? {
        customer_id: String(invoice.customer_id),
        issue_date: invoice.issue_date,
        due_date: invoice.due_date || '',
        is_interstate: !!invoice.is_interstate,
        notes: invoice.notes || '',
        status: invoice.status,
        discount: invoice.discount || 0,
        invoice_number: invoice.invoice_number,
        lines: invoice.items.map(item => ({ description: item.description, hsn_code: item.hsn_code || '', quantity: item.quantity, unit_price: item.unit_price, gst_rate: item.gst_rate, item_id: item.item_id || null }))
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
        el('div', { class: 'page-header' },
            el('div', {}, el('h1', { class: 'page-title' }, editId ? 'Edit Invoice' : 'New Invoice'), el('div', { class: 'page-sub' }, editId ? invoice.invoice_number : 'Fill in the details below')),
            el('button', { class: 'btn btn-secondary', onClick: () => navigate('invoices') }, '← Cancel')
        )
    );

    const formCard = el('div', { class: 'card' });
    root.append(formCard);
    const body = el('div', { class: 'card-body' });
    formCard.append(body);

    const fields = el('div', { class: 'form-grid three', style: { marginBottom: '24px' } },
        el('div', { class: 'field' }, el('label', {}, 'Customer *'), el('select', { id: 'inv-customer' }, el('option', { value: '' }, '— Select customer —'), ...customers.map(c => el('option', { value: c.id, selected: String(c.id) === data.customer_id }, c.name)))),
        el('div', { class: 'field' }, el('label', {}, 'Invoice #'), el('input', { id: 'inv-number', value: data.invoice_number, placeholder: 'Auto-generated' })),
        el('div', { class: 'field' }, el('label', {}, 'Status'), el('select', { id: 'inv-status' }, ...['draft', 'sent', 'paid', 'overdue', 'cancelled'].map(s => el('option', { value: s, selected: s === data.status }, s)))),
        el('div', { class: 'field' }, el('label', {}, 'Issue date *'), el('input', { type: 'date', id: 'inv-issue', value: data.issue_date, required: true })),
        el('div', { class: 'field' }, el('label', {}, 'Due date'), el('input', { type: 'date', id: 'inv-due', value: data.due_date })),
        el('div', { class: 'field' }, el('label', {}, 'Supply type'), el('select', { id: 'inv-supply' }, el('option', { value: '0', selected: !data.is_interstate }, 'Intra-state (CGST + SGST)'), el('option', { value: '1', selected: data.is_interstate }, 'Inter-state (IGST)')))
    );
    body.append(fields, el('h3', { style: { margin: '0 0 10px', fontSize: '15px' } }, 'Line Items'));

    const linesBox = el('div', { class: 'invoice-lines' });
    body.append(linesBox);
    let lines = [...data.lines];

    function compute() {
        const inter = $('#inv-supply').value === '1';
        let subtotal = 0;
        let gst = 0;
        let cgst = 0;
        let sgst = 0;
        let igst = 0;
        lines.forEach((line, index) => {
            const amount = (line.quantity || 0) * (line.unit_price || 0);
            const tax = amount * (line.gst_rate || 0) / 100;
            subtotal += amount;
            gst += tax;
            if (inter) igst += tax;
            else {
                cgst += tax / 2;
                sgst += tax / 2;
            }
            const node = document.getElementById(`line-total-${index}`);
            if (node) node.textContent = money(amount + tax);
        });
        const discount = parseFloat((($('#inv-discount') && $('#inv-discount').value) || 0)) || 0;
        $('#sum-sub').textContent = money(subtotal);
        $('#sum-cgst').textContent = money(cgst);
        $('#sum-sgst').textContent = money(sgst);
        $('#sum-igst').textContent = money(igst);
        $('#sum-total').textContent = money(subtotal + gst - discount);
        $('#sum-cgst-row').style.display = inter ? 'none' : 'flex';
        $('#sum-sgst-row').style.display = inter ? 'none' : 'flex';
        $('#sum-igst-row').style.display = inter ? 'flex' : 'none';
    }

    function renderLines() {
        linesBox.innerHTML = '';
        linesBox.append(el('table', {},
            el('thead', {}, el('tr', {}, el('th', {}, 'Item / Description'), el('th', {}, 'HSN'), el('th', {}, 'Qty'), el('th', {}, 'Rate'), el('th', {}, 'GST%'), el('th', { style: { textAlign: 'right' } }, 'Line Total'), el('th', {}))),
            el('tbody', {}, ...lines.map((line, index) => el('tr', {},
                el('td', { class: 'col-desc' },
                    el('select', {
                        onChange: (e) => {
                            const item = items.find(x => String(x.id) === e.target.value);
                            if (item) {
                                lines[index] = {...line, description: item.name, hsn_code: item.hsn_code || '', unit_price: item.unit_price, gst_rate: item.gst_rate, item_id: item.id };
                                renderLines();
                            }
                        }
                    }, el('option', { value: '' }, '— Pick item —'), ...items.map(item => el('option', { value: item.id, selected: line.item_id === item.id }, item.name))),
                    el('input', { placeholder: 'Description', value: line.description, onInput: function() { line.description = this.value; }, style: { marginTop: '4px' } })
                ),
                el('td', {}, el('input', { value: line.hsn_code, placeholder: 'HSN', onInput: function() { line.hsn_code = this.value; } })),
                el('td', { class: 'col-qty' }, el('input', {
                    type: 'number',
                    min: '0.01',
                    step: '0.01',
                    value: line.quantity,
                    onInput: function() {
                        line.quantity = parseFloat(this.value) || 0;
                        compute();
                    }
                })),
                el('td', { class: 'col-price' }, el('input', {
                    type: 'number',
                    min: '0',
                    step: '0.01',
                    value: line.unit_price,
                    onInput: function() {
                        line.unit_price = parseFloat(this.value) || 0;
                        compute();
                    }
                })),
                el('td', { class: 'col-gst' }, el('select', {
                    onChange: function() {
                        line.gst_rate = parseFloat(this.value);
                        compute();
                    }
                }, ...[0, 3, 5, 12, 18, 28].map(rate => el('option', { value: rate, selected: rate === Number(line.gst_rate) }, `${rate}%`)))),
                el('td', { class: 'col-total', id: `line-total-${index}` }, money((line.quantity || 0) * (line.unit_price || 0) * (1 + (line.gst_rate || 0) / 100))),
                el('td', { class: 'col-remove' }, el('button', {
                    type: 'button',
                    class: 'icon-btn',
                    onClick: () => {
                        if (lines.length > 1) {
                            lines.splice(index, 1);
                            renderLines();
                        }
                    }
                }, '✕'))
            )))
        ));
        compute();
    }

    body.append(
        el('button', {
            type: 'button',
            class: 'btn btn-secondary btn-sm',
            style: { marginTop: '10px' },
            onClick: () => {
                lines.push({ description: '', hsn_code: '', quantity: 1, unit_price: 0, gst_rate: 18 });
                renderLines();
            }
        }, '+ Add line'),
        el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 360px', gap: '24px', marginTop: '24px' } },
            el('div', {}, el('div', { class: 'field' }, el('label', {}, 'Notes'), el('textarea', { id: 'inv-notes', placeholder: 'Thank you for your business...' }, data.notes))),
            el('div', { class: 'totals-box' },
                row('Subtotal', el('span', { id: 'sum-sub' }, money(0))),
                el('div', { class: 'totals-row', id: 'sum-cgst-row' }, el('span', {}, 'CGST'), el('span', { id: 'sum-cgst' }, money(0))),
                el('div', { class: 'totals-row', id: 'sum-sgst-row' }, el('span', {}, 'SGST'), el('span', { id: 'sum-sgst' }, money(0))),
                el('div', { class: 'totals-row', id: 'sum-igst-row', style: { display: 'none' } }, el('span', {}, 'IGST'), el('span', { id: 'sum-igst' }, money(0))),
                el('div', { class: 'totals-row' }, el('span', {}, 'Discount'), el('input', { type: 'number', id: 'inv-discount', min: '0', step: '0.01', value: data.discount || 0, style: { width: '120px', textAlign: 'right' }, onInput: compute })),
                el('div', { class: 'totals-row grand' }, el('span', {}, 'Total'), el('span', { id: 'sum-total' }, money(0)))
            )
        )
    );

    $('#inv-supply').addEventListener('change', compute);
    renderLines();

    formCard.append(el('div', { class: 'modal-footer' },
        el('button', { class: 'btn btn-secondary', onClick: () => navigate('invoices') }, 'Cancel'),
        el('button', { class: 'btn btn-primary', onClick: saveInvoice }, editId ? 'Update Invoice' : 'Create Invoice')
    ));

    async function saveInvoice() {
        const customer_id = parseInt($('#inv-customer').value, 10);
        if (!customer_id) return toast('Select a customer', 'error');
        const body = {
            customer_id,
            invoice_number: $('#inv-number').value.trim() || undefined,
            issue_date: $('#inv-issue').value,
            due_date: $('#inv-due').value || null,
            status: $('#inv-status').value,
            is_interstate: $('#inv-supply').value === '1' ? 1 : 0,
            discount: parseFloat($('#inv-discount').value) || 0,
            notes: $('#inv-notes').value || null,
            items: lines
        };
        const saved = editId ? await api('/invoices/' + editId, { method: 'PUT', body: JSON.stringify(body) }) : await api('/invoices', { method: 'POST', body: JSON.stringify(body) });
        toast(editId ? 'Invoice updated' : 'Invoice created', 'success');
        navigate('invoice-view', { id: saved.id });
    }
}

async function renderCustomers(root) {
    root.append(el('div', { class: 'page-header' }, el('div', {}, el('h1', { class: 'page-title' }, 'Customers'), el('div', { class: 'page-sub' }, 'Your clients and their GST details')), el('button', {
        class: 'btn btn-primary',
        onClick: async() => {
            await customerForm();
            render();
        }
    }, '+ New Customer')));
    const search = el('input', { class: 'search', placeholder: 'Search by name, email, GSTIN...' });
    const card = el('div', { class: 'card' }, el('div', { class: 'empty' }, 'Loading...'));
    root.append(el('div', { class: 'toolbar' }, search), card);
    async function load() {
        const q = search.value.trim();
        const rows = await api('/customers' + (q ? '?q=' + encodeURIComponent(q) : ''));
        card.innerHTML = '';
        if (!rows.length) return card.append(el('div', { class: 'empty' }, 'No customers yet.'));
        card.append(el('div', { class: 'table-wrap' },
            el('table', { class: 'data' },
                el('thead', {}, el('tr', {}, el('th', {}, 'Name'), el('th', {}, 'Email'), el('th', {}, 'Phone'), el('th', {}, 'GSTIN'), el('th', {}, 'State'), el('th', {}, ''))),
                el('tbody', {}, ...rows.map(c => el('tr', {},
                    el('td', {}, c.name), el('td', {}, c.email || '-'), el('td', {}, c.phone || '-'), el('td', {}, c.gstin || '-'), el('td', {}, c.state || '-'),
                    el('td', { style: { textAlign: 'right' } },
                        el('button', {
                            class: 'btn btn-sm btn-ghost',
                            onClick: async() => {
                                await customerForm(c);
                                load();
                            }
                        }, 'Edit'),
                        el('button', {
                            class: 'btn btn-sm btn-ghost',
                            onClick: async() => {
                                if (!(await confirmDialog('Delete this customer?', true))) return;
                                await api('/customers/' + c.id, { method: 'DELETE' });
                                toast('Deleted', 'success');
                                load();
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

async function customerForm(existing) {
    const form = el('form', { class: 'form-grid' },
        el('div', { class: 'field full' }, el('label', {}, 'Name *'), el('input', { name: 'name', required: true, value: (existing && existing.name) || '' })),
        el('div', { class: 'field' }, el('label', {}, 'Email'), el('input', { type: 'email', name: 'email', value: (existing && existing.email) || '' })),
        el('div', { class: 'field' }, el('label', {}, 'Phone'), el('input', { name: 'phone', value: (existing && existing.phone) || '' })),
        el('div', { class: 'field' }, el('label', {}, 'GSTIN'), el('input', { name: 'gstin', value: (existing && existing.gstin) || '' })),
        el('div', { class: 'field' }, el('label', {}, 'State'), el('input', { name: 'state', value: (existing && existing.state) || '' })),
        el('div', { class: 'field full' }, el('label', {}, 'Address'), el('textarea', { name: 'address' }, (existing && existing.address) || ''))
    );
    const result = await openModal({
        title: existing ? 'Edit customer' : 'New customer',
        body: form,
        footer: (close) => [
            el('button', { class: 'btn btn-secondary', onClick: () => close(null) }, 'Cancel'),
            el('button', { class: 'btn btn-primary', onClick: () => close(Object.fromEntries(new FormData(form).entries())) }, 'Save')
        ]
    });
    if (!result) return null;
    const saved = existing ? await api('/customers/' + existing.id, { method: 'PUT', body: JSON.stringify(result) }) : await api('/customers', { method: 'POST', body: JSON.stringify(result) });
    toast('Customer saved', 'success');
    return saved;
}

async function renderItems(root) {
    root.append(el('div', { class: 'page-header' }, el('div', {}, el('h1', { class: 'page-title' }, 'Items / Services'), el('div', { class: 'page-sub' }, 'Product catalog with prices and GST rates')), el('button', {
        class: 'btn btn-primary',
        onClick: async() => {
            await itemForm();
            render();
        }
    }, '+ New Item')));
    const search = el('input', { class: 'search', placeholder: 'Search by name, HSN...' });
    const card = el('div', { class: 'card' }, el('div', { class: 'empty' }, 'Loading...'));
    root.append(el('div', { class: 'toolbar' }, search), card);
    async function load() {
        const q = search.value.trim();
        const rows = await api('/items' + (q ? '?q=' + encodeURIComponent(q) : ''));
        card.innerHTML = '';
        if (!rows.length) return card.append(el('div', { class: 'empty' }, 'No items yet.'));
        card.append(el('div', { class: 'table-wrap' },
            el('table', { class: 'data' },
                el('thead', {}, el('tr', {}, el('th', {}, 'Name'), el('th', {}, 'Description'), el('th', {}, 'HSN'), el('th', { class: 'num' }, 'Price'), el('th', { class: 'num' }, 'GST'), el('th', {}, 'Unit'), el('th', {}, ''))),
                el('tbody', {}, ...rows.map(item => el('tr', {},
                    el('td', { style: { fontWeight: '500' } }, item.name),
                    el('td', { style: { color: 'var(--text-muted)' } }, (item.description || '').slice(0, 60)),
                    el('td', {}, item.hsn_code || '-'),
                    el('td', { class: 'num' }, money(item.unit_price)),
                    el('td', { class: 'num' }, `${item.gst_rate}%`),
                    el('td', {}, item.unit || 'pcs'),
                    el('td', { style: { textAlign: 'right' } },
                        el('button', {
                            class: 'btn btn-sm btn-ghost',
                            onClick: async() => {
                                await itemForm(item);
                                load();
                            }
                        }, 'Edit'),
                        el('button', {
                            class: 'btn btn-sm btn-ghost',
                            onClick: async() => {
                                if (!(await confirmDialog('Delete this item?', true))) return;
                                await api('/items/' + item.id, { method: 'DELETE' });
                                toast('Deleted', 'success');
                                load();
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
    const form = el('form', { class: 'form-grid' },
        el('div', { class: 'field full' }, el('label', {}, 'Name *'), el('input', { name: 'name', required: true, value: (existing && existing.name) || '' })),
        el('div', { class: 'field full' }, el('label', {}, 'Description'), el('textarea', { name: 'description' }, (existing && existing.description) || '')),
        el('div', { class: 'field' }, el('label', {}, 'Unit price *'), el('input', { type: 'number', step: '0.01', min: '0', name: 'unit_price', value: (existing && existing.unit_price) || 0, required: true })),
        el('div', { class: 'field' }, el('label', {}, 'GST rate (%) *'), el('select', { name: 'gst_rate' }, ...[0, 3, 5, 12, 18, 28].map(rate => el('option', { value: rate, selected: Number((existing && existing.gst_rate)) === rate }, `${rate}%`)))),
        el('div', { class: 'field' }, el('label', {}, 'HSN / SAC code'), el('input', { name: 'hsn_code', value: (existing && existing.hsn_code) || '' })),
        el('div', { class: 'field' }, el('label', {}, 'Unit'), el('input', { name: 'unit', value: (existing && existing.unit) || 'pcs' }))
    );
    const result = await openModal({
        title: existing ? 'Edit item' : 'New item',
        body: form,
        footer: (close) => [
            el('button', { class: 'btn btn-secondary', onClick: () => close(null) }, 'Cancel'),
            el('button', { class: 'btn btn-primary', onClick: () => close(Object.fromEntries(new FormData(form).entries())) }, 'Save')
        ]
    });
    if (!result) return null;
    const saved = existing ? await api('/items/' + existing.id, { method: 'PUT', body: JSON.stringify(result) }) : await api('/items', { method: 'POST', body: JSON.stringify(result) });
    toast('Item saved', 'success');
    return saved;
}

async function renderReports(root) {
    root.append(el('div', { class: 'page-header' }, el('div', {}, el('h1', { class: 'page-title' }, 'Reports'), el('div', { class: 'page-sub' }, 'GST summary and audit trail'))));
    const from = el('input', { type: 'date' });
    const to = el('input', { type: 'date' });
    const btn = el('button', { class: 'btn btn-secondary', type: 'button' }, 'Apply');
    root.append(el('div', { class: 'toolbar' }, el('label', {}, 'From', from), el('label', {}, 'To', to), btn));
    const gstCard = el('div', { class: 'card', style: { marginBottom: '20px' } });
    const auditCard = el('div', { class: 'card' });
    root.append(gstCard, auditCard);
    async function load() {
        const params = new URLSearchParams();
        if (from.value) params.set('from', from.value);
        if (to.value) params.set('to', to.value);
        const [gst, audit] = await Promise.all([api('/reports/gst?' + params.toString()), api('/reports/audit')]);
        gstCard.innerHTML = '';
        gstCard.append(el('div', { class: 'card-header' }, el('h3', { class: 'card-title' }, 'GST Summary by Rate')),
            el('div', { class: 'table-wrap' },
                gst.length === 0 ? el('div', { class: 'empty' }, 'No taxable transactions in this range.') :
                el('table', { class: 'data' },
                    el('thead', {}, el('tr', {}, el('th', {}, 'GST Rate'), el('th', { class: 'num' }, 'Taxable'), el('th', { class: 'num' }, 'CGST'), el('th', { class: 'num' }, 'SGST'), el('th', { class: 'num' }, 'IGST'), el('th', { class: 'num' }, 'Total Tax'))),
                    el('tbody', {}, ...gst.map(row => el('tr', {}, el('td', {}, `${row.gst_rate}%`), el('td', { class: 'num' }, money(row.taxable)), el('td', { class: 'num' }, money(row.cgst)), el('td', { class: 'num' }, money(row.sgst)), el('td', { class: 'num' }, money(row.igst)), el('td', { class: 'num' }, money(row.total_gst)))))
                )
            )
        );
        auditCard.innerHTML = '';
        auditCard.append(el('div', { class: 'card-header' }, el('h3', { class: 'card-title' }, 'Audit Trail (last 200)')),
            el('div', { class: 'table-wrap' },
                audit.length === 0 ? el('div', { class: 'empty' }, 'No audit events.') :
                el('table', { class: 'data' },
                    el('thead', {}, el('tr', {}, el('th', {}, 'When'), el('th', {}, 'User'), el('th', {}, 'Entity'), el('th', {}, 'ID'), el('th', {}, 'Action'), el('th', {}, 'Details'))),
                    el('tbody', {}, ...audit.map(item => el('tr', {}, el('td', {}, item.timestamp), el('td', {}, item.user_email || '-'), el('td', {}, item.entity_type), el('td', {}, item.entity_id || '-'), el('td', {}, item.action), el('td', { style: { fontSize: '12px', color: 'var(--text-muted)', maxWidth: '360px', wordBreak: 'break-all' } }, item.details ? JSON.stringify(item.details) : ''))))
                )
            )
        );
    }
    btn.addEventListener('click', load);
    load();
}

async function renderBillingAdmin(root) {
    if (!State.user || State.user.role !== 'admin') {
        root.append(el('div', { class: 'empty' }, 'Admin access required for billing tools.'));
        return;
    }
    root.append(
        el('div', { class: 'page-header' },
            el('div', {},
                el('h1', { class: 'page-title' }, 'Billing Admin'),
                el('div', { class: 'page-sub' }, 'Internal billing controls, payment history, and invoice tracking')
            )
        )
    );

    const [config, customers, invoices] = await Promise.all([
        api('/admin/billing/config-status'),
        api('/admin/billing/customers'),
        api('/admin/billing/invoices')
    ]);

    root.append(
        el('div', { class: 'card', style: { marginBottom: '20px' } },
            el('div', { class: 'card-body' },
                el('strong', {}, 'Billing mode: '),
                el('span', { class: 'badge badge-paid' }, config.billingMode || 'internal'),
                el('p', { class: 'form-hint', style: { marginBottom: 0 } },
                    'This dashboard uses local invoice data only and is inspired by modern billing systems.'
                )
            )
        )
    );

    const customerRows = customers.map((customer) =>
        el('tr', {},
            el('td', {}, customer.name),
            el('td', {}, customer.email || '-'),
            el('td', { class: 'num' }, String(customer.invoice_count || 0)),
            el('td', { class: 'num' }, money(customer.outstanding_total || 0)),
            el('td', { style: { textAlign: 'right' } },
                el('button', { class: 'btn btn-sm btn-secondary', onClick: () => toast('Customer billing data is managed locally.', 'success') }, 'View')
            )
        )
    );

    root.append(
        el('div', { class: 'card', style: { marginBottom: '20px' } },
            el('div', { class: 'card-header' }, el('h3', { class: 'card-title' }, 'Customer Billing Management')),
            el('div', { class: 'table-wrap' },
                customers.length === 0 ? el('div', { class: 'empty' }, 'No customers found.') :
                el('table', { class: 'data' },
                    el('thead', {}, el('tr', {}, el('th', {}, 'Customer'), el('th', {}, 'Email'), el('th', { class: 'num' }, 'Invoices'), el('th', { class: 'num' }, 'Outstanding'), el('th', {}, ''))),
                    el('tbody', {}, ...customerRows)
                )
            )
        )
    );

    const invoiceRows = invoices.map((invoice) =>
        el('tr', {},
            el('td', {}, invoice.invoice_number),
            el('td', {}, invoice.customer_name),
            el('td', {}, invoice.due_date || '-'),
            el('td', { class: 'num' }, money(invoice.total)),
            el('td', {}, el('span', { class: `badge badge-${invoice.status}` }, invoice.status)),
            el('td', { style: { textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
                el('button', {
                    class: 'btn btn-sm btn-secondary',
                    onClick: async() => {
                        await api(`/admin/billing/invoices/${invoice.id}/send`, { method: 'POST' });
                        toast('Invoice marked as sent', 'success');
                        render();
                    }
                }, 'Mark Sent'),
                el('button', {
                    class: 'btn btn-sm btn-secondary',
                    onClick: async() => {
                        await api(`/admin/billing/invoices/${invoice.id}/record-payment`, {
                            method: 'POST',
                            body: JSON.stringify({ payment_method: invoice.payment_method || 'Bank Transfer', payment_date: today() })
                        });
                        toast('Payment recorded', 'success');
                        render();
                    }
                }, 'Record Payment'),
                el('button', {
                    class: 'btn btn-sm btn-secondary',
                    onClick: async() => {
                        const payments = await api(`/admin/billing/invoices/${invoice.id}/payments`);
                        const modalBody = payments.length === 0 ?
                            el('p', {}, 'No payments recorded for this invoice.') :
                            el('div', { class: 'table-wrap' },
                                el('table', { class: 'data' },
                                    el('thead', {}, el('tr', {}, el('th', {}, 'Date'), el('th', {}, 'Method'), el('th', { class: 'num' }, 'Amount'))),
                                    el('tbody', {}, ...payments.map((payment) =>
                                        el('tr', {},
                                            el('td', {}, payment.date || '-'),
                                            el('td', {}, payment.method || '-'),
                                            el('td', { class: 'num' }, money(payment.amount))
                                        )
                                    ))
                                )
                            );
                        await openModal({
                            title: `Payment History - ${invoice.invoice_number}`,
                            wide: true,
                            body: modalBody,
                            footer: (close) => [el('button', { class: 'btn btn-secondary', onClick: () => close(true) }, 'Close')]
                        });
                    }
                }, 'Payments')
            )
        )
    );

    root.append(
        el('div', { class: 'card' },
            el('div', { class: 'card-header' }, el('h3', { class: 'card-title' }, 'Invoice Tracking and Payments')),
            el('div', { class: 'table-wrap' },
                invoices.length === 0 ? el('div', { class: 'empty' }, 'No invoices found.') :
                el('table', { class: 'data' },
                    el('thead', {}, el('tr', {}, el('th', {}, 'Invoice'), el('th', {}, 'Customer'), el('th', {}, 'Due'), el('th', { class: 'num' }, 'Total'), el('th', {}, 'Status'), el('th', {}, ''))),
                    el('tbody', {}, ...invoiceRows)
                )
            )
        )
    );
}

async function renderSettings(root) {
    const biz = State.business;
    root.append(el('div', { class: 'page-header' }, el('div', {}, el('h1', { class: 'page-title' }, 'Business Settings'), el('div', { class: 'page-sub' }, 'Configure invoicing details for your business'))));
    const form = el('form', {
            class: 'form-grid',
            onSubmit: async(e) => {
                e.preventDefault();
                const body = Object.fromEntries(new FormData(form).entries());
                if (body.next_invoice_number) body.next_invoice_number = parseInt(body.next_invoice_number, 10);
                const updated = await api('/businesses/' + biz.id, { method: 'PUT', body: JSON.stringify(body) });
                State.business = updated;
                toast('Saved', 'success');
            }
        },
        el('div', { class: 'field' }, el('label', {}, 'Business name'), el('input', { name: 'name', value: biz.name || '', required: true })),
        el('div', { class: 'field' }, el('label', {}, 'GSTIN'), el('input', { name: 'gstin', value: biz.gstin || '' })),
        el('div', { class: 'field' }, el('label', {}, 'Email'), el('input', { type: 'email', name: 'email', value: biz.email || '' })),
        el('div', { class: 'field' }, el('label', {}, 'Phone'), el('input', { name: 'phone', value: biz.phone || '' })),
        el('div', { class: 'field full' }, el('label', {}, 'Address'), el('textarea', { name: 'address' }, biz.address || '')),
        el('div', { class: 'field' }, el('label', {}, 'State'), el('input', { name: 'state', value: biz.state || '' })),
        el('div', { class: 'field' }, el('label', {}, 'Currency symbol'), el('input', { name: 'currency_symbol', value: biz.currency_symbol || '₹' })),
        el('div', { class: 'field' }, el('label', {}, 'Invoice prefix'), el('input', { name: 'invoice_prefix', value: biz.invoice_prefix || 'INV' })),
        el('div', { class: 'field' }, el('label', {}, 'Next invoice number'), el('input', { type: 'number', min: '1', name: 'next_invoice_number', value: biz.next_invoice_number || 1 })),
        el('div', { class: 'field full' }, el('button', { class: 'btn btn-primary', type: 'submit' }, 'Save changes'))
    );
    root.append(el('div', { class: 'card' }, el('div', { class: 'card-body' }, form)));
}

render();
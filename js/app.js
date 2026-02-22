/**
 * APP.JS — Core router, auth, API helpers, modal/toast system
 */

const API = window.location.hostname === 'localhost' ? '/APP-RRHH%20Schedule/api' : '/api';

// ─── Global State ───
const App = {
    user: null,
    shops: [],
    employees: [],
    currentPage: 'dashboard',
};

// ═══════════════════════════════════════════
// API HELPERS
// ═══════════════════════════════════════════
async function api(endpoint, method = 'GET', body = null) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${API}/${endpoint}`, opts);
    const data = await res.json();

    if (!res.ok) {
        throw { status: res.status, ...data };
    }
    return data;
}

// ═══════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════
async function checkSession() {
    try {
        const data = await api('auth.php?action=session');
        if (data.authenticated) {
            App.user = data.user;
            showApp();
            return;
        }
    } catch (e) { /* not logged in */ }
    showLogin();
}

function showLogin() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
}

function showApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('topbar-user').textContent = App.user.username;
    loadShops().then(() => {
        navigateTo(App.currentPage);
        checkPendingTimeOff();
    });
}


async function loadShops() {
    try {
        const data = await api('dashboard.php?view=shops');
        App.shops = data.shops || [];
    } catch (e) {
        App.shops = [];
    }
}

// Login form handler
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    const errEl = document.getElementById('login-error');
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    btn.disabled = true;
    errEl.textContent = '';

    try {
        const data = await api('auth.php?action=login', 'POST', { username, password });
        App.user = data.user;
        showApp();
    } catch (err) {
        errEl.textContent = err.error || 'Login failed';
    } finally {
        btn.disabled = false;
    }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
    await api('auth.php?action=logout');
    App.user = null;
    showLogin();
});

// ═══════════════════════════════════════════
// ROUTER / NAVIGATION
// ═══════════════════════════════════════════
function navigateTo(page) {
    App.currentPage = page;

    // Update nav
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.page === page);
    });

    // Render page
    const content = document.getElementById('page-content');
    content.scrollTop = 0;

    switch (page) {
        case 'dashboard': renderDashboard(content); break;
        case 'staff': renderEmployees(content); break;
        case 'shifts': renderShifts(content); break;
        case 'timeline': renderTimeline(content); break;
        case 'availability': renderAvailability(content); break;
        case 'bidding': renderBidding(content); break;
        case 'swaps': renderSwaps(content); break;
        case 'templates': renderTemplates(content); break;
    }
}

// Nav click handlers
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
});

// ═══════════════════════════════════════════
// MODAL SYSTEM
// ═══════════════════════════════════════════
function openModal(title, bodyHTML, footerHTML = '') {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHTML;
    document.getElementById('modal-footer').innerHTML = footerHTML;
    document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
}

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
});

// ═══════════════════════════════════════════
// TOAST SYSTEM
// ═══════════════════════════════════════════
function showToast(message, type = 'success') {
    const icons = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="material-icons-round">${icons[type]}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ═══════════════════════════════════════════
// UTILITY HELPERS
// ═══════════════════════════════════════════
function formatTime(t) {
    if (!t) return '';
    return t.substring(0, 5); // HH:MM
}

function formatDate(d) {
    if (!d) return '';
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDateISO(d) {
    return d.toISOString().split('T')[0];
}

function getShopColor(shopName) {
    const shop = App.shops.find(s => s.name === shopName);
    return shop ? shop.color : '#6366f1';
}

function getInitials(name) {
    return name.split(' ').map(w => w[0]).join('').substring(0, 2);
}

function isManager() {
    return App.user && App.user.role === 'manager';
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', checkSession);

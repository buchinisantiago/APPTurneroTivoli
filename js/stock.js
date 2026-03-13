/**
 * STOCK.JS — Daily Stock Management Module
 * Admin: manage products, view alerts, see history
 * Staff: submit daily stock counts
 */

// ─── State ───
let stockProducts = [];
let stockShopFilter = null;
let stockDate = new Date().toISOString().split('T')[0]; // today

// ═══════════════════════════════════════════
// MAIN RENDER
// ═══════════════════════════════════════════
async function renderStock(container) {
    const shops = App.shops;
    const isAdmin = isManager();

    container.innerHTML = `
        <div class="header-actions">
            <h2><span class="material-icons-round" style="vertical-align:middle;margin-right:6px;">inventory_2</span>Stock Control</h2>
            ${isAdmin ? `
            <button class="btn btn-primary" onclick="openAddProductModal()">
                <span class="material-icons-round">add_circle</span> Add Product
            </button>` : ''}
        </div>

        <!-- Alerts banner (manager only) -->
        ${isAdmin ? '<div id="stock-alerts-banner"></div>' : ''}

        <!-- Shop filter tabs -->
        <div class="stock-shop-tabs" id="stock-shop-tabs">
            <button class="stock-tab active" data-shop-id="" onclick="filterStockShop(null, this)">
                All Shops
            </button>
            ${shops.map(s => `
                <button class="stock-tab" data-shop-id="${s.id}" onclick="filterStockShop(${s.id}, this)">
                    <span class="shop-dot" style="background:${s.color}"></span>
                    ${s.name}
                </button>
            `).join('')}
        </div>

        <!-- Date picker -->
        <div class="stock-date-row">
            <button class="btn-icon" onclick="changeStockDate(-1)">
                <span class="material-icons-round">chevron_left</span>
            </button>
            <input type="date" id="stock-date-input" value="${stockDate}" 
                   onchange="stockDate=this.value; loadStockView()">
            <button class="btn-icon" onclick="changeStockDate(1)">
                <span class="material-icons-round">chevron_right</span>
            </button>
            <button class="btn btn-outline btn-sm" onclick="goToToday()">Today</button>
        </div>

        <!-- Content area -->
        <div id="stock-content">
            <div class="stock-loading">
                <span class="material-icons-round spin">sync</span> Loading...
            </div>
        </div>
    `;

    stockShopFilter = null;

    if (isAdmin) loadStockAlertsBanner();
    loadStockView();
}

// ═══════════════════════════════════════════
// SHOP FILTER
// ═══════════════════════════════════════════
function filterStockShop(shopId, btn) {
    stockShopFilter = shopId;
    document.querySelectorAll('.stock-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    loadStockView();
}

function changeStockDate(delta) {
    const d = new Date(stockDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    stockDate = d.toISOString().split('T')[0];
    document.getElementById('stock-date-input').value = stockDate;
    loadStockView();
}

function goToToday() {
    stockDate = new Date().toISOString().split('T')[0];
    document.getElementById('stock-date-input').value = stockDate;
    loadStockView();
}

// ═══════════════════════════════════════════
// LOAD VIEW (admin vs staff)
// ═══════════════════════════════════════════
async function loadStockView() {
    const container = document.getElementById('stock-content');
    if (!container) return;

    try {
        // Load products
        let url = 'stock.php?action=products';
        if (stockShopFilter) url += `&shop_id=${stockShopFilter}`;
        stockProducts = await api(url);

        // Load entries for the selected date
        let entriesUrl = `stock.php?action=entries&date=${stockDate}`;
        if (stockShopFilter) entriesUrl += `&shop_id=${stockShopFilter}`;
        const entries = await api(entriesUrl);

        // Map entries by product id
        const entryMap = {};
        entries.forEach(e => { entryMap[e.stock_product_id] = e; });

        if (isManager()) {
            renderAdminStockView(container, stockProducts, entryMap);
        } else {
            renderStaffStockView(container, stockProducts, entryMap);
        }
    } catch (e) {
        container.innerHTML = `<div class="stock-empty"><span class="material-icons-round">error</span> Error loading stock data</div>`;
    }
}

// ═══════════════════════════════════════════
// ADMIN VIEW
// ═══════════════════════════════════════════
function renderAdminStockView(container, products, entryMap) {
    if (products.length === 0) {
        container.innerHTML = `
            <div class="stock-empty">
                <span class="material-icons-round">inventory_2</span>
                <p>No products configured yet</p>
                <p class="text-muted">Add products using the button above</p>
            </div>`;
        return;
    }

    // Group by shop
    const grouped = {};
    products.forEach(p => {
        if (!grouped[p.shop_id]) grouped[p.shop_id] = { shop_name: p.shop_name, shop_color: p.shop_color, items: [] };
        grouped[p.shop_id].items.push(p);
    });

    let html = '';
    for (const shopId in grouped) {
        const group = grouped[shopId];
        html += `
        <div class="stock-shop-section">
            <div class="stock-shop-header">
                <span class="shop-dot" style="background:${group.shop_color}"></span>
                <h3>${group.shop_name}</h3>
            </div>
            <div class="stock-grid">
                ${group.items.map(p => {
            const entry = entryMap[p.id];
            const qty = entry ? entry.quantity : null;
            const isLow = qty !== null && p.safety_stock > 0 && qty < p.safety_stock;
            const noEntry = qty === null;
            return `
                    <div class="stock-card ${isLow ? 'stock-card-alert' : ''} ${noEntry ? 'stock-card-noentry' : ''}">
                        <div class="stock-card-header">
                            <span class="stock-product-name">${p.name}</span>
                            <div class="stock-card-actions">
                                <button class="btn-icon" title="Edit" onclick="openEditProductModal(${p.id})">
                                    <span class="material-icons-round" style="font-size:18px">edit</span>
                                </button>
                                <button class="btn-icon" title="History" onclick="viewProductHistory(${p.id}, '${p.name.replace(/'/g, "\\'")}')">
                                    <span class="material-icons-round" style="font-size:18px">history</span>
                                </button>
                                <button class="btn-icon" title="Deactivate" onclick="deactivateProduct(${p.id}, '${p.name.replace(/'/g, "\\'")}')">
                                    <span class="material-icons-round" style="font-size:18px;color:var(--danger)">remove_circle</span>
                                </button>
                            </div>
                        </div>
                        <div class="stock-card-body">
                            <div class="stock-qty ${isLow ? 'stock-qty-low' : ''}">
                                ${qty !== null ? qty : '—'}
                            </div>
                            <div class="stock-unit">${p.unit}</div>
                        </div>
                        <div class="stock-card-footer">
                            <span class="stock-safety">
                                <span class="material-icons-round" style="font-size:14px">shield</span>
                                Safety: ${p.safety_stock}
                            </span>
                            ${entry ? `<span class="stock-recorded">by ${entry.recorded_by_name}</span>` : '<span class="stock-recorded text-muted">No entry</span>'}
                        </div>
                        ${isLow ? '<div class="stock-alert-badge"><span class="material-icons-round">warning</span> Low Stock</div>' : ''}
                    </div>`;
        }).join('')}
            </div>
        </div>`;
    }

    container.innerHTML = html;
}

// ═══════════════════════════════════════════
// STAFF VIEW — Daily count form
// ═══════════════════════════════════════════
function renderStaffStockView(container, products, entryMap) {
    if (products.length === 0) {
        container.innerHTML = `
            <div class="stock-empty">
                <span class="material-icons-round">inventory_2</span>
                <p>No products to count</p>
                <p class="text-muted">Products will appear here once the manager sets them up</p>
            </div>`;
        return;
    }

    // Group by shop
    const grouped = {};
    products.forEach(p => {
        if (!grouped[p.shop_id]) grouped[p.shop_id] = { shop_name: p.shop_name, shop_color: p.shop_color, items: [] };
        grouped[p.shop_id].items.push(p);
    });

    let html = '<form id="stock-entry-form" onsubmit="submitStockEntries(event)">';

    for (const shopId in grouped) {
        const group = grouped[shopId];
        html += `
        <div class="stock-shop-section">
            <div class="stock-shop-header">
                <span class="shop-dot" style="background:${group.shop_color}"></span>
                <h3>${group.shop_name}</h3>
            </div>
            <div class="stock-entry-list">
                ${group.items.map(p => {
            const entry = entryMap[p.id];
            const prevQty = entry ? entry.quantity : '';
            return `
                    <div class="stock-entry-row">
                        <div class="stock-entry-info">
                            <span class="stock-product-name">${p.name}</span>
                            <span class="stock-unit-label">(${p.unit})</span>
                        </div>
                        <div class="stock-entry-input">
                            <input type="number" min="0" 
                                   name="qty_${p.id}" 
                                   value="${prevQty}"
                                   placeholder="${prevQty !== '' ? prevQty : '0'}"
                                   class="stock-qty-input"
                                   data-product-id="${p.id}">
                        </div>
                        <div class="stock-entry-ref">
                            <span class="material-icons-round" style="font-size:14px">shield</span>
                            <span>Min: ${p.safety_stock}</span>
                        </div>
                    </div>`;
        }).join('')}
            </div>
        </div>`;
    }

    html += `
        <div class="stock-submit-bar">
            <button type="submit" class="btn btn-primary btn-full" id="stock-submit-btn">
                <span class="material-icons-round">save</span>
                Submit Stock Count
            </button>
        </div>
    </form>`;

    container.innerHTML = html;
}

// ═══════════════════════════════════════════
// SUBMIT ENTRIES (Staff)
// ═══════════════════════════════════════════
async function submitStockEntries(e) {
    e.preventDefault();
    const btn = document.getElementById('stock-submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons-round spin">sync</span> Saving...';

    const inputs = document.querySelectorAll('.stock-qty-input');
    const entries = [];

    inputs.forEach(input => {
        const productId = input.dataset.productId;
        const qty = input.value;
        if (qty !== '') {
            entries.push({
                stock_product_id: parseInt(productId),
                quantity: parseInt(qty),
                notes: ''
            });
        }
    });

    if (entries.length === 0) {
        showToast('Please fill in at least one product count', 'warning');
        btn.disabled = false;
        btn.innerHTML = '<span class="material-icons-round">save</span> Submit Stock Count';
        return;
    }

    try {
        await api('stock.php?action=entries', 'POST', { entries, date: stockDate });
        showToast('Stock count saved successfully!', 'success');
        loadStockView();
    } catch (err) {
        showToast(err.error || 'Failed to save stock count', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-icons-round">save</span> Submit Stock Count';
    }
}

// ═══════════════════════════════════════════
// ALERTS BANNER (Manager)
// ═══════════════════════════════════════════
async function loadStockAlertsBanner() {
    const banner = document.getElementById('stock-alerts-banner');
    if (!banner) return;

    try {
        const data = await api('stock.php?action=alerts');
        if (data.count === 0) {
            banner.innerHTML = '';
            return;
        }

        banner.innerHTML = `
            <div class="stock-alerts-box">
                <div class="stock-alerts-header">
                    <span class="material-icons-round">warning</span>
                    <strong>${data.count} product${data.count > 1 ? 's' : ''} below safety stock</strong>
                </div>
                <div class="stock-alerts-list">
                    ${data.alerts.map(a => `
                        <div class="stock-alert-item">
                            <span class="shop-dot" style="background:${a.shop_color}"></span>
                            <span class="stock-alert-name">${a.shop_name} — ${a.name}</span>
                            <span class="stock-alert-qty">${a.last_quantity !== null ? a.last_quantity : 'No count'} / ${a.safety_stock} ${a.unit}</span>
                        </div>
                    `).join('')}
                </div>
            </div>`;
    } catch (e) {
        banner.innerHTML = '';
    }
}

// ═══════════════════════════════════════════
// CHECK STOCK ALERTS (for badge)
// ═══════════════════════════════════════════
async function checkStockAlerts() {
    if (!isManager()) return;
    try {
        const data = await api('stock.php?action=alerts');
        const badge = document.getElementById('stock-badge');
        if (!badge) return;
        if (data.count > 0) {
            badge.textContent = data.count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    } catch (e) { /* silent */ }
}

// ═══════════════════════════════════════════
// ADD PRODUCT MODAL
// ═══════════════════════════════════════════
function openAddProductModal() {
    const shops = App.shops;
    const body = `
        <form id="product-form">
            <div class="input-group">
                <label>Shop</label>
                <select id="product-shop" required style="padding-left:0.75rem">
                    ${shops.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                </select>
            </div>
            <div class="input-group" style="margin-top:12px">
                <label>Product Name</label>
                <input type="text" id="product-name" placeholder="e.g. Ron, Whisky, Napkins" required style="padding-left:0.75rem">
            </div>
            <div class="input-group" style="margin-top:12px">
                <label>Unit</label>
                <input type="text" id="product-unit" placeholder="e.g. bottles, boxes, packages" value="units" style="padding-left:0.75rem">
            </div>
            <div class="input-group" style="margin-top:12px">
                <label>Safety Stock (minimum)</label>
                <input type="number" id="product-safety" min="0" value="0" style="padding-left:0.75rem">
            </div>
        </form>
    `;

    const footer = `
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveProduct()">
            <span class="material-icons-round">add_circle</span> Create
        </button>
    `;

    openModal('Add Stock Product', body, footer);
}

async function saveProduct() {
    const shopId = document.getElementById('product-shop').value;
    const name = document.getElementById('product-name').value.trim();
    const unit = document.getElementById('product-unit').value.trim() || 'units';
    const safetyStock = parseInt(document.getElementById('product-safety').value) || 0;

    if (!name) return showToast('Product name is required', 'error');

    try {
        await api('stock.php?action=products', 'POST', { shop_id: shopId, name, unit, safety_stock: safetyStock });
        showToast('Product created successfully', 'success');
        closeModal();
        loadStockView();
        if (isManager()) loadStockAlertsBanner();
    } catch (err) {
        showToast(err.error || 'Failed to create product', 'error');
    }
}

// ═══════════════════════════════════════════
// EDIT PRODUCT MODAL
// ═══════════════════════════════════════════
function openEditProductModal(productId) {
    const p = stockProducts.find(x => x.id === productId || x.id === String(productId));
    if (!p) return showToast('Product not found', 'error');

    const body = `
        <form id="edit-product-form">
            <div class="input-group">
                <label>Product Name</label>
                <input type="text" id="edit-product-name" value="${p.name}" required style="padding-left:0.75rem">
            </div>
            <div class="input-group" style="margin-top:12px">
                <label>Unit</label>
                <input type="text" id="edit-product-unit" value="${p.unit}" style="padding-left:0.75rem">
            </div>
            <div class="input-group" style="margin-top:12px">
                <label>Safety Stock (minimum)</label>
                <input type="number" id="edit-product-safety" min="0" value="${p.safety_stock}" style="padding-left:0.75rem">
            </div>
        </form>
    `;

    const footer = `
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="updateProduct(${p.id})">
            <span class="material-icons-round">save</span> Save
        </button>
    `;

    openModal('Edit Product', body, footer);
}

async function updateProduct(id) {
    const name = document.getElementById('edit-product-name').value.trim();
    const unit = document.getElementById('edit-product-unit').value.trim();
    const safetyStock = parseInt(document.getElementById('edit-product-safety').value) || 0;

    if (!name) return showToast('Product name is required', 'error');

    try {
        await api('stock.php?action=products', 'PUT', { id, name, unit, safety_stock: safetyStock });
        showToast('Product updated', 'success');
        closeModal();
        loadStockView();
        if (isManager()) loadStockAlertsBanner();
    } catch (err) {
        showToast(err.error || 'Failed to update product', 'error');
    }
}

// ═══════════════════════════════════════════
// DEACTIVATE PRODUCT
// ═══════════════════════════════════════════
async function deactivateProduct(id, name) {
    if (!confirm(`Deactivate "${name}"? It won't appear in daily counts anymore.`)) return;

    try {
        await api(`stock.php?action=products&id=${id}`, 'DELETE');
        showToast(`${name} deactivated`, 'success');
        loadStockView();
        if (isManager()) loadStockAlertsBanner();
    } catch (err) {
        showToast(err.error || 'Failed to deactivate product', 'error');
    }
}

// ═══════════════════════════════════════════
// PRODUCT HISTORY MODAL
// ═══════════════════════════════════════════
async function viewProductHistory(productId, productName) {
    openModal('History — ' + productName, '<div class="stock-loading"><span class="material-icons-round spin">sync</span> Loading...</div>', '');

    try {
        const entries = await api(`stock.php?action=history&product_id=${productId}&limit=14`);

        if (entries.length === 0) {
            document.getElementById('modal-body').innerHTML = '<p class="text-muted" style="text-align:center;padding:20px">No history entries yet</p>';
            return;
        }

        const product = stockProducts.find(p => p.id === productId || p.id === String(productId));
        const safetyStock = product ? product.safety_stock : 0;

        let html = `
            <div class="table-responsive">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Quantity</th>
                            <th>Recorded By</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${entries.map(e => {
            const isLow = safetyStock > 0 && e.quantity < safetyStock;
            return `
                            <tr>
                                <td>${formatDate(e.entry_date)}</td>
                                <td><strong>${e.quantity}</strong></td>
                                <td>${e.recorded_by_name}</td>
                                <td>${isLow
                    ? '<span class="tag" style="background:rgba(239,68,68,0.15);color:#ef4444"><span class="material-icons-round" style="font-size:14px">warning</span> Low</span>'
                    : '<span class="tag" style="background:rgba(16,185,129,0.15);color:#10b981">OK</span>'
                }</td>
                            </tr>`;
        }).join('')}
                    </tbody>
                </table>
            </div>`;

        document.getElementById('modal-body').innerHTML = html;
    } catch (e) {
        document.getElementById('modal-body').innerHTML = '<p style="color:var(--danger);text-align:center">Error loading history</p>';
    }
}

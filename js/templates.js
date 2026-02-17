// Templates Module
// Handles bulk shift generation based on weekly patterns

let templateState = {
    pattern: {} // Key: 1-7, Value: Array of slots {start, end, count}
};

function renderTemplates(container) {
    container.innerHTML = `
        <div class="page-header">
            <h2 class="page-title">Bulk Shift Generator</h2>
            <p class="text-muted">Create shifts for an entire season based on a weekly pattern.</p>
        </div>
        <div id="templates-content"></div>
    `;
    renderTemplateForm(document.getElementById('templates-content'));
}

function renderTemplateForm(container) {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    let patternRows = days.map((day, index) => {
        const dayNum = index + 1;
        return `
            <div class="card mb-3">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">${day}</h5>
                    <button class="btn btn-sm btn-outline-primary" onclick="addTemplateSlot(${dayNum})">Add Slot</button>
                </div>
                <div class="card-body" id="template-day-${dayNum}">
                    <!-- Slots will go here -->
                    <p class="text-muted small fst-italic no-slots-msg">No shifts defined for this day.</p>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="row">
            <div class="col-md-4">
                <div class="card mb-4 sticky-top" style="top: 20px; z-index: 100;">
                    <div class="card-body">
                        <h4>Generator Settings</h4>
                        
                        <div class="mb-3">
                            <label class="form-label">Shop</label>
                            <select id="template-shop-select" class="form-select">
                                <!-- Populated by loadShops -->
                            </select>
                        </div>
                        
                        <div class="mb-3">
                            <label class="form-label">Date Range</label>
                            <div class="input-group mb-2">
                                <span class="input-group-text">From</span>
                                <input type="date" id="template-date-start" class="form-control">
                            </div>
                            <div class="input-group">
                                <span class="input-group-text">To</span>
                                <input type="date" id="template-date-end" class="form-control">
                            </div>
                        </div>
                        
                        <button class="btn btn-primary w-100" onclick="generateTemplateShifts()">
                            <span class="material-icons-round align-middle">auto_awesome</span>
                            Generate Shifts
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="col-md-8">
                <h4>Weekly Pattern</h4>
                <p class="text-muted">Define the shifts for each day of the week.</p>
                ${patternRows}
            </div>
        </div>
    `;

    // Populate Shops
    const shopSelect = document.getElementById('template-shop-select');
    App.shops.forEach(shop => {
        const opt = document.createElement('option');
        opt.value = shop.id;
        opt.textContent = shop.name;
        shopSelect.appendChild(opt);
    });
}

function addTemplateSlot(dayNum) {
    const container = document.getElementById(`template-day-${dayNum}`);
    const noSlotsMsg = container.querySelector('.no-slots-msg');
    if (noSlotsMsg) noSlotsMsg.style.display = 'none';

    const slotId = Date.now();
    const div = document.createElement('div');
    div.className = 'row g-2 align-items-center mb-2 template-slot';
    div.dataset.id = slotId;
    div.innerHTML = `
        <div class="col-auto">
            <input type="time" class="form-control" name="start" value="09:00">
        </div>
        <div class="col-auto">
            <span>to</span>
        </div>
        <div class="col-auto">
            <input type="time" class="form-control" name="end" value="17:00">
        </div>
        <div class="col-auto">
            <div class="input-group" style="width: 120px;">
                <span class="input-group-text">Qty</span>
                <input type="number" class="form-control" name="count" value="1" min="1" max="10">
            </div>
        </div>
        <div class="col-auto">
            <button class="btn btn-outline-danger btn-sm" onclick="removeTemplateSlot(this)"><span class="material-icons-round">delete</span></button>
        </div>
    `;
    container.appendChild(div);
}

function removeTemplateSlot(btn) {
    btn.closest('.template-slot').remove();
}

async function generateTemplateShifts() {
    const shopId = document.getElementById('template-shop-select').value;
    const dateStart = document.getElementById('template-date-start').value;
    const dateEnd = document.getElementById('template-date-end').value;

    if (!shopId || !dateStart || !dateEnd) {
        showToast('Please select shop and date range', 'error');
        return;
    }

    // Build pattern object
    const pattern = {};
    for (let i = 1; i <= 7; i++) {
        const container = document.getElementById(`template-day-${i}`);
        const slots = container.querySelectorAll('.template-slot');
        if (slots.length > 0) {
            pattern[i] = [];
            slots.forEach(slot => {
                const start = slot.querySelector('input[name="start"]').value;
                const end = slot.querySelector('input[name="end"]').value;
                const count = slot.querySelector('input[name="count"]').value;
                pattern[i].push({ start, end, count });
            });
        }
    }

    if (Object.keys(pattern).length === 0) {
        showToast('Please define at least one shift pattern', 'warning');
        return;
    }

    if (!confirm('This will generate shifts for the selected range. Continue?')) return;

    try {
        const res = await api('templates.php', 'POST', {
            shop_id: shopId,
            date_start: dateStart,
            date_end: dateEnd,
            pattern: pattern
        });

        if (res.success) {
            showToast(res.message, 'success');

            // Auto-redirect to calendar with correct filters
            if (typeof shiftsFilters !== 'undefined') {
                shiftsFilters.date_from = dateStart;
                shiftsFilters.date_to = dateEnd;
                shiftsFilters.shop_id = shopId;
            }
            navigateTo('shifts');
        }
    } catch (err) {
        showToast(err.error || 'Failed to generate shifts', 'error');
    }
}

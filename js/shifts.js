/**
 * SHIFTS.JS — Shift assignment with filters and overlap detection
 */

let shiftsFilters = {
    shop_id: '',
    employee_id: '',
    date_from: '',
    date_to: '',
};

async function renderShifts(container) {
    // Default filter: current week
    if (!shiftsFilters.date_from) {
        const today = new Date();
        const monday = new Date(today);
        monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        shiftsFilters.date_from = formatDateISO(monday);
        shiftsFilters.date_to = formatDateISO(sunday);
    }

    // Load employees if needed
    if (App.employees.length === 0) {
        try { App.employees = await api('employees.php'); } catch (e) { }
    }

    container.innerHTML = `
        <div class="page-header">
            <h2 class="page-title">Shifts</h2>
            ${isManager() ? '<button class="btn btn-primary" onclick="openShiftModal()"><span class="material-icons-round">add</span><span>New Shift</span></button>' : ''}
        </div>
        <div class="filters-bar">
            <select id="shift-filter-shop" onchange="shiftsFilters.shop_id=this.value; loadShifts()">
                <option value="">All Shops</option>
                ${App.shops.map(s => `<option value="${s.id}" ${shiftsFilters.shop_id == s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
            </select>
            <select id="shift-filter-emp" onchange="shiftsFilters.employee_id=this.value; loadShifts()">
                <option value="">All Staff</option>
                ${App.employees.map(e => `<option value="${e.id}" ${shiftsFilters.employee_id == e.id ? 'selected' : ''}>${e.name}</option>`).join('')}
            </select>
            <input type="date" id="shift-filter-from" value="${shiftsFilters.date_from}" onchange="shiftsFilters.date_from=this.value; loadShifts()">
            <input type="date" id="shift-filter-to" value="${shiftsFilters.date_to}" onchange="shiftsFilters.date_to=this.value; loadShifts()">
        </div>
        <div id="shifts-list"><div class="spinner"></div></div>
    `;

    loadShifts();
}

async function loadShifts() {
    const el = document.getElementById('shifts-list');
    if (!el) return;
    el.innerHTML = '<div class="spinner"></div>';

    let query = [];
    if (shiftsFilters.shop_id) query.push(`shop_id=${shiftsFilters.shop_id}`);
    if (shiftsFilters.employee_id) query.push(`employee_id=${shiftsFilters.employee_id}`);
    if (shiftsFilters.date_from) query.push(`date_from=${shiftsFilters.date_from}`);
    if (shiftsFilters.date_to) query.push(`date_to=${shiftsFilters.date_to}`);

    try {
        const shifts = await api(`shifts.php?${query.join('&')}`);

        if (shifts.length === 0) {
            el.innerHTML = `<div class="empty-state">
                <span class="material-icons-round">event_busy</span>
                <p>No shifts found for these filters</p>
            </div>`;
            return;
        }

        // Group by date
        const grouped = {};
        shifts.forEach(s => {
            if (!grouped[s.shift_date]) grouped[s.shift_date] = [];
            grouped[s.shift_date].push(s);
        });

        el.innerHTML = Object.entries(grouped).map(([date, dayShifts]) => `
            <div class="mb-2">
                <div class="dash-section-title">${formatDate(date)}</div>
                <div class="shifts-list">
                    ${dayShifts.map(s => {
            const isUnassigned = s.is_unassigned == 1;
            const cardClass = isUnassigned ? 'shift-item shift-unassigned' : 'shift-item';
            const empName = isUnassigned ? 'OPEN SHIFT' : s.employee_name;
            const clickAction = isManager() ? (isUnassigned ? `openUnassignedShiftModal(${s.id}, '${s.shop_name}', '${s.shift_date}', '${s.start_time}', '${s.end_time}')` : `openShiftModal(${s.id})`) : '';

            return `
                        <div class="${cardClass}" style="border-left-color: ${s.shop_color}" onclick="${clickAction}">
                            <div class="shift-time">${formatTime(s.start_time)} - ${formatTime(s.end_time)}</div>
                            <div class="shift-details">
                                <div class="shift-employee">${empName}</div>
                                <div class="shift-shop">
                                    <span class="shop-dot" style="background:${s.shop_color}"></span>
                                    ${s.shop_name}
                                </div>
                            </div>
                            ${isManager() ? `
                                <button class="btn-icon" onclick="event.stopPropagation(); deleteShift(${s.id})" title="Cancel shift">
                                    <span class="material-icons-round">close</span>
                                </button>
                            ` : ''}
                        </div>`;
        }).join('')}
                </div>
            </div>
        `).join('');

    } catch (err) {
        el.innerHTML = `<div class="alert-card alert-danger">
            <span class="material-icons-round">error</span>
            <span>${err.error || 'Failed to load shifts'}</span>
        </div>`;
    }
}

function openShiftModal(editId = null) {
    // For edit, we'd need to fetch shift data — for simplicity we just do create
    const today = formatDateISO(new Date());

    const body = `
        <div class="form-group">
            <label class="form-label">Employee</label>
            <select class="input-simple" id="shift-employee" required>
                <option value="">Select employee...</option>
                ${App.employees.map(e => `<option value="${e.id}">${e.name}</option>`).join('')}
            </select>
        </div>
        <div class="form-group">
            <label class="form-label">Shop</label>
            <select class="input-simple" id="shift-shop" required>
                ${App.shops.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
            </select>
        </div>
        <div class="form-group">
            <label class="form-label">Date</label>
            <input type="date" class="input-simple" id="shift-date" value="${today}" required>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">Start Time</label>
                <input type="time" class="input-simple" id="shift-start" value="09:00" required>
            </div>
            <div class="form-group">
                <label class="form-label">End Time</label>
                <input type="time" class="input-simple" id="shift-end" value="17:00" required>
            </div>
        </div>
        <div class="form-group">
            <label class="form-label">Notes (optional)</label>
            <input type="text" class="input-simple" id="shift-notes" placeholder="e.g. Opening shift">
        </div>
        <div id="shift-overlap-warning"></div>
    `;

    const footer = `
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveShift()" id="shift-save-btn">
            <span class="material-icons-round">save</span> Create Shift
        </button>
    `;

    openModal('New Shift', body, footer);
}

async function saveShift(forceTimeOff = false) {
    const employeeId = document.getElementById('shift-employee').value;
    const shopId = document.getElementById('shift-shop').value;
    const date = document.getElementById('shift-date').value;
    const startTime = document.getElementById('shift-start').value;
    const endTime = document.getElementById('shift-end').value;
    const notes = document.getElementById('shift-notes').value.trim();

    if (!employeeId || !shopId || !date || !startTime || !endTime) {
        showToast('All fields are required', 'error');
        return;
    }

    const btn = document.getElementById('shift-save-btn');
    btn.disabled = true;

    try {
        await api('shifts.php', 'POST', {
            employee_id: parseInt(employeeId),
            shop_id: parseInt(shopId),
            date, start_time: startTime, end_time: endTime, notes,
            force_timeoff: forceTimeOff,
        });
        showToast('Shift created');
        document.getElementById('shift-overlap-warning').innerHTML = ''; // Clear warning
        closeModal();
        loadShifts();
    } catch (err) {
        if (err.status === 409 && err.error === 'time_off_conflict') {
            // Time off conflict — show warning with override option
            const warn = document.getElementById('shift-overlap-warning');
            warn.innerHTML = `<div class="alert-card alert-danger mt-1" style="flex-direction:column; align-items:flex-start; gap:8px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="material-icons-round">event_busy</span>
                    <span><strong>⚠️ Time Off Conflict!</strong></span>
                </div>
                <div class="text-sm">${err.message}</div>
                <button class="btn btn-sm btn-warning" onclick="saveShift(true)" style="margin-top:4px;">
                    <span class="material-icons-round">warning</span> Force Assign Anyway
                </button>
            </div>`;
            btn.disabled = false;
        } else if (err.status === 409) {
            // Overlap!
            const warn = document.getElementById('shift-overlap-warning');
            warn.innerHTML = `<div class="alert-card alert-warning mt-1">
                <span class="material-icons-round">warning</span>
                <span><strong>Overlap!</strong> This employee already has a shift at ${err.conflict.shop} (${err.conflict.time})</span>
            </div>`;
            btn.disabled = false;
        } else {
            // General error
            const warn = document.getElementById('shift-overlap-warning');
            warn.innerHTML = `<div class="alert-card alert-danger mt-1">
                <span class="material-icons-round">error</span>
                <span><strong>Error:</strong> ${err.message || err.error || 'Unknown error'}</span>
            </div>`;
            showToast(err.error || 'Failed to create shift', 'error');
            btn.disabled = false;
        }
    }
}


async function deleteShift(id) {
    if (!confirm('Cancel this shift?')) return;
    try {
        await api(`shifts.php?id=${id}`, 'DELETE');
        showToast('Shift cancelled');
        loadShifts();
    } catch (err) {
        showToast(err.error || 'Failed to cancel', 'error');
    }
}

function openUnassignedShiftModal(shiftId, shopName, date, start, end) {
    const body = `
        <div class="alert-card alert-info mb-3">
            <span class="material-icons-round">info</span>
            <div>
                <strong>Assigning Open Shift</strong><br>
                ${shopName} — ${formatDate(date)} (${formatTime(start)} - ${formatTime(end)})
            </div>
        </div>
        <div class="form-group">
            <label class="form-label">Select Employee</label>
            <select class="input-simple" id="assign-employee" required>
                <option value="">Select employee...</option>
                ${App.employees.map(e => `<option value="${e.id}">${e.name}</option>`).join('')}
            </select>
        </div>
    `;

    const footer = `
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="assignShift(${shiftId})">
            <span class="material-icons-round">check</span> Assign
        </button>
    `;

    openModal('Assign Staff', body, footer);
}

async function assignShift(shiftId) {
    const employeeId = document.getElementById('assign-employee').value;
    if (!employeeId) {
        showToast('Please select an employee', 'error');
        return;
    }

    try {
        await api('shifts.php', 'PUT', {
            id: shiftId,
            employee_id: employeeId,
            is_unassigned: 0
        });
        showToast('Shift assigned successfully');
        closeModal();
        loadShifts();
    } catch (err) {
        showToast(err.error || 'Failed to assign shift', 'error');
    }
}

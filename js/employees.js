/**
 * EMPLOYEES.JS — Staff management module
 */

async function renderEmployees(container) {
    container.innerHTML = `
        <div class="page-header">
            <h2 class="page-title">Staff</h2>
            ${isManager() ? '<button class="btn btn-primary" onclick="openEmployeeModal()"><span class="material-icons-round">person_add</span><span>Add Employee</span></button>' : ''}
        </div>
        <div id="emp-list"><div class="spinner"></div></div>
    `;

    try {
        const employees = await api('employees.php');
        App.employees = employees;
        const el = document.getElementById('emp-list');

        if (employees.length === 0) {
            el.innerHTML = `<div class="empty-state">
                <span class="material-icons-round">groups</span>
                <p>No employees yet. Add your first staff member!</p>
            </div>`;
            return;
        }

        el.innerHTML = `<div class="card-grid">${employees.map(emp => {
            const availDays = emp.availability ? [...new Set(emp.availability.map(a => DAYS[a.day_of_week]))].join(', ') : 'Not set';
            return `
                <div class="emp-card" onclick="openEmployeeDetail(${emp.id})">
                    <div class="emp-avatar">${getInitials(emp.name)}</div>
                    <div class="emp-info">
                        <div class="emp-name">${emp.name}</div>
                        <div class="emp-role">${emp.role || 'No role'}</div>
                        <div class="emp-meta">
                            <span><span class="material-icons-round">phone</span>${emp.phone || '—'}</span>
                            <span><span class="material-icons-round">schedule</span>${emp.max_weekly_hours}h/wk</span>
                        </div>
                        <div class="emp-meta mt-1">
                            <span><span class="material-icons-round">calendar_today</span>${availDays}</span>
                        </div>
                    </div>
                    ${isManager() ? `<div class="emp-actions">
                        <button class="btn-icon" onclick="event.stopPropagation(); openEmployeeModal(${emp.id})" title="Edit">
                            <span class="material-icons-round">edit</span>
                        </button>
                        <button class="btn-icon" onclick="event.stopPropagation(); deleteEmployee(${emp.id}, '${emp.name}')" title="Delete">
                            <span class="material-icons-round">delete</span>
                        </button>
                    </div>` : ''}
                </div>`;
        }).join('')}</div>`;
    } catch (err) {
        document.getElementById('emp-list').innerHTML = `
            <div class="alert-card alert-danger">
                <span class="material-icons-round">error</span>
                <span>Failed to load employees: ${err.error || 'Unknown error'}</span>
            </div>`;
    }
}

function openEmployeeDetail(id) {
    const emp = App.employees.find(e => e.id == id);
    if (!emp) return;

    const availHTML = emp.availability && emp.availability.length > 0
        ? emp.availability.map(a => `<div class="shop-shift-row">
            <span class="material-icons-round">schedule</span>
            <strong>${DAYS_FULL[a.day_of_week]}</strong>
            <span class="text-muted">${formatTime(a.start_time)} - ${formatTime(a.end_time)}</span>
          </div>`).join('')
        : '<div class="text-muted text-sm">No availability set</div>';

    openModal(emp.name, `
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:1rem;">
            <div class="emp-avatar" style="width:56px;height:56px;font-size:1.3rem">${getInitials(emp.name)}</div>
            <div>
                <div style="font-weight:600; font-size:1rem;">${emp.name}</div>
                <div class="text-muted">${emp.role || 'No role assigned'}</div>
                <div class="text-muted text-sm">${emp.phone || 'No phone'}</div>
            </div>
        </div>
        <div class="form-label" style="margin-top:1rem">Max Weekly Hours</div>
        <div style="font-size:1.1rem; font-weight:600; margin-bottom:1rem;">${emp.max_weekly_hours}h</div>
        <div class="form-label">Availability</div>
        ${availHTML}
    `, isManager() ? `<button class="btn btn-primary" onclick="closeModal(); openEmployeeModal(${emp.id})">
        <span class="material-icons-round">edit</span> Edit
    </button>` : '');
}

function openEmployeeModal(id = null) {
    const emp = id ? App.employees.find(e => e.id == id) : null;
    const title = emp ? 'Edit Employee' : 'Add Employee';

    // Build availability checkboxes
    const activeDays = emp && emp.availability ? emp.availability.map(a => a.day_of_week) : [];

    const body = `
        <div class="form-group">
            <label class="form-label">Name</label>
            <input type="text" class="input-simple" id="emp-name" value="${emp ? emp.name : ''}" placeholder="Full name" required>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">Phone</label>
                <input type="tel" class="input-simple" id="emp-phone" value="${emp ? (emp.phone || '') : ''}" placeholder="+1 234 567">
            </div>
            <div class="form-group">
                <label class="form-label">Role</label>
                <input type="text" class="input-simple" id="emp-role" value="${emp ? (emp.role || '') : ''}" placeholder="e.g. Sales, Cashier">
            </div>
        </div>
        <div class="form-group">
            <label class="form-label">Max Weekly Hours</label>
            <input type="number" class="input-simple" id="emp-max-hours" value="${emp ? emp.max_weekly_hours : 40}" min="1" max="80" step="0.5">
        </div>
        ${!emp ? `<div class="form-group">
            <label class="form-label">Link to User Account (optional)</label>
            <select class="input-simple" id="emp-link-user">
                <option value="">— None —</option>
                ${Array.from({ length: 10 }, (_, i) => `<option value="staff${i + 1}">staff${i + 1}</option>`).join('')}
            </select>
        </div>` : ''}
        <div class="form-group">
            <label class="form-label">Available Days</label>
            <div class="avail-grid" id="avail-days">
                ${DAYS.map((d, i) => `<div class="avail-day ${activeDays.includes(i) ? 'active' : ''}" data-day="${i}" onclick="this.classList.toggle('active')">${d}</div>`).join('')}
            </div>
        </div>
        <div class="form-row" id="avail-times">
            <div class="form-group">
                <label class="form-label">Available From</label>
                <input type="time" class="input-simple" id="emp-avail-from" value="${emp && emp.availability && emp.availability[0] ? emp.availability[0].start_time.substring(0, 5) : '09:00'}">
            </div>
            <div class="form-group">
                <label class="form-label">Available Until</label>
                <input type="time" class="input-simple" id="emp-avail-to" value="${emp && emp.availability && emp.availability[0] ? emp.availability[0].end_time.substring(0, 5) : '18:00'}">
            </div>
        </div>
    `;

    const footer = `
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveEmployee(${id || 'null'})" id="emp-save-btn">
            <span class="material-icons-round">save</span> ${emp ? 'Update' : 'Create'}
        </button>
    `;

    openModal(title, body, footer);
}

async function saveEmployee(id) {
    const name = document.getElementById('emp-name').value.trim();
    const phone = document.getElementById('emp-phone').value.trim();
    const role = document.getElementById('emp-role').value.trim();
    const maxHours = parseFloat(document.getElementById('emp-max-hours').value) || 40;

    if (!name) { showToast('Name is required', 'error'); return; }

    // Build availability
    const activeDays = document.querySelectorAll('#avail-days .avail-day.active');
    const fromTime = document.getElementById('emp-avail-from').value || '09:00';
    const toTime = document.getElementById('emp-avail-to').value || '18:00';

    const availability = Array.from(activeDays).map(d => ({
        day_of_week: parseInt(d.dataset.day),
        start_time: fromTime,
        end_time: toTime,
    }));

    const body = { name, phone, role, max_weekly_hours: maxHours, availability };

    // Link user for new employees
    if (!id) {
        const linkEl = document.getElementById('emp-link-user');
        if (linkEl && linkEl.value) body.link_username = linkEl.value;
    }

    try {
        const btn = document.getElementById('emp-save-btn');
        btn.disabled = true;

        if (id) {
            body.id = id;
            await api('employees.php', 'PUT', body);
            showToast('Employee updated');
        } else {
            await api('employees.php', 'POST', body);
            showToast('Employee created');
        }
        closeModal();
        navigateTo('staff');
    } catch (err) {
        showToast(err.error || 'Failed to save', 'error');
    }
}

async function deleteEmployee(id, name) {
    openModal('Delete Employee', `
        <p>Are you sure you want to deactivate <strong>${name}</strong>?</p>
        <p class="text-muted text-sm mt-1">This won't delete their data, just mark them as inactive.</p>
    `, `
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-danger" onclick="confirmDeleteEmployee(${id})">
            <span class="material-icons-round">delete</span> Deactivate
        </button>
    `);
}

async function confirmDeleteEmployee(id) {
    try {
        await api(`employees.php?id=${id}`, 'DELETE');
        showToast('Employee deactivated');
        closeModal();
        navigateTo('staff');
    } catch (err) {
        showToast(err.error || 'Failed to deactivate', 'error');
    }
}

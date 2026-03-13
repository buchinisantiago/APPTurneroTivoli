/**
 * AVAILABILITY.JS — Weekly schedule editor + time-off management + manager timeline
 */

// ═══════════════════════════════════════════
// MAIN RENDER
// ═══════════════════════════════════════════
async function renderAvailability(container) {
    const empId = App.user?.employee_id || null;
    const mgr = isManager();

    container.innerHTML = `
        <div class="page-header">
            <h2 class="page-title">Availability</h2>
            ${empId || mgr ? `<button class="btn btn-primary btn-sm" onclick="openTimeOffForm()">
                <span class="material-icons-round">event_busy</span> Request Time Off
            </button>` : ''}
        </div>

        ${mgr ? `
        <!-- Manager: Day selector + Staff availability timeline -->
        <div class="dash-section">
            <div class="dash-section-title">📊 Staff Availability Overview</div>
            <div class="avail-day-tabs" id="avail-day-tabs"></div>
            <div id="avail-timeline-container"><div class="spinner"></div></div>
        </div>
        ` : ''}

        ${empId ? `
        <!-- Staff: Weekly schedule editor -->
        <div class="dash-section">
            <div class="dash-section-title">📅 My Weekly Schedule</div>
            <p class="text-sm text-muted" style="margin-bottom:0.75rem;">Set the hours you're available to work each day.</p>
            <div id="weekly-schedule-editor"><div class="spinner"></div></div>
        </div>
        ` : ''}

        <!-- Time off requests -->
        <div id="availability-content"><div class="spinner"></div></div>
    `;

    // Load everything
    if (mgr) loadAvailTimeline();
    if (empId) loadWeeklySchedule();
    loadAvailability();
}

// ═══════════════════════════════════════════
// FEATURE 2: STAFF WEEKLY SCHEDULE EDITOR
// ═══════════════════════════════════════════
async function loadWeeklySchedule() {
    const editor = document.getElementById('weekly-schedule-editor');
    if (!editor) return;

    const empId = App.user?.employee_id;
    if (!empId) {
        editor.innerHTML = '<div class="text-muted text-sm" style="padding:0.5rem;">No employee profile linked.</div>';
        return;
    }

    try {
        const emp = await api(`employees.php?id=${empId}`);
        const slots = emp.availability || [];
        renderWeeklyEditor(editor, slots);
    } catch (err) {
        editor.innerHTML = `<div class="alert-card alert-danger">
            <span class="material-icons-round">error</span>
            <span>${err.error || 'Failed to load schedule'}</span>
        </div>`;
    }
}

function renderWeeklyEditor(container, slots) {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    // day_of_week: 0=Sun, 1=Mon ... 6=Sat  → remap
    const dayMap = [1, 2, 3, 4, 5, 6, 0]; // Mon=1 ... Sun=0

    let html = '<div class="weekly-editor">';
    days.forEach((dayName, idx) => {
        const dow = dayMap[idx];
        const daySlots = slots.filter(s => parseInt(s.day_of_week) === dow);

        html += `
        <div class="weekly-day-card card" style="margin-bottom:0.5rem;">
            <div class="weekly-day-header">
                <span class="weekly-day-name">${dayName}</span>
                <button class="btn btn-ghost btn-sm" onclick="addScheduleSlot(${dow}, '${dayName}')">
                    <span class="material-icons-round" style="font-size:16px;">add</span> Add
                </button>
            </div>
            <div class="weekly-day-slots" id="schedule-day-${dow}">
                ${daySlots.length === 0
                ? '<div class="text-muted text-sm weekly-no-slots">No hours set — day off</div>'
                : daySlots.map(s => renderScheduleSlot(dow, s)).join('')
            }
            </div>
        </div>`;
    });

    html += `
        <button class="btn btn-primary btn-full" onclick="saveWeeklySchedule()" style="margin-top:0.75rem;">
            <span class="material-icons-round">save</span> Save Schedule
        </button>
    </div>`;

    container.innerHTML = html;
}

function renderScheduleSlot(dow, slot) {
    const start = (slot.start_time || '09:00').substring(0, 5);
    const end = (slot.end_time || '17:00').substring(0, 5);
    return `
        <div class="schedule-slot" data-dow="${dow}">
            <input type="time" class="input-simple schedule-time" value="${start}" data-field="start">
            <span class="text-muted text-sm">to</span>
            <input type="time" class="input-simple schedule-time" value="${end}" data-field="end">
            <button class="btn-icon" onclick="this.closest('.schedule-slot').remove()" title="Remove">
                <span class="material-icons-round" style="font-size:18px; color:var(--danger);">close</span>
            </button>
        </div>`;
}

function addScheduleSlot(dow, dayName) {
    const container = document.getElementById(`schedule-day-${dow}`);
    if (!container) return;

    // Hide "No hours" message
    const noSlots = container.querySelector('.weekly-no-slots');
    if (noSlots) noSlots.remove();

    container.insertAdjacentHTML('beforeend', renderScheduleSlot(dow, {
        start_time: '09:00',
        end_time: '17:00'
    }));
}

async function saveWeeklySchedule() {
    const empId = App.user?.employee_id;
    if (!empId) return;

    // Collect all slots
    const availability = [];
    document.querySelectorAll('.schedule-slot').forEach(slot => {
        const dow = parseInt(slot.dataset.dow);
        const start = slot.querySelector('[data-field="start"]').value;
        const end = slot.querySelector('[data-field="end"]').value;
        if (start && end) {
            availability.push({ day_of_week: dow, start_time: start, end_time: end });
        }
    });

    try {
        await api('employees.php', 'PUT', {
            id: empId,
            availability: availability
        });
        showToast('Schedule saved! ✅', 'success');
    } catch (err) {
        showToast(err.error || 'Failed to save schedule', 'error');
    }
}

// ═══════════════════════════════════════════
// FEATURE 3: MANAGER AVAILABILITY TIMELINE
// ═══════════════════════════════════════════
let availTimelineDay = 1; // Default: Monday

async function loadAvailTimeline() {
    const tabsEl = document.getElementById('avail-day-tabs');
    const container = document.getElementById('avail-timeline-container');
    if (!tabsEl || !container) return;

    // Render day tabs
    const days = [
        { dow: 1, label: 'Mon' },
        { dow: 2, label: 'Tue' },
        { dow: 3, label: 'Wed' },
        { dow: 4, label: 'Thu' },
        { dow: 5, label: 'Fri' },
        { dow: 6, label: 'Sat' },
        { dow: 0, label: 'Sun' },
    ];
    tabsEl.innerHTML = days.map(d =>
        `<button class="avail-day-tab ${d.dow === availTimelineDay ? 'active' : ''}"
                 onclick="switchAvailDay(${d.dow})">${d.label}</button>`
    ).join('');

    // Load all employees
    try {
        const employees = await api('employees.php');
        App.employees = employees;
        renderAvailTimeline(container, employees, availTimelineDay);
    } catch (err) {
        container.innerHTML = `<div class="alert-card alert-danger">
            <span class="material-icons-round">error</span>
            <span>${err.error || 'Failed to load employees'}</span>
        </div>`;
    }
}

function switchAvailDay(dow) {
    availTimelineDay = dow;
    // Update tabs
    document.querySelectorAll('.avail-day-tab').forEach(tab => {
        tab.classList.toggle('active', parseInt(tab.textContent === 'Mon' ? 1 :
            tab.textContent === 'Tue' ? 2 : tab.textContent === 'Wed' ? 3 :
                tab.textContent === 'Thu' ? 4 : tab.textContent === 'Fri' ? 5 :
                    tab.textContent === 'Sat' ? 6 : 0) === dow);
    });
    // Re-render with updated tabs
    document.querySelectorAll('.avail-day-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.avail-day-tab[onclick="switchAvailDay(${dow})"]`)?.classList.add('active');

    const container = document.getElementById('avail-timeline-container');
    if (container && App.employees) {
        renderAvailTimeline(container, App.employees, dow);
    }
}

function renderAvailTimeline(container, employees, dow) {
    const startHour = 6;
    const endHour = 24;
    const totalHours = endHour - startHour;

    // Filter employees who have availability for this day
    const empsWithAvail = employees.map(emp => {
        const daySlots = (emp.availability || []).filter(s => parseInt(s.day_of_week) === dow);
        return { ...emp, daySlots };
    });

    // Hour headers
    let hourHeaders = '';
    for (let h = startHour; h < endHour; h++) {
        const label = h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;
        hourHeaders += `<div class="atl-hour-label">${label}</div>`;
    }

    // Employee rows
    let rows = '';
    empsWithAvail.forEach(emp => {
        const initials = getInitials(emp.name);
        const hasSlots = emp.daySlots.length > 0;

        let barsHTML = '';
        emp.daySlots.forEach(slot => {
            const startMin = timeToMinutes(slot.start_time) - (startHour * 60);
            const endMin = timeToMinutes(slot.end_time) - (startHour * 60);
            const totalMin = totalHours * 60;
            const left = Math.max(0, (startMin / totalMin) * 100);
            const width = Math.max(0, ((endMin - startMin) / totalMin) * 100);
            barsHTML += `<div class="atl-bar" style="left:${left}%;width:${width}%;"
                title="${formatTime(slot.start_time)} – ${formatTime(slot.end_time)}"></div>`;
        });

        rows += `
        <div class="atl-row ${!hasSlots ? 'atl-row-empty' : ''}">
            <div class="atl-emp-label">
                <div class="atl-emp-avatar" style="background:${hasSlots ? 'linear-gradient(135deg, var(--accent), #818cf8)' : 'var(--bg-input)'}">${initials}</div>
                <span class="atl-emp-name">${emp.name}</span>
            </div>
            <div class="atl-track">
                ${barsHTML}
                ${!hasSlots ? '<span class="text-muted text-sm" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);font-size:0.7rem;">Off</span>' : ''}
            </div>
        </div>`;
    });

    // Count available
    const availCount = empsWithAvail.filter(e => e.daySlots.length > 0).length;

    container.innerHTML = `
        <div class="atl-summary">
            <span class="tag tag-success">${availCount} available</span>
            <span class="tag tag-neutral">${employees.length - availCount} off</span>
        </div>
        <div class="atl-grid">
            <div class="atl-header">
                <div class="atl-emp-label-header">Employee</div>
                <div class="atl-hours-header">${hourHeaders}</div>
            </div>
            ${rows}
        </div>`;
}

function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.substring(0, 5).split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

// ═══════════════════════════════════════════
// TIME OFF — Original features (unchanged)
// ═══════════════════════════════════════════
async function loadAvailability() {
    const el = document.getElementById('availability-content');
    if (!el) return;

    const empId = App.user?.employee_id || null;
    const mgr = isManager();

    try {
        let requests;
        if (mgr) {
            requests = await api('timeoff.php');
        } else if (empId) {
            requests = await api(`timeoff.php?employee_id=${empId}`);
        } else {
            el.innerHTML = '<div class="text-muted text-sm" style="padding:1rem;">No employee profile linked to your account.</div>';
            return;
        }

        const pending = requests.filter(r => r.status === 'pending');
        const approved = requests.filter(r => r.status === 'approved');
        const rejected = requests.filter(r => r.status === 'rejected');

        let html = '';

        if (pending.length > 0) {
            html += `<div class="dash-section">
                <div class="dash-section-title">⏳ Pending Requests</div>
                ${pending.map(r => renderTimeOffCard(r, mgr)).join('')}
            </div>`;
        }

        const today = formatDateISO(new Date());
        const upcoming = approved.filter(r => r.date_to >= today);
        const past = approved.filter(r => r.date_to < today);

        if (upcoming.length > 0) {
            html += `<div class="dash-section">
                <div class="dash-section-title">✅ Upcoming Time Off</div>
                ${upcoming.map(r => renderTimeOffCard(r, mgr)).join('')}
            </div>`;
        }

        if (past.length > 0) {
            html += `<div class="dash-section">
                <div class="dash-section-title" style="opacity:0.6">📋 Past Time Off</div>
                ${past.map(r => renderTimeOffCard(r, mgr, true)).join('')}
            </div>`;
        }

        if (rejected.length > 0) {
            html += `<div class="dash-section">
                <div class="dash-section-title" style="opacity:0.6">❌ Rejected</div>
                ${rejected.map(r => renderTimeOffCard(r, mgr, true)).join('')}
            </div>`;
        }

        if (!html) {
            html = `<div class="text-muted" style="text-align:center; padding:3rem;">
                <span class="material-icons-round" style="font-size:3rem; opacity:0.3;">event_available</span>
                <div style="margin-top:0.5rem;">No time off requests yet</div>
            </div>`;
        }

        el.innerHTML = html;

    } catch (err) {
        el.innerHTML = `<div class="alert-card alert-danger">
            <span class="material-icons-round">error</span>
            <span>${err.error || 'Failed to load availability'}</span>
        </div>`;
    }
}

function renderTimeOffCard(r, isManager, faded = false) {
    const typeIcons = {
        vacation: '🏖️',
        unavailable: '🚫',
        sick: '🤒',
        personal: '👤'
    };
    const typeLabels = {
        vacation: 'Vacation',
        unavailable: 'Unavailable',
        sick: 'Sick Leave',
        personal: 'Personal'
    };
    const statusColors = {
        pending: 'warning',
        approved: 'success',
        rejected: 'danger'
    };

    const icon = typeIcons[r.type] || '📅';
    const label = typeLabels[r.type] || r.type;
    const statusColor = statusColors[r.status] || 'info';

    const from = new Date(r.date_from);
    const to = new Date(r.date_to);
    const days = Math.round((to - from) / (1000 * 60 * 60 * 24)) + 1;

    const dateRange = r.date_from === r.date_to
        ? formatDate(r.date_from)
        : `${formatDate(r.date_from)} → ${formatDate(r.date_to)}`;

    let actionsHTML = '';
    if (r.status === 'pending') {
        if (isManager) {
            actionsHTML = `
                <button class="btn btn-sm btn-success" onclick="approveTimeOff(${r.id})">
                    <span class="material-icons-round">check</span> Approve
                </button>
                <button class="btn btn-sm btn-danger" onclick="rejectTimeOff(${r.id})">
                    <span class="material-icons-round">close</span> Reject
                </button>`;
        } else {
            actionsHTML = `
                <button class="btn btn-sm btn-ghost" onclick="cancelTimeOff(${r.id})">
                    <span class="material-icons-round">delete</span> Cancel
                </button>`;
        }
    }

    return `
        <div class="card timeoff-card ${faded ? 'timeoff-faded' : ''}" style="margin-bottom:0.75rem;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; flex-wrap:wrap;">
                <div style="flex:1; min-width:180px;">
                    <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                        <span style="font-size:1.2rem;">${icon}</span>
                        <strong>${isManager ? r.employee_name + ' — ' : ''}${label}</strong>
                        <span class="tag tag-${statusColor}">${r.status.toUpperCase()}</span>
                    </div>
                    <div class="text-sm" style="margin-bottom:4px;">
                        <span class="material-icons-round" style="font-size:0.85rem; vertical-align:middle;">date_range</span>
                        ${dateRange} <span class="text-muted">(${days} day${days > 1 ? 's' : ''})</span>
                    </div>
                    ${r.reason ? `<div class="text-sm text-muted">"${r.reason}"</div>` : ''}
                </div>
                <div style="display:flex; gap:6px; align-items:center;">
                    ${actionsHTML}
                </div>
            </div>
        </div>`;
}

function openTimeOffForm() {
    const empId = App.user?.employee_id || null;
    const mgr = isManager();

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const defaultFrom = formatDateISO(tomorrow);

    let employeeSelect = '';
    if (mgr) {
        employeeSelect = `
            <div class="form-group">
                <label class="form-label">Employee</label>
                <select class="input-simple" id="timeoff-employee" required>
                    <option value="">Select employee...</option>
                    ${App.employees.map(e => `<option value="${e.id}" ${e.id == empId ? 'selected' : ''}>${e.name}</option>`).join('')}
                </select>
            </div>`;
    }

    openModal('Request Time Off', `
        ${employeeSelect}
        <div class="form-group">
            <label class="form-label">Type</label>
            <select class="input-simple" id="timeoff-type">
                <option value="vacation">🏖️ Vacation</option>
                <option value="unavailable">🚫 Unavailable</option>
                <option value="sick">🤒 Sick Leave</option>
                <option value="personal">👤 Personal</option>
            </select>
        </div>
        <div style="display:flex; gap:12px;">
            <div class="form-group" style="flex:1">
                <label class="form-label">From</label>
                <input type="date" class="input-simple" id="timeoff-from" value="${defaultFrom}" required>
            </div>
            <div class="form-group" style="flex:1">
                <label class="form-label">To</label>
                <input type="date" class="input-simple" id="timeoff-to" value="${defaultFrom}" required>
            </div>
        </div>
        <div class="form-group">
            <label class="form-label">Reason (optional)</label>
            <textarea class="input-simple" id="timeoff-reason" rows="2" placeholder="e.g. Family vacation..."></textarea>
        </div>
    `, `<button class="btn btn-primary btn-full" onclick="submitTimeOff()">
            <span class="material-icons-round">send</span> Submit Request
        </button>`);
}

async function submitTimeOff() {
    const empId = App.user?.employee_id || null;
    const mgr = isManager();

    const employeeId = mgr
        ? document.getElementById('timeoff-employee')?.value
        : empId;

    const dateFrom = document.getElementById('timeoff-from').value;
    const dateTo = document.getElementById('timeoff-to').value;
    const type = document.getElementById('timeoff-type').value;
    const reason = document.getElementById('timeoff-reason').value;

    if (!employeeId || !dateFrom || !dateTo) {
        showToast('Please fill all required fields', 'warning');
        return;
    }

    try {
        await api('timeoff.php', 'POST', {
            employee_id: employeeId,
            date_from: dateFrom,
            date_to: dateTo,
            type: type,
            reason: reason,
        });
        closeModal();
        showToast('Time off request submitted!', 'success');
        loadAvailability();
    } catch (err) {
        showToast(err.error || 'Failed to submit request', 'error');
    }
}

async function approveTimeOff(id) {
    try {
        await api('timeoff.php', 'PUT', { id, action: 'approve' });
        showToast('Time off approved ✅', 'success');
        loadAvailability();
        checkPendingTimeOff();
    } catch (err) {
        showToast(err.error || 'Failed to approve', 'error');
    }
}

async function rejectTimeOff(id) {
    try {
        await api('timeoff.php', 'PUT', { id, action: 'reject' });
        showToast('Time off rejected', 'info');
        loadAvailability();
        checkPendingTimeOff();
    } catch (err) {
        showToast(err.error || 'Failed to reject', 'error');
    }
}

async function cancelTimeOff(id) {
    if (!confirm('Cancel this time off request?')) return;
    try {
        await api('timeoff.php', 'PUT', { id, action: 'cancel' });
        showToast('Request cancelled', 'info');
        loadAvailability();
        checkPendingTimeOff();
    } catch (err) {
        showToast(err.error || 'Failed to cancel', 'error');
    }
}

// ─── Badge check for pending time off ───
async function checkPendingTimeOff() {
    const badge = document.getElementById('availability-badge');
    if (!badge) return;

    try {
        const pending = await api('timeoff.php?status=pending');
        const count = pending.length;
        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    } catch (e) {
        badge.classList.add('hidden');
    }
}

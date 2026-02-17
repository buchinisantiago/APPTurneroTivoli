/**
 * AVAILABILITY.JS — Staff time-off / availability management
 */

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
        <div id="availability-content"><div class="spinner"></div></div>
    `;

    loadAvailability();
}

async function loadAvailability() {
    const el = document.getElementById('availability-content');
    if (!el) return;

    const empId = App.user?.employee_id || null;
    const mgr = isManager();

    try {
        let requests;
        if (mgr) {
            // Manager sees all requests
            requests = await api('timeoff.php');
        } else if (empId) {
            // Staff sees only their own
            requests = await api(`timeoff.php?employee_id=${empId}`);
        } else {
            el.innerHTML = '<div class="text-muted text-sm" style="padding:1rem;">No employee profile linked to your account.</div>';
            return;
        }

        // Separate by status
        const pending = requests.filter(r => r.status === 'pending');
        const approved = requests.filter(r => r.status === 'approved');
        const rejected = requests.filter(r => r.status === 'rejected');

        let html = '';

        // Pending requests
        if (pending.length > 0) {
            html += `<div class="dash-section">
                <div class="dash-section-title">⏳ Pending Requests</div>
                ${pending.map(r => renderTimeOffCard(r, mgr)).join('')}
            </div>`;
        }

        // Upcoming approved
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

    // Calculate days
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

    // Default dates: tomorrow onwards
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


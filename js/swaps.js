/**
 * SWAPS.JS — Release Shift system
 * 
 * Flow: Employee releases a shift → Another employee claims it →
 *       Manager approves/rejects → If approved, shift transfers.
 *       If nobody claims before the shift, original owner keeps it.
 */

async function renderSwaps(container) {
    container.innerHTML = `
        <div class="page-header">
            <h2 class="page-title">Release Shifts</h2>
            ${!isManager() && App.user.employee_id ? `
                <button class="btn btn-primary" onclick="openReleaseModal()">
                    <span class="material-icons-round">output</span><span>Release Shift</span>
                </button>` : ''}
        </div>
        <div class="filters-bar">
            <button class="btn btn-sm btn-primary" onclick="loadReleases('')" id="rel-filter-all">All</button>
            <button class="btn btn-sm btn-ghost" onclick="loadReleases('pending')" id="rel-filter-pending">Released</button>
            <button class="btn btn-sm btn-ghost" onclick="loadReleases('accepted')" id="rel-filter-accepted">Claimed</button>
            <button class="btn btn-sm btn-ghost" onclick="loadReleases('approved')" id="rel-filter-approved">Approved</button>
        </div>
        <div id="swaps-list"><div class="spinner"></div></div>
    `;

    loadReleases('');
}

async function loadReleases(statusFilter) {
    const el = document.getElementById('swaps-list');
    if (!el) return;

    // Update filter buttons
    document.querySelectorAll('[id^="rel-filter-"]').forEach(btn => {
        const filter = btn.id.replace('rel-filter-', '');
        btn.className = `btn btn-sm ${filter === statusFilter || (filter === 'all' && !statusFilter) ? 'btn-primary' : 'btn-ghost'}`;
    });

    el.innerHTML = '<div class="spinner"></div>';

    let query = '';
    if (statusFilter) query += `status=${statusFilter}`;
    if (!isManager() && App.user.employee_id) {
        query += `${query ? '&' : ''}employee_id=${App.user.employee_id}`;
    }

    try {
        const releases = await api(`swap_requests.php?${query}`);

        // Update badge
        const actionable = releases.filter(r => r.status === 'pending' || r.status === 'accepted');
        const badge = document.getElementById('swap-badge');
        if (badge) {
            if (actionable.length > 0) {
                badge.textContent = actionable.length;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

        if (releases.length === 0) {
            el.innerHTML = `<div class="empty-state">
                <span class="material-icons-round">output</span>
                <p>No released shifts</p>
            </div>`;
            return;
        }

        el.innerHTML = releases.map(r => {
            const statusTag = {
                pending: '<span class="tag tag-warning">🟡 Released</span>',
                accepted: '<span class="tag tag-info">🔵 Claimed</span>',
                approved: '<span class="tag tag-success">✅ Transferred</span>',
                rejected: '<span class="tag tag-danger">❌ Rejected</span>',
                cancelled: '<span class="tag tag-neutral">Cancelled</span>',
            }[r.status] || '';

            const isPast = new Date(r.shift_date + 'T23:59:59') < new Date();

            return `
            <div class="swap-card ${isPast ? 'release-past' : ''}">
                <div class="swap-header">
                    <div>
                        <strong>${r.requester_name}</strong>
                        <span class="text-muted text-sm"> releases a shift</span>
                    </div>
                    ${statusTag}
                </div>

                <div class="release-shift-block">
                    <div class="release-shift-info" style="border-left-color: ${r.shift_shop_color}">
                        <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                            <span class="shop-dot" style="background:${r.shift_shop_color}"></span>
                            <strong>${r.shift_shop}</strong>
                        </div>
                        <div class="text-sm">${formatDate(r.shift_date)}</div>
                        <div class="text-sm" style="font-weight:600">${formatTime(r.shift_start)} – ${formatTime(r.shift_end)}</div>
                    </div>

                    ${r.status === 'accepted' || r.status === 'approved' ? `
                        <div class="release-claimer">
                            <span class="material-icons-round" style="color:var(--success); font-size:18px">person</span>
                            <span><strong>${r.claimer_name || r.accepter_name || '—'}</strong> ${r.status === 'approved' ? 'took over' : 'wants to claim'}</span>
                        </div>
                    ` : r.status === 'pending' ? `
                        <div class="release-claimer" style="opacity:0.5">
                            <span class="material-icons-round" style="font-size:18px">hourglass_empty</span>
                            <span class="text-muted">Waiting for someone to claim...</span>
                        </div>
                    ` : ''}
                </div>

                ${r.message ? `<div class="text-sm text-muted mt-1" style="padding:4px 0;"><em>"${r.message}"</em></div>` : ''}
                ${r.manager_note ? `<div class="text-sm mt-1" style="padding:4px 0;">Manager: <em>${r.manager_note}</em></div>` : ''}
                
                <div class="swap-actions">
                    ${getReleaseActions(r)}
                </div>
            </div>`;
        }).join('');

    } catch (err) {
        el.innerHTML = `<div class="alert-card alert-danger">
            <span class="material-icons-round">error</span>
            <span>${err.error || 'Failed to load releases'}</span>
        </div>`;
    }
}

function getReleaseActions(r) {
    const actions = [];

    if (r.status === 'pending') {
        // ─── MANAGER: can assign directly to any employee ───
        if (isManager()) {
            actions.push(`<button class="btn btn-sm btn-success" onclick="openAssignModal(${r.id}, ${r.requester_id}, '${r.shift_date}')">
                <span class="material-icons-round">person_add</span> Assign to...
            </button>`);
            actions.push(`<button class="btn btn-sm btn-ghost" onclick="cancelRelease(${r.id})">Cancel Release</button>`);
        }
        // ─── STAFF: can claim if they are not the releaser ───
        else {
            const empId = App.user.employee_id;
            if (empId && empId != r.requester_id) {
                // Staff linked to an employee → claim with overlap check
                actions.push(`<button class="btn btn-sm btn-success" onclick="claimWithOverlapCheck(${r.id}, ${empId}, '${r.shift_date}')">
                    <span class="material-icons-round">front_hand</span> Claim This Shift
                </button>`);
            } else if (!empId) {
                // Staff NOT linked to an employee → pick who they are
                actions.push(`<button class="btn btn-sm btn-success" onclick="openClaimAsModal(${r.id}, ${r.requester_id}, '${r.shift_date}')">
                    <span class="material-icons-round">front_hand</span> Claim This Shift
                </button>`);
            }
            // Releaser can cancel their own
            if (empId == r.requester_id) {
                actions.push(`<button class="btn btn-sm btn-ghost" onclick="cancelRelease(${r.id})">Cancel Release</button>`);
            }
        }
    }

    if (r.status === 'accepted') {
        if (isManager()) {
            actions.push(`<button class="btn btn-sm btn-success" onclick="approveRelease(${r.id})">
                <span class="material-icons-round">check_circle</span> Approve Transfer
            </button>`);
            actions.push(`<button class="btn btn-sm btn-danger" onclick="rejectRelease(${r.id})">
                <span class="material-icons-round">cancel</span> Reject
            </button>`);
        }
        // Releaser or manager can still cancel
        if (App.user.employee_id == r.requester_id || isManager()) {
            actions.push(`<button class="btn btn-sm btn-ghost" onclick="cancelRelease(${r.id})">Cancel</button>`);
        }
    }

    return actions.join('');
}

// ─── Manager: Assign released shift directly to an employee ───
async function openAssignModal(releaseId, releaserId, shiftDate) {
    // Load employees if needed
    if (App.employees.length === 0) {
        try { App.employees = await api('employees.php'); } catch (e) { }
    }

    const available = App.employees.filter(e => e.id != releaserId);

    if (available.length === 0) {
        showToast('No other employees available to assign', 'warning');
        return;
    }

    const body = `
        <div class="form-group">
            <label class="form-label">Assign this shift to</label>
            <select class="input-simple" id="assign-employee-select" required onchange="checkAssignOverlap('${shiftDate || ''}')">
                <option value="">— Select employee —</option>
                ${available.map(e => `<option value="${e.id}">${e.name}${e.role ? ' — ' + e.role : ''}</option>`).join('')}
            </select>
        </div>
        <div id="assign-overlap-warning"></div>
        <div class="alert-card alert-info mt-1">
            <span class="material-icons-round">info</span>
            <span>The shift will be immediately transferred to the selected employee.</span>
        </div>
    `;

    openModal('Assign Released Shift', body, `
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-success" onclick="assignRelease(${releaseId})">
            <span class="material-icons-round">check_circle</span> Assign & Approve
        </button>
    `);
}

async function checkAssignOverlap(shiftDate) {
    const warnEl = document.getElementById('assign-overlap-warning');
    const empId = document.getElementById('assign-employee-select').value;
    if (!warnEl || !empId || !shiftDate) { if (warnEl) warnEl.innerHTML = ''; return; }

    const existing = await getShiftsForEmployeeOnDate(parseInt(empId), shiftDate);
    if (existing.length > 0) {
        const empName = document.getElementById('assign-employee-select').selectedOptions[0].text;
        warnEl.innerHTML = `
            <div class="alert-card alert-warning" style="margin-top:8px;">
                <span class="material-icons-round">warning</span>
                <div>
                    <strong>⚠️ ${empName} already works on ${formatDate(shiftDate)}:</strong>
                    <div class="text-sm" style="margin-top:4px;">
                        ${existing.map(s => `• ${s.shop_name}: ${formatTime(s.start_time)}–${formatTime(s.end_time)}`).join('<br>')}
                    </div>
                    <div class="text-sm text-muted" style="margin-top:4px;">You can still assign, but be aware of the overlap.</div>
                </div>
            </div>`;
    } else {
        warnEl.innerHTML = '';
    }
}

async function assignRelease(releaseId) {
    const employeeId = document.getElementById('assign-employee-select').value;
    if (!employeeId) { showToast('Please select an employee', 'warning'); return; }

    try {
        // First claim on behalf of the employee, then approve
        await api('swap_requests.php', 'PUT', {
            id: releaseId,
            action: 'accept',
            accepter_id: parseInt(employeeId),
            claimer_id: parseInt(employeeId),
        });
        await api('swap_requests.php', 'PUT', {
            id: releaseId,
            action: 'approve',
        });
        showToast('Shift assigned and transferred!', 'success');
        closeModal();
        loadReleases('');
        if (typeof loadBiddingShifts === 'function') loadBiddingShifts();
    } catch (err) {
        showToast(err.error || 'Failed to assign', 'error');
    }
}

// ─── Staff without linked employee: pick who they are ───
async function openClaimAsModal(releaseId, releaserId, shiftDate) {
    if (App.employees.length === 0) {
        try { App.employees = await api('employees.php'); } catch (e) { }
    }

    const available = App.employees.filter(e => e.id != releaserId);

    if (available.length === 0) {
        showToast('No employees available', 'warning');
        return;
    }

    const body = `
        <div class="form-group">
            <label class="form-label">Who are you?</label>
            <select class="input-simple" id="claim-as-select" required onchange="checkClaimAsOverlap('${shiftDate || ''}')">
                <option value="">— Select —</option>
                ${available.map(e => `<option value="${e.id}">${e.name}</option>`).join('')}
            </select>
        </div>
        <div id="claim-as-overlap-warning"></div>
    `;

    openModal('Claim Shift', body, `
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-success" onclick="claimShiftAs(${releaseId})">
            <span class="material-icons-round">front_hand</span> Claim
        </button>
    `);
}

async function checkClaimAsOverlap(shiftDate) {
    const warnEl = document.getElementById('claim-as-overlap-warning');
    const empId = document.getElementById('claim-as-select').value;
    if (!warnEl || !empId || !shiftDate) { if (warnEl) warnEl.innerHTML = ''; return; }

    const existing = await getShiftsForEmployeeOnDate(parseInt(empId), shiftDate);
    if (existing.length > 0) {
        warnEl.innerHTML = `
            <div class="alert-card alert-warning" style="margin-top:8px;">
                <span class="material-icons-round">warning</span>
                <div>
                    <strong>⚠️ You already work on ${formatDate(shiftDate)}!</strong>
                    <div class="text-sm" style="margin-top:4px;">
                        ${existing.map(s => `• ${s.shop_name}: ${formatTime(s.start_time)}–${formatTime(s.end_time)}`).join('<br>')}
                    </div>
                    <div class="text-sm text-muted" style="margin-top:4px;">You can still claim, but be aware of the overlap.</div>
                </div>
            </div>`;
    } else {
        warnEl.innerHTML = '';
    }
}

async function claimShiftAs(releaseId) {
    const employeeId = document.getElementById('claim-as-select').value;
    if (!employeeId) { showToast('Please select who you are', 'warning'); return; }
    try {
        await api('swap_requests.php', 'PUT', {
            id: releaseId,
            action: 'accept',
            accepter_id: parseInt(employeeId),
            claimer_id: parseInt(employeeId),
        });
        showToast('Shift claimed! Waiting for manager approval', 'success');
        closeModal();
        loadReleases('');
    } catch (err) {
        showToast(err.error || 'Failed to claim', 'error');
    }
}

// ─── Release a shift ───
async function openReleaseModal() {
    try {
        const myShifts = await api(`shifts.php?employee_id=${App.user.employee_id}&date_from=${formatDateISO(new Date())}`);

        if (myShifts.length === 0) {
            showToast('You have no upcoming shifts to release', 'warning');
            return;
        }

        const body = `
            <div style="margin-bottom:1rem;">
                <div class="alert-card alert-info">
                    <span class="material-icons-round">info</span>
                    <span>Your shift will be available for others to claim. If nobody claims it before the shift date, <strong>you'll still need to work it</strong>.</span>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Select shift to release</label>
                <select class="input-simple" id="release-shift-select" required>
                    ${myShifts.map(s => `<option value="${s.id}">${formatDate(s.shift_date)} — ${s.shop_name} (${formatTime(s.start_time)}-${formatTime(s.end_time)})</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Reason (optional)</label>
                <input type="text" class="input-simple" id="release-message" placeholder="Why do you need to release this shift?">
            </div>
        `;

        openModal('Release a Shift', body, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="submitRelease()">
                <span class="material-icons-round">output</span> Release Shift
            </button>
        `);
    } catch (err) {
        showToast('Failed to load your shifts', 'error');
    }
}

async function submitRelease() {
    const shiftId = document.getElementById('release-shift-select').value;
    const message = document.getElementById('release-message').value.trim();

    try {
        await api('swap_requests.php', 'POST', {
            shift_id: parseInt(shiftId),
            requester_id: App.user.employee_id,
            message,
        });
        showToast('Shift released — waiting for someone to claim it');
        closeModal();
        loadReleases('');
    } catch (err) {
        showToast(err.error || 'Failed to release shift', 'error');
    }
}

// ─── Claim a released shift (staff with linked employee) ───
async function claimShift(releaseId) {
    try {
        await api('swap_requests.php', 'PUT', {
            id: releaseId,
            action: 'accept',
            accepter_id: App.user.employee_id,
            claimer_id: App.user.employee_id,
        });
        showToast('Shift claimed! Waiting for manager approval', 'success');
        loadReleases('');
    } catch (err) {
        showToast(err.error || 'Failed to claim shift', 'error');
    }
}

// ─── Manager actions ───
async function approveRelease(id) {
    try {
        await api('swap_requests.php', 'PUT', { id, action: 'approve' });
        showToast('Release approved — shift transferred!', 'success');
        loadReleases('');
    } catch (err) {
        showToast(err.error || 'Failed to approve', 'error');
    }
}

async function rejectRelease(id) {
    try {
        await api('swap_requests.php', 'PUT', { id, action: 'reject' });
        showToast('Release rejected — original owner keeps the shift');
        loadReleases('');
    } catch (err) {
        showToast(err.error || 'Failed to reject', 'error');
    }
}

async function cancelRelease(id) {
    try {
        await api('swap_requests.php', 'PUT', { id, action: 'cancel' });
        showToast('Release cancelled');
        loadReleases('');
    } catch (err) {
        showToast(err.error || 'Failed to cancel', 'error');
    }
}

// Keep old function names as aliases for backward compatibility
const loadSwaps = loadReleases;
const approveSwap = approveRelease;
const rejectSwap = rejectRelease;
const cancelSwap = cancelRelease;

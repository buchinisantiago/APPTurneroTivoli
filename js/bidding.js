/**
 * BIDDING.JS — Shift marketplace / bidding board
 * 
 * Shows all released (available) shifts in a clear, card-based layout.
 * Staff can claim shifts. Manager can assign shifts to employees.
 * Includes overlap detection: warns when claimer already works that day.
 */

async function renderBidding(container) {
    container.innerHTML = `
        <div class="page-header">
            <h2 class="page-title">Available Shifts</h2>
        </div>
        <div class="alert-card alert-info" style="margin-bottom:1rem;">
            <span class="material-icons-round">info</span>
            <span>${isManager()
            ? 'These shifts have been released by staff. You can assign them to any employee.'
            : 'These shifts are available for you to pick up. Claim one and wait for manager approval.'
        }</span>
        </div>
        <div id="bidding-list"><div class="spinner"></div></div>
    `;

    loadBiddingShifts();
}

async function loadBiddingShifts() {
    const el = document.getElementById('bidding-list');
    if (!el) return;

    try {
        const allReleases = await api('swap_requests.php');

        // Only show pending (released, not yet claimed) AND accepted (claimed, waiting approval)
        const available = allReleases.filter(r => r.status === 'pending' || r.status === 'accepted');

        if (available.length === 0) {
            el.innerHTML = `<div class="empty-state">
                <span class="material-icons-round" style="font-size:48px; color:var(--text-muted)">event_available</span>
                <p style="margin-top:0.5rem; color:var(--text-secondary)">No shifts available right now</p>
                <p class="text-sm text-muted">When a coworker releases a shift, it will appear here</p>
            </div>`;
            return;
        }

        // For claimed shifts, check overlap for the claimer (manager needs to see this)
        let overlapInfo = {};
        if (isManager()) {
            for (const r of available) {
                if (r.status === 'accepted') {
                    const claimerId = r.claimer_id || r.accepter_id;
                    if (claimerId) {
                        const existingShifts = await getShiftsForEmployeeOnDate(claimerId, r.shift_date);
                        if (existingShifts.length > 0) {
                            overlapInfo[r.id] = existingShifts;
                        }
                    }
                }
            }
        }

        el.innerHTML = available.map(r => {
            const isPending = r.status === 'pending';
            const isClaimed = r.status === 'accepted';
            const isMyRelease = App.user.employee_id && App.user.employee_id == r.requester_id;
            const overlaps = overlapInfo[r.id] || [];

            return `
            <div class="bidding-card">
                <div class="bidding-card-top" style="border-left-color: ${r.shift_shop_color}">
                    <div class="bidding-shop">
                        <span class="shop-dot" style="background:${r.shift_shop_color}"></span>
                        <strong>${r.shift_shop}</strong>
                    </div>
                    ${isPending
                    ? '<span class="tag tag-success">🟢 Available</span>'
                    : `<span class="tag tag-info">🔵 Claimed by ${r.claimer_name || r.accepter_name}</span>`
                }
                </div>

                <div class="bidding-details">
                    <div class="bidding-detail-item">
                        <span class="material-icons-round">calendar_today</span>
                        <span>${formatDate(r.shift_date)}</span>
                    </div>
                    <div class="bidding-detail-item">
                        <span class="material-icons-round">schedule</span>
                        <span style="font-weight:700">${formatTime(r.shift_start)} – ${formatTime(r.shift_end)}</span>
                    </div>
                    <div class="bidding-detail-item">
                        <span class="material-icons-round">person_off</span>
                        <span class="text-muted">Released by <strong>${r.requester_name}</strong></span>
                    </div>
                    ${r.message ? `<div class="bidding-detail-item">
                        <span class="material-icons-round">chat_bubble_outline</span>
                        <span class="text-muted"><em>"${r.message}"</em></span>
                    </div>` : ''}
                </div>

                ${overlaps.length > 0 ? `
                <div class="alert-card alert-warning" style="margin: 0 0.75rem;">
                    <span class="material-icons-round">warning</span>
                    <div>
                        <strong>⚠️ Schedule conflict!</strong><br>
                        <span class="text-sm">${r.claimer_name || r.accepter_name} already works on ${formatDate(r.shift_date)}:</span>
                        <div class="text-sm" style="margin-top:4px;">
                            ${overlaps.map(s => `• ${s.shop_name}: ${formatTime(s.start_time)}–${formatTime(s.end_time)}`).join('<br>')}
                        </div>
                    </div>
                </div>
                ` : ''}

                <div class="bidding-actions">
                    ${getBiddingActions(r, isPending, isClaimed, isMyRelease)}
                </div>
            </div>`;
        }).join('');

    } catch (err) {
        el.innerHTML = `<div class="alert-card alert-danger">
            <span class="material-icons-round">error</span>
            <span>${err.error || 'Failed to load available shifts'}</span>
        </div>`;
    }
}

function getBiddingActions(r, isPending, isClaimed, isMyRelease) {
    const btns = [];

    if (isPending) {
        if (isManager()) {
            // Manager: assign directly
            btns.push(`<button class="btn btn-success btn-full" onclick="openAssignModal(${r.id}, ${r.requester_id}, '${r.shift_date}')">
                <span class="material-icons-round">person_add</span> Assign to Employee
            </button>`);
        } else if (!isMyRelease) {
            // Staff: claim it (with overlap check)
            const empId = App.user.employee_id;
            if (empId) {
                btns.push(`<button class="btn btn-success btn-full" onclick="claimWithOverlapCheck(${r.id}, ${empId}, '${r.shift_date}')">
                    <span class="material-icons-round">front_hand</span> Claim This Shift
                </button>`);
            } else {
                btns.push(`<button class="btn btn-success btn-full" onclick="openClaimAsModal(${r.id}, ${r.requester_id}, '${r.shift_date}')">
                    <span class="material-icons-round">front_hand</span> Claim This Shift
                </button>`);
            }
        } else {
            btns.push(`<div class="text-sm text-muted" style="text-align:center;padding:4px 0;">
                <em>This is your released shift</em>
            </div>`);
        }
    }

    if (isClaimed && isManager()) {
        btns.push(`<button class="btn btn-success" onclick="approveRelease(${r.id})" style="flex:1">
            <span class="material-icons-round">check_circle</span> Approve
        </button>`);
        btns.push(`<button class="btn btn-danger" onclick="rejectRelease(${r.id})" style="flex:1">
            <span class="material-icons-round">cancel</span> Reject
        </button>`);
    } else if (isClaimed && !isManager()) {
        btns.push(`<div class="text-sm text-muted" style="text-align:center;padding:4px 0;">
            <em>Waiting for manager approval</em>
        </div>`);
    }

    return btns.join('');
}

// ─── Helper: get shifts for an employee on a given date ───
async function getShiftsForEmployeeOnDate(employeeId, date) {
    try {
        const shifts = await api(`shifts.php?employee_id=${employeeId}&date_from=${date}&date_to=${date}`);
        return shifts.filter(s => s.status === 'scheduled');
    } catch (e) {
        return [];
    }
}

// ─── Staff claim with overlap check ───
async function claimWithOverlapCheck(releaseId, employeeId, shiftDate) {
    // Check for existing shifts on that date
    const existing = await getShiftsForEmployeeOnDate(employeeId, shiftDate);

    if (existing.length > 0) {
        // Show warning modal
        const shiftsList = existing.map(s =>
            `<div class="bidding-detail-item" style="padding:2px 0;">
                <span class="material-icons-round">schedule</span>
                <strong>${s.shop_name}</strong>: ${formatTime(s.start_time)} – ${formatTime(s.end_time)}
            </div>`
        ).join('');

        const body = `
            <div class="alert-card alert-warning">
                <span class="material-icons-round">warning</span>
                <div>
                    <strong>⚠️ You already have shift(s) on ${formatDate(shiftDate)}!</strong>
                </div>
            </div>
            <div style="margin: 1rem 0;">
                <div class="text-sm text-muted" style="margin-bottom:6px;">Your existing shifts:</div>
                ${shiftsList}
            </div>
            <div class="alert-card alert-info">
                <span class="material-icons-round">info</span>
                <span>You can still claim this shift (e.g. to swap a long shift for a short one), but the manager will see a conflict alert.</span>
            </div>
        `;

        openModal('⚠️ Schedule Conflict', body, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-warning" onclick="confirmClaim(${releaseId}, ${employeeId})">
                <span class="material-icons-round">front_hand</span> Claim Anyway
            </button>
        `);
    } else {
        // No conflict, claim directly
        confirmClaim(releaseId, employeeId);
    }
}

async function confirmClaim(releaseId, employeeId) {
    try {
        await api('swap_requests.php', 'PUT', {
            id: releaseId,
            action: 'accept',
            accepter_id: employeeId,
            claimer_id: employeeId,
        });
        showToast('Shift claimed! Waiting for manager approval', 'success');
        closeModal();
        loadBiddingShifts();
    } catch (err) {
        showToast(err.error || 'Failed to claim shift', 'error');
    }
}

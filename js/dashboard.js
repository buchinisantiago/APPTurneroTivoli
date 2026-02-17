/**
 * DASHBOARD.JS — Boss Mode Dashboard
 */

async function renderDashboard(container) {
    container.innerHTML = `
        <div class="page-header">
            <h2 class="page-title">Dashboard</h2>
            <span class="tag tag-info">${formatDate(new Date())}</span>
        </div>
        <div id="dash-content"><div class="spinner"></div></div>
    `;

    try {
        const data = await api('dashboard.php?view=all');
        const el = document.getElementById('dash-content');
        el.innerHTML = '';

        // ─── ALERTS (manager only) ───
        if (isManager()) {
            if (data.alerts && data.alerts.length > 0) {
                el.innerHTML += `<div class="dash-section">
                    <div class="dash-section-title">⚠️ Alerts</div>
                    ${data.alerts.map(a => {
                    const sev = a.severity === 'danger' ? 'danger' : a.severity === 'warning' ? 'warning' : 'info';
                    const icon = sev === 'danger' ? 'error' : sev === 'warning' ? 'warning' : 'info';
                    return `<div class="alert-card alert-${sev}">
                            <span class="material-icons-round">${icon}</span>
                            <span>${a.message}</span>
                        </div>`;
                }).join('')}
                </div>`;
            }

            // ─── SCHEDULE CONFLICTS (persistent until resolved) ───
            await loadDashboardConflicts(el, data);
        }

        // ─── TODAY'S COVERAGE ───
        el.innerHTML += `<div class="dash-section">
            <div class="dash-section-title">👥 Today's Coverage</div>
            <div id="dash-today"></div>
        </div>`;

        const todayEl = document.getElementById('dash-today');
        if (data.today && data.today.length > 0) {
            data.today.forEach(shop => {
                const now = new Date();
                const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

                todayEl.innerHTML += `
                    <div class="shop-card" style="border-left-color: ${shop.shop_color}">
                        <div class="shop-card-header">
                            <span class="shop-dot" style="background: ${shop.shop_color}"></span>
                            <span class="shop-card-name">${shop.shop_name}</span>
                            <span class="shop-card-count">${shop.shifts.length} shift(s)</span>
                        </div>
                        ${shop.shifts.map(s => {
                    const isNow = s.start_time <= nowTime && s.end_time > nowTime;
                    return `<div class="shop-shift-row">
                                <span class="material-icons-round">${isNow ? 'radio_button_checked' : 'schedule'}</span>
                                <strong>${s.employee_name}</strong>
                                <span class="text-muted">${formatTime(s.start_time)} - ${formatTime(s.end_time)}</span>
                                ${isNow ? '<span class="tag tag-success">NOW</span>' : ''}
                            </div>`;
                }).join('')}
                    </div>`;
            });
        } else {
            // Show all shops even if no shifts
            App.shops.forEach(shop => {
                todayEl.innerHTML += `
                    <div class="shop-card" style="border-left-color: ${shop.color}">
                        <div class="shop-card-header">
                            <span class="shop-dot" style="background: ${shop.color}"></span>
                            <span class="shop-card-name">${shop.name}</span>
                            <span class="shop-card-count">0 shifts</span>
                        </div>
                        <div class="text-muted text-sm" style="padding: 4px 0;">No staff scheduled today</div>
                    </div>`;
            });
        }

        // ─── WEEKLY HOURS (manager only) ───
        if (isManager()) {
            el.innerHTML += `<div class="dash-section">
                <div class="flex-between mb-1">
                    <div class="dash-section-title" style="margin:0">📊 Hours This Week</div>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-ghost" id="hours-week-btn" onclick="switchHoursPeriod('week')">Week</button>
                        <button class="btn btn-sm btn-ghost" id="hours-month-btn" onclick="switchHoursPeriod('month')">Month</button>
                    </div>
                </div>
                <div id="dash-hours"></div>
            </div>`;

            renderHoursTable(data.hours);
        }

        // ─── TOMORROW'S COVERAGE ───
        const tomorrowLabel = data.tomorrow_date ? formatDate(data.tomorrow_date) : 'Tomorrow';
        el.innerHTML += `<div class="dash-section">
            <div class="dash-section-title">🗓️ Tomorrow's Coverage <span class="text-muted text-sm">(${tomorrowLabel})</span></div>
            <div id="dash-tomorrow"></div>
        </div>`;

        const tomorrowEl = document.getElementById('dash-tomorrow');
        if (data.tomorrow && data.tomorrow.length > 0) {
            data.tomorrow.forEach(shop => {
                tomorrowEl.innerHTML += `
                    <div class="shop-card" style="border-left-color: ${shop.shop_color}">
                        <div class="shop-card-header">
                            <span class="shop-dot" style="background: ${shop.shop_color}"></span>
                            <span class="shop-card-name">${shop.shop_name}</span>
                            <span class="shop-card-count">${shop.shifts.length} shift(s)</span>
                        </div>
                        ${shop.shifts.map(s => `<div class="shop-shift-row">
                            <span class="material-icons-round">schedule</span>
                            <strong>${s.employee_name}</strong>
                            <span class="text-muted">${formatTime(s.start_time)} - ${formatTime(s.end_time)}</span>
                        </div>`).join('')}
                    </div>`;
            });
        } else {
            App.shops.forEach(shop => {
                tomorrowEl.innerHTML += `
                    <div class="shop-card" style="border-left-color: ${shop.color}; opacity:0.7">
                        <div class="shop-card-header">
                            <span class="shop-dot" style="background: ${shop.color}"></span>
                            <span class="shop-card-name">${shop.name}</span>
                            <span class="shop-card-count">0 shifts</span>
                        </div>
                        <div class="text-muted text-sm" style="padding: 4px 0;">No staff scheduled tomorrow</div>
                    </div>`;
            });
        }

        // ─── PAYROLL EXPORT (manager only) ───
        if (isManager()) {
            const now = new Date();
            const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            const lastDayStr = formatDateISO(lastDay);

            el.innerHTML += `<div class="dash-section">
                <div class="dash-section-title">📥 Payroll Export</div>
                <div class="card" style="padding: 1rem;">
                    <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end; margin-bottom:1rem;">
                        <div class="form-group" style="margin:0; flex:1; min-width:130px;">
                            <label class="form-label">From</label>
                            <input type="date" class="input-simple" id="export-from" value="${firstDay}">
                        </div>
                        <div class="form-group" style="margin:0; flex:1; min-width:130px;">
                            <label class="form-label">To</label>
                            <input type="date" class="input-simple" id="export-to" value="${lastDayStr}">
                        </div>
                        <div class="form-group" style="margin:0; flex:1; min-width:130px;">
                            <label class="form-label">Shop</label>
                            <select class="input-simple" id="export-shop">
                                <option value="">All Shops</option>
                                ${App.shops.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <button class="btn btn-primary" onclick="previewExport()" style="flex:1">
                            <span class="material-icons-round">visibility</span> Preview
                        </button>
                        <button class="btn btn-success" onclick="downloadExport()" style="flex:1">
                            <span class="material-icons-round">download</span> Download CSV
                        </button>
                    </div>
                    <div id="export-preview" style="margin-top:1rem;"></div>
                </div>
            </div>`;
        }

    } catch (err) {
        document.getElementById('dash-content').innerHTML = `
            <div class="alert-card alert-danger">
                <span class="material-icons-round">error</span>
                <span>Failed to load dashboard: ${err.error || err.message || 'Unknown error'}</span>
            </div>`;
    }
}

function renderHoursTable(hoursData) {
    const el = document.getElementById('dash-hours');
    if (!hoursData || !hoursData.employees || hoursData.employees.length === 0) {
        el.innerHTML = '<div class="text-muted text-sm">No data yet</div>';
        return;
    }

    const maxH = Math.max(...hoursData.employees.map(e => e.total_hours || 0), 1);
    const isWeek = hoursData.period === 'week';

    el.innerHTML = `
        <div class="card" style="overflow-x:auto;">
            <table class="hours-table">
                <thead>
                    <tr>
                        <th>Employee</th>
                        <th>Hours</th>
                        <th>${isWeek ? 'Max/wk' : 'Shifts'}</th>
                        <th style="width:30%">Progress</th>
                    </tr>
                </thead>
                <tbody>
                    ${hoursData.employees.map(e => {
        const pct = isWeek
            ? Math.min((e.total_hours / (e.max_weekly_hours || 40)) * 100, 100)
            : (e.total_hours / maxH) * 100;
        const barColor = e.over_limit ? 'var(--danger)' : (pct > 80 ? 'var(--warning)' : 'var(--accent)');
        return `<tr>
                            <td><strong>${e.name}</strong></td>
                            <td>${e.total_hours}h</td>
                            <td>${isWeek ? e.max_weekly_hours + 'h' : e.shift_count}</td>
                            <td>
                                <div class="hours-bar-container">
                                    <div class="hours-bar" style="width:${pct}%; background:${barColor}"></div>
                                </div>
                                ${e.over_limit ? '<span class="tag tag-danger mt-1" style="font-size:0.6rem">OVER LIMIT</span>' : ''}
                            </td>
                        </tr>`;
    }).join('')}
                </tbody>
            </table>
        </div>`;

    // Highlight active button
    const wb = document.getElementById('hours-week-btn');
    const mb = document.getElementById('hours-month-btn');
    if (wb && mb) {
        wb.className = `btn btn-sm ${isWeek ? 'btn-primary' : 'btn-ghost'}`;
        mb.className = `btn btn-sm ${!isWeek ? 'btn-primary' : 'btn-ghost'}`;
    }
}

async function switchHoursPeriod(period) {
    try {
        const data = await api(`dashboard.php?view=hours&period=${period}`);
        renderHoursTable(data.hours);
    } catch (err) {
        showToast('Failed to load hours', 'error');
    }
}

// ─── Dashboard conflict checker (persistent for managers) ───
async function loadDashboardConflicts(el, dashData) {
    try {
        const today = formatDateISO(new Date());
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = formatDateISO(tomorrow);

        // Fetch shifts for today and tomorrow
        const [todayShifts, tomorrowShifts, releases] = await Promise.all([
            api(`shifts.php?date=${today}`),
            api(`shifts.php?date=${tomorrowStr}`),
            api('swap_requests.php'),
        ]);

        const conflicts = [];

        // Check for overlapping shifts per employee
        [{ label: 'Today', date: today, shifts: todayShifts },
        { label: 'Tomorrow', date: tomorrowStr, shifts: tomorrowShifts }].forEach(day => {
            const byEmp = {};
            day.shifts.forEach(s => {
                if (!byEmp[s.employee_id]) byEmp[s.employee_id] = [];
                byEmp[s.employee_id].push(s);
            });

            Object.entries(byEmp).forEach(([empId, empShifts]) => {
                if (empShifts.length < 2) return;
                for (let i = 0; i < empShifts.length; i++) {
                    for (let j = i + 1; j < empShifts.length; j++) {
                        const a = empShifts[i], b = empShifts[j];
                        if (a.start_time < b.end_time && b.start_time < a.end_time) {
                            conflicts.push({
                                day: day.label,
                                date: day.date,
                                employee: a.employee_name,
                                shift1: `${a.shop_name} ${formatTime(a.start_time)}-${formatTime(a.end_time)}`,
                                shift2: `${b.shop_name} ${formatTime(b.start_time)}-${formatTime(b.end_time)}`,
                            });
                        }
                    }
                }
            });
        });

        // Check for pending releases awaiting action
        const pendingReleases = releases.filter(r => r.status === 'pending');
        const claimedReleases = releases.filter(r => r.status === 'accepted');

        // Build alerts HTML
        let conflictHTML = '';

        if (conflicts.length > 0) {
            const conflictItems = conflicts.map(c =>
                `<div style="padding:4px 0;">
                    <strong>${c.employee}</strong> (${c.day} ${formatDate(c.date)})<br>
                    <span class="text-sm">${c.shift1} ↔ ${c.shift2}</span>
                </div>`
            ).join('');

            conflictHTML += `
                <div class="alert-card alert-danger">
                    <span class="material-icons-round">warning</span>
                    <div>
                        <strong>🚨 Schedule Conflicts</strong>
                        ${conflictItems}
                        <div class="text-sm text-muted" style="margin-top:6px;">
                            <a href="#" onclick="navigateTo('timeline'); return false;" style="color:var(--danger);">→ View in Timeline</a>
                        </div>
                    </div>
                </div>`;
        }

        if (claimedReleases.length > 0) {
            conflictHTML += `
                <div class="alert-card alert-warning">
                    <span class="material-icons-round">pending_actions</span>
                    <div>
                        <strong>${claimedReleases.length} release(s) awaiting your approval</strong>
                        <div class="text-sm text-muted" style="margin-top:4px;">
                            ${claimedReleases.map(r => `${r.claimer_name || r.accepter_name} wants ${r.requester_name}'s shift (${formatDate(r.shift_date)})`).join('<br>')}
                        </div>
                        <div class="text-sm" style="margin-top:6px;">
                            <a href="#" onclick="navigateTo('bidding'); return false;" style="color:var(--warning);">→ Go to Bidding</a>
                        </div>
                    </div>
                </div>`;
        }

        if (pendingReleases.length > 0) {
            conflictHTML += `
                <div class="alert-card alert-info">
                    <span class="material-icons-round">output</span>
                    <div>
                        <strong>${pendingReleases.length} shift(s) released and unclaimed</strong>
                        <div class="text-sm text-muted" style="margin-top:4px;">
                            ${pendingReleases.map(r => `${r.requester_name}: ${formatDate(r.shift_date)} (${r.shift_shop})`).join('<br>')}
                        </div>
                        <div class="text-sm" style="margin-top:6px;">
                            <a href="#" onclick="navigateTo('bidding'); return false;" style="color:var(--accent);">→ Go to Bidding</a>
                        </div>
                    </div>
                </div>`;
        }

        // ─── PENDING TIME OFF REQUESTS ───
        try {
            const pendingTimeOff = await api('timeoff.php?status=pending');
            if (pendingTimeOff.length > 0) {
                conflictHTML += `
                    <div class="alert-card alert-warning" style="flex-direction:row; gap:12px; align-items:flex-start; cursor:pointer;" onclick="navigateTo('availability')">
                        <span class="material-icons-round">event_busy</span>
                        <div>
                            <strong>📅 ${pendingTimeOff.length} time off request(s) pending</strong>
                            <div class="text-sm text-muted" style="margin-top:4px;">
                                ${pendingTimeOff.map(r => {
                    const typeIcons = { vacation: '🏖️', unavailable: '🚫', sick: '🤒', personal: '👤' };
                    return `${typeIcons[r.type] || '📅'} ${r.employee_name}: ${formatDate(r.date_from)}${r.date_from !== r.date_to ? ' → ' + formatDate(r.date_to) : ''}`;
                }).join('<br>')}
                            </div>
                            <div class="text-sm" style="margin-top:6px;">
                                <span style="color:var(--accent);">→ Go to Availability</span>
                            </div>
                        </div>
                    </div>`;
            }
        } catch (e) { /* ignore */ }

        if (conflictHTML) {
            el.innerHTML += `<div class="dash-section">
                <div class="dash-section-title">🔔 Action Required</div>
                ${conflictHTML}
            </div>`;
        }

    } catch (err) {
        // If conflict check fails, don't break the whole dashboard
        console.warn('Failed to load conflicts:', err);
    }
}

// ─── Export functions ───
async function previewExport() {
    const dateFrom = document.getElementById('export-from').value;
    const dateTo = document.getElementById('export-to').value;
    const previewEl = document.getElementById('export-preview');

    if (!dateFrom || !dateTo) {
        showToast('Please select both dates', 'warning');
        return;
    }
    if (dateFrom > dateTo) {
        showToast('"From" date must be before "To" date', 'warning');
        return;
    }

    const shopId = document.getElementById('export-shop')?.value || '';
    previewEl.innerHTML = '<div class="spinner"></div>';

    try {
        let url = `export.php?format=json&date_from=${dateFrom}&date_to=${dateTo}`;
        if (shopId) url += `&shop_id=${shopId}`;
        const data = await api(url);

        if (!data.employees || data.employees.length === 0) {
            previewEl.innerHTML = '<div class="text-muted text-sm">No shifts found in this period</div>';
            return;
        }

        const totalHours = data.employees.reduce((sum, e) => sum + e.total_hours, 0);
        const totalShifts = data.employees.reduce((sum, e) => sum + e.total_shifts, 0);

        previewEl.innerHTML = `
            <div class="text-sm text-muted" style="margin-bottom:8px;">
                Period: <strong>${formatDate(dateFrom)}</strong> to <strong>${formatDate(dateTo)}</strong>
                — ${data.employees.length} employees, ${totalShifts} shifts, ${totalHours.toFixed(1)}h total
            </div>
            <div style="overflow-x:auto;">
                <table class="hours-table">
                    <thead>
                        <tr>
                            <th>Employee</th>
                            <th>Role</th>
                            <th>Shifts</th>
                            <th>Total Hours</th>
                            <th>Per Shop</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.employees.map(e => `
                            <tr>
                                <td><strong>${e.employee_name}</strong></td>
                                <td class="text-muted">${e.role || '-'}</td>
                                <td>${e.total_shifts}</td>
                                <td><strong>${e.total_hours}h</strong></td>
                                <td class="text-sm">${e.shops.map(s => `${s.shop}: ${s.hours}h (${s.shifts})`).join(', ') || '-'}</td>
                            </tr>
                        `).join('')}
                        <tr style="border-top:2px solid var(--border); font-weight:700;">
                            <td>TOTAL</td>
                            <td></td>
                            <td>${totalShifts}</td>
                            <td>${totalHours.toFixed(1)}h</td>
                            <td></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    } catch (err) {
        previewEl.innerHTML = `<div class="alert-card alert-danger">
            <span class="material-icons-round">error</span>
            <span>${err.error || 'Failed to load preview'}</span>
        </div>`;
    }
}

function downloadExport() {
    const dateFrom = document.getElementById('export-from').value;
    const dateTo = document.getElementById('export-to').value;

    if (!dateFrom || !dateTo) {
        showToast('Please select both dates', 'warning');
        return;
    }
    if (dateFrom > dateTo) {
        showToast('"From" date must be before "To" date', 'warning');
        return;
    }

    const shopId = document.getElementById('export-shop')?.value || '';

    // Trigger download by opening the export URL
    let url = `${API}/export.php?format=csv&date_from=${dateFrom}&date_to=${dateTo}`;
    if (shopId) url += `&shop_id=${shopId}`;
    window.open(url, '_blank');
    showToast('Downloading CSV file...', 'success');
}

/**
 * TIMELINE.JS — Daily horizontal timeline view
 */

let timelineDate = new Date();
const TIMELINE_START = 6;  // 6:00 AM
const TIMELINE_END = 24;   // midnight
const TIMELINE_HOURS = TIMELINE_END - TIMELINE_START;

async function renderTimeline(container) {
    const calMonth = timelineDate.getMonth();
    const calYear = timelineDate.getFullYear();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    container.innerHTML = `
        <div class="timeline-header">
            <div class="timeline-nav">
                <button class="btn btn-secondary btn-sm" onclick="shiftTimelineDate(-1)">
                    <span class="material-icons-round">chevron_left</span>
                </button>
                <button class="btn btn-ghost btn-sm" onclick="goToTimelineToday()">Today</button>
                <button class="btn btn-secondary btn-sm" onclick="shiftTimelineDate(1)">
                    <span class="material-icons-round">chevron_right</span>
                </button>
            </div>
            <div class="timeline-date" id="timeline-date-label">${formatDate(timelineDate)}</div>
            <div class="filters-bar" style="margin:0">
                <select id="timeline-shop-filter" onchange="loadTimeline(); loadMonthlyCalendar();" style="font-size:0.75rem">
                    <option value="">All Shops</option>
                    ${App.shops.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="timeline-container" id="timeline-container">
            <div class="spinner"></div>
        </div>

        <div class="monthly-calendar-section" style="margin-top:1.5rem;">
            <div class="timeline-header" style="margin-bottom:0.75rem;">
                <div class="timeline-nav">
                    <button class="btn btn-secondary btn-sm" onclick="shiftCalendarMonth(-1)">
                        <span class="material-icons-round">chevron_left</span>
                    </button>
                    <button class="btn btn-ghost btn-sm" onclick="goToCalendarCurrentMonth()">This Month</button>
                    <button class="btn btn-secondary btn-sm" onclick="shiftCalendarMonth(1)">
                        <span class="material-icons-round">chevron_right</span>
                    </button>
                </div>
                <div class="timeline-date" id="calendar-month-label">📅 ${monthNames[calMonth]} ${calYear}</div>
            </div>
            <div id="monthly-calendar-container">
                <div class="spinner"></div>
            </div>
        </div>
    `;

    loadTimeline();
    loadMonthlyCalendar();
}

async function loadTimeline() {
    const container = document.getElementById('timeline-container');
    if (!container) return;

    const dateStr = formatDateISO(timelineDate);
    const shopFilter = document.getElementById('timeline-shop-filter')?.value || '';

    let query = `date=${dateStr}`;
    if (shopFilter) query += `&shop_id=${shopFilter}`;

    try {
        const shifts = await api(`shifts.php?${query}`);

        // Load employees if needed
        if (App.employees.length === 0) {
            try { App.employees = await api('employees.php'); } catch (e) { }
        }

        // Group shifts by employee
        const byEmployee = {};
        shifts.forEach(s => {
            const empId = s.employee_id || 'unassigned';
            const empName = s.employee_name || 'Unassigned'; // Open Shifts

            if (!byEmployee[empId]) {
                byEmployee[empId] = {
                    name: empName,
                    shifts: [],
                };
            }
            byEmployee[empId].shifts.push(s);
        });

        // Also add employees that have no shifts (to show empty rows)
        App.employees.forEach(emp => {
            if (!byEmployee[emp.id]) {
                byEmployee[emp.id] = { name: emp.name, shifts: [] };
            }
        });

        // Calculate column width
        const hourWidth = Math.max(60, (container.clientWidth - 110) / TIMELINE_HOURS);

        // Build hour labels
        let hourLabelsHTML = `<div style="width:110px;min-width:110px;border-right:1px solid var(--border);background:var(--bg-secondary)"></div>`;
        for (let h = TIMELINE_START; h < TIMELINE_END; h++) {
            hourLabelsHTML += `<div class="timeline-hour-label" style="width:${hourWidth}px;min-width:${hourWidth}px;">${String(h).padStart(2, '0')}:00</div>`;
        }

        // Build rows
        let rowsHTML = '';
        const sortedEmployees = Object.entries(byEmployee).sort((a, b) => {
            // Put Unassigned at the top or bottom? Let's strictly sort by name
            const nameA = a[1].name || '';
            const nameB = b[1].name || '';
            return nameA.localeCompare(nameB);
        });

        // Detect overlaps per employee
        const overlapEmployees = [];
        sortedEmployees.forEach(([empId, emp]) => {
            emp.hasOverlap = false;
            emp.overlapDetails = [];
            for (let i = 0; i < emp.shifts.length; i++) {
                for (let j = i + 1; j < emp.shifts.length; j++) {
                    const a = emp.shifts[i], b = emp.shifts[j];
                    // Check if time ranges overlap
                    if (a.start_time < b.end_time && b.start_time < a.end_time) {
                        emp.hasOverlap = true;
                        emp.overlapDetails.push({
                            shift1: `${a.shop_name} ${formatTime(a.start_time)}-${formatTime(a.end_time)}`,
                            shift2: `${b.shop_name} ${formatTime(b.start_time)}-${formatTime(b.end_time)}`,
                        });
                    }
                }
            }
            if (emp.hasOverlap) {
                overlapEmployees.push({ name: emp.name, details: emp.overlapDetails, shifts: emp.shifts });
            }
        });

        sortedEmployees.forEach(([empId, emp]) => {
            let barsHTML = '';
            // If overlap exists, stack bars at different heights
            const hasMultiple = emp.shifts.length > 1;

            emp.shifts.forEach((s, idx) => {
                const startParts = s.start_time.split(':');
                const endParts = s.end_time.split(':');
                const startH = parseInt(startParts[0]) + parseInt(startParts[1]) / 60;
                const endH = parseInt(endParts[0]) + parseInt(endParts[1]) / 60;

                const left = (Math.max(startH, TIMELINE_START) - TIMELINE_START) * hourWidth;
                const width = (Math.min(endH, TIMELINE_END) - Math.max(startH, TIMELINE_START)) * hourWidth;

                if (width > 0) {
                    // Stack bars vertically if employee has multiple shifts
                    const barTop = hasMultiple ? (idx === 0 ? 2 : 22) : 6;
                    const barHeight = hasMultiple ? 18 : 32;

                    barsHTML += `<div class="timeline-bar" 
                        style="left:${left}px; width:${width}px; background:${s.shop_color}; opacity:0.9; top:${barTop}px; height:${barHeight}px;"
                        title="${s.shop_name}: ${formatTime(s.start_time)}-${formatTime(s.end_time)}"
                        onclick="showTimelineShiftDetail(${s.id})">
                        ${width > 60 ? s.shop_name : ''}
                    </div>`;
                }
            });

            // Add vertical grid lines
            let gridHTML = '';
            for (let h = TIMELINE_START; h < TIMELINE_END; h++) {
                const x = (h - TIMELINE_START) * hourWidth;
                gridHTML += `<div style="position:absolute;left:${x}px;top:0;bottom:0;width:1px;background:var(--border);pointer-events:none;"></div>`;
            }

            const overlapStyle = emp.hasOverlap ? 'border-left: 3px solid var(--danger);' : '';
            const overlapIcon = emp.hasOverlap ? '⚠️ ' : '';
            const rowHeight = hasMultiple ? 44 : 44;

            rowsHTML += `
                <div class="timeline-row" style="${overlapStyle}">
                    <div class="timeline-row-label" title="${emp.name}${emp.hasOverlap ? ' (OVERLAP!)' : ''}">${overlapIcon}${emp.name}</div>
                    <div class="timeline-row-bars" style="width:${TIMELINE_HOURS * hourWidth}px; height:${rowHeight}px;">
                        ${gridHTML}
                        ${barsHTML}
                    </div>
                </div>`;
        });

        // Now line
        const now = new Date();
        let nowLineHTML = '';
        if (dateStr === formatDateISO(now)) {
            const nowH = now.getHours() + now.getMinutes() / 60;
            if (nowH >= TIMELINE_START && nowH <= TIMELINE_END) {
                const nowLeft = (nowH - TIMELINE_START) * hourWidth + 110;
                nowLineHTML = `<div class="timeline-now-line" style="left:${nowLeft}px;"></div>`;
            }
        }

        // Overlap alert banner for managers
        let overlapAlertHTML = '';
        if (overlapEmployees.length > 0) {
            const overlapItems = overlapEmployees.map(o => {
                const detailStr = o.details.map(d => `${d.shift1} ↔ ${d.shift2}`).join(', ');
                return `<strong>${o.name}</strong>: ${detailStr}`;
            }).join('<br>');

            overlapAlertHTML = `
                <div class="alert-card alert-danger" style="margin-bottom:0; border-radius: var(--radius-md) var(--radius-md) 0 0;">
                    <span class="material-icons-round">warning</span>
                    <div>
                        <strong>⚠️ Schedule Conflicts Detected!</strong><br>
                        <span class="text-sm">${overlapItems}</span>
                    </div>
                </div>`;
        }

        // ─── HOURLY STAFF SUMMARY ───
        // Count employees per hour slot
        const hourlyCounts = [];
        const hourlyByShop = [];
        for (let h = TIMELINE_START; h < TIMELINE_END; h++) {
            let count = 0;
            const shopCounts = {};
            shifts.forEach(s => {
                const startParts = s.start_time.split(':');
                const endParts = s.end_time.split(':');
                const startH = parseInt(startParts[0]) + parseInt(startParts[1]) / 60;
                const endH = parseInt(endParts[0]) + parseInt(endParts[1]) / 60;
                if (startH <= h && endH > h) {
                    count++;
                    const sn = s.shop_name || 'Unknown';
                    shopCounts[sn] = (shopCounts[sn] || 0) + 1;
                }
            });
            hourlyCounts.push(count);
            hourlyByShop.push(shopCounts);
        }

        const maxStaff = Math.max(...hourlyCounts, 1);
        const totalEmployees = App.employees.length || 1;

        // Build summary row
        let summaryBarsHTML = `<div style="width:110px;min-width:110px;border-right:1px solid var(--border);
            display:flex;align-items:center;padding:0 8px;font-size:0.7rem;font-weight:600;color:var(--text-secondary)">
            Staff/hr
        </div>`;
        for (let h = 0; h < TIMELINE_HOURS; h++) {
            const c = hourlyCounts[h];
            const pct = (c / maxStaff) * 100;
            let color, label;
            if (c === 0) { color = 'var(--text-muted)'; label = ''; }
            else if (c <= 1) { color = 'var(--danger)'; label = 'Low'; }
            else if (c <= 3) { color = 'var(--warning)'; label = 'OK'; }
            else { color = 'var(--success)'; label = 'Busy'; }

            // Tooltip with per-shop breakdown
            const shopDetail = Object.entries(hourlyByShop[h])
                .map(([name, cnt]) => `${name}: ${cnt}`)
                .join(', ');
            const tooltip = c > 0 ? `${c} staff (${shopDetail})` : 'No staff';

            summaryBarsHTML += `<div class="hourly-summary-cell" style="width:${hourWidth}px;min-width:${hourWidth}px;" title="${tooltip}">
                <div class="hourly-bar-bg">
                    <div class="hourly-bar-fill" style="height:${pct}%;background:${color}"></div>
                </div>
                <span class="hourly-count" style="color:${color}">${c || ''}</span>
            </div>`;
        }

        container.innerHTML = `
            ${overlapAlertHTML}
            <div class="timeline-grid" style="min-width:${110 + TIMELINE_HOURS * hourWidth}px; position:relative;">
                <div class="timeline-hour-labels">${hourLabelsHTML}</div>
                ${rowsHTML}
                <div class="hourly-summary-row">${summaryBarsHTML}</div>
                ${nowLineHTML}
            </div>
        `;

        // Update date label
        const label = document.getElementById('timeline-date-label');
        if (label) label.textContent = formatDate(timelineDate);

    } catch (err) {
        container.innerHTML = `<div class="alert-card alert-danger" style="margin:1rem;">
            <span class="material-icons-round">error</span>
            <span>${err.error || 'Failed to load timeline'}</span>
        </div>`;
    }
}

function shiftTimelineDate(days) {
    timelineDate.setDate(timelineDate.getDate() + days);
    loadTimeline();
    const label = document.getElementById('timeline-date-label');
    if (label) label.textContent = formatDate(timelineDate);
}

function goToTimelineToday() {
    timelineDate = new Date();
    loadTimeline();
    const label = document.getElementById('timeline-date-label');
    if (label) label.textContent = formatDate(timelineDate);
}

function showTimelineShiftDetail(shiftId) {
    // Fetch shift detail via API
    api(`shifts.php?id=${shiftId}`).then(s => {
        openModal('Shift Detail', `
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:1rem;">
                <span class="shop-dot" style="background:${s.shop_color}; width:14px; height:14px;"></span>
                <strong style="font-size:1.1rem;">${s.shop_name}</strong>
            </div>
            <div class="form-label">Employee</div>
            <div style="font-size:1rem; margin-bottom:0.75rem;">${s.employee_name}</div>
            <div class="form-label">Date</div>
            <div style="margin-bottom:0.75rem;">${formatDate(s.shift_date)}</div>
            <div class="form-label">Time</div>
            <div style="font-size:1.1rem; font-weight:600; margin-bottom:0.75rem;">${formatTime(s.start_time)} — ${formatTime(s.end_time)}</div>
            ${s.notes ? `<div class="form-label">Notes</div><div class="text-muted">${s.notes}</div>` : ''}
        `);
    }).catch(err => showToast('Failed to load shift detail', 'error'));
}

// ─── MONTHLY CALENDAR ───
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();

async function loadMonthlyCalendar() {
    const container = document.getElementById('monthly-calendar-container');
    if (!container) return;

    const shopFilter = document.getElementById('timeline-shop-filter')?.value || '';

    // Update header to show shop name
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const label = document.getElementById('calendar-month-label');
    let shopLabel = '';
    if (shopFilter) {
        const shop = App.shops.find(s => String(s.id) === shopFilter);
        shopLabel = shop ? ` — ${shop.name}` : '';
    }
    if (label) label.textContent = `📅 ${monthNames[calendarMonth]} ${calendarYear}${shopLabel}`;

    // Calculate date range for the month
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const dateFrom = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-01`;
    const dateTo = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    let query = `date_from=${dateFrom}&date_to=${dateTo}`;
    if (shopFilter) query += `&shop_id=${shopFilter}`;

    try {
        const shifts = await api(`shifts.php?${query}`);

        // Group shifts by day
        const byDay = {};
        for (let d = 1; d <= daysInMonth; d++) byDay[d] = [];

        shifts.forEach(s => {
            const day = parseInt(s.shift_date.split('-')[2]);
            byDay[day].push(s);
        });

        // Sort shifts within each day by start_time
        Object.values(byDay).forEach(dayShifts => {
            dayShifts.sort((a, b) => a.start_time.localeCompare(b.start_time));
        });

        const today = new Date();
        const todayDay = (today.getFullYear() === calendarYear && today.getMonth() === calendarMonth) ? today.getDate() : -1;
        const dowFull = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        // Build weekly rows (7 days per row)
        // Find which day of week the 1st falls on
        const firstDow = new Date(calendarYear, calendarMonth, 1).getDay();

        let html = '<div class="month-grid">';

        // Week header
        html += '<div class="month-week-header">';
        for (let dow = 0; dow < 7; dow++) {
            const isWe = dow === 0 || dow === 6;
            html += `<div class="month-day-header ${isWe ? 'cal-weekend-header' : ''}">${dowFull[dow]}</div>`;
        }
        html += '</div>';

        // Weeks
        let dayNum = 1;
        for (let week = 0; week < 6; week++) {
            if (dayNum > daysInMonth) break;

            html += '<div class="month-week-row">';
            for (let dow = 0; dow < 7; dow++) {
                if ((week === 0 && dow < firstDow) || dayNum > daysInMonth) {
                    html += '<div class="month-day-cell month-day-empty"></div>';
                } else {
                    const isToday = dayNum === todayDay;
                    const isWeekend = dow === 0 || dow === 6;
                    const dayShifts = byDay[dayNum];
                    const hasShifts = dayShifts.length > 0;

                    let shiftsHTML = '';
                    if (hasShifts) {
                        shiftsHTML = dayShifts.map(s => {
                            const st = s.start_time.substring(0, 5).replace(':00', '');
                            const et = s.end_time.substring(0, 5).replace(':00', '');
                            const empName = s.employee_name || 'Open';
                            const firstName = empName.split(' ')[0];
                            return `<div class="month-shift-entry" title="${s.shop_name}: ${s.employee_name} ${s.start_time}-${s.end_time}">
                                <span class="cal-shift-dot" style="background:${s.shop_color}"></span>
                                <span class="month-shift-time">${st}-${et}</span>
                                <span class="month-shift-name">${firstName}</span>
                            </div>`;
                        }).join('');
                    }

                    html += `<div class="month-day-cell ${isToday ? 'month-day-today' : ''} ${isWeekend ? 'month-day-weekend' : ''} ${hasShifts ? 'month-day-has' : ''}">
                        <div class="month-day-number">${dayNum}</div>
                        <div class="month-day-shifts">${shiftsHTML}</div>
                    </div>`;
                    dayNum++;
                }
            }
            html += '</div>';
        }

        html += '</div>';
        container.innerHTML = html;

    } catch (err) {
        container.innerHTML = `<div class="alert-card alert-danger" style="margin:1rem;">
            <span class="material-icons-round">error</span>
            <span>${err.error || 'Failed to load calendar'}</span>
        </div>`;
    }
}

function shiftCalendarMonth(dir) {
    calendarMonth += dir;
    if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
    if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const label = document.getElementById('calendar-month-label');
    if (label) label.textContent = `📅 ${monthNames[calendarMonth]} ${calendarYear}`;
    loadMonthlyCalendar();
}

function goToCalendarCurrentMonth() {
    const now = new Date();
    calendarMonth = now.getMonth();
    calendarYear = now.getFullYear();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const label = document.getElementById('calendar-month-label');
    if (label) label.textContent = `📅 ${monthNames[calendarMonth]} ${calendarYear}`;
    loadMonthlyCalendar();
}

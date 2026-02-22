<?php
/**
 * Dashboard API — Summary data for boss mode
 */
session_start();
require_once __DIR__ . '/../db.php';
setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['error' => 'GET only'], 405);
}

$db = getDB();
$view = $_GET['view'] ?? 'all';
$today = date('Y-m-d');

$response = [];

// ─── WHO'S WORKING TODAY ───
if ($view === 'today' || $view === 'all') {
    $stmt = $db->prepare("
        SELECT s.*, e.name as employee_name, e.phone as employee_phone,
               sh.name as shop_name, sh.color as shop_color
        FROM shifts s
        JOIN employees e ON e.id = s.employee_id
        JOIN shops sh ON sh.id = s.shop_id
        WHERE s.shift_date = ? AND s.status = 'scheduled'
        ORDER BY sh.name, s.start_time
    ");
    $stmt->execute([$today]);
    $todayShifts = $stmt->fetchAll();

    // Group by shop
    $byShop = [];
    foreach ($todayShifts as $shift) {
        $shopName = $shift['shop_name'];
        if (!isset($byShop[$shopName])) {
            $byShop[$shopName] = [
                'shop_name' => $shopName,
                'shop_color' => $shift['shop_color'],
                'shifts' => [],
            ];
        }
        $byShop[$shopName]['shifts'][] = $shift;
    }
    $response['today'] = array_values($byShop);
}

// ─── TOMORROW'S COVERAGE ───
if ($view === 'tomorrow' || $view === 'all') {
    $tomorrow = date('Y-m-d', strtotime('+1 day'));
    $stmt = $db->prepare("
        SELECT s.*, e.name as employee_name, e.phone as employee_phone,
               sh.name as shop_name, sh.color as shop_color
        FROM shifts s
        JOIN employees e ON e.id = s.employee_id
        JOIN shops sh ON sh.id = s.shop_id
        WHERE s.shift_date = ? AND s.status = 'scheduled'
        ORDER BY sh.name, s.start_time
    ");
    $stmt->execute([$tomorrow]);
    $tomorrowShifts = $stmt->fetchAll();

    $byShopTomorrow = [];
    foreach ($tomorrowShifts as $shift) {
        $shopName = $shift['shop_name'];
        if (!isset($byShopTomorrow[$shopName])) {
            $byShopTomorrow[$shopName] = [
                'shop_name' => $shopName,
                'shop_color' => $shift['shop_color'],
                'shifts' => [],
            ];
        }
        $byShopTomorrow[$shopName]['shifts'][] = $shift;
    }
    $response['tomorrow'] = array_values($byShopTomorrow);
    $response['tomorrow_date'] = $tomorrow;
}

// ─── HOURS WORKED (weekly / monthly) ───
if ($view === 'hours' || $view === 'all') {
    $period = $_GET['period'] ?? 'week';

    if ($period === 'week') {
        // Current week (Monday to Sunday)
        $monday = date('Y-m-d', strtotime('monday this week'));
        $sunday = date('Y-m-d', strtotime('sunday this week'));
        $dateFrom = $monday;
        $dateTo = $sunday;
    } else {
        // Current month
        $dateFrom = date('Y-m-01');
        $dateTo = date('Y-m-t');
    }

    $timeDiff = isPostgres()
        ? 'EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 60'
        : 'TIMESTAMPDIFF(MINUTE, s.start_time, s.end_time)';

    $stmt = $db->prepare("
        SELECT e.id, e.name, e.max_weekly_hours,
               SUM($timeDiff) / 60.0 as total_hours,
               COUNT(s.id) as shift_count
        FROM employees e
        LEFT JOIN shifts s ON s.employee_id = e.id
            AND s.shift_date BETWEEN ? AND ?
            AND s.status = 'scheduled'
        WHERE e.active = 1
        GROUP BY e.id, e.name, e.max_weekly_hours
        ORDER BY e.name
    ");
    $stmt->execute([$dateFrom, $dateTo]);
    $hours = $stmt->fetchAll();

    // Add over-limit flag
    foreach ($hours as &$h) {
        $h['total_hours'] = round(floatval($h['total_hours']), 1);
        $h['over_limit'] = ($period === 'week' && $h['total_hours'] > floatval($h['max_weekly_hours']));
    }

    $response['hours'] = [
        'period' => $period,
        'date_from' => $dateFrom,
        'date_to' => $dateTo,
        'employees' => $hours,
    ];
}

// ─── ALERTS ───
if ($view === 'alerts' || $view === 'all') {
    $alerts = [];

    // 1. Employees over max weekly hours
    $monday = date('Y-m-d', strtotime('monday this week'));
    $sunday = date('Y-m-d', strtotime('sunday this week'));

    $timeDiff2 = isPostgres()
        ? 'EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 60'
        : 'TIMESTAMPDIFF(MINUTE, s.start_time, s.end_time)';

    $stmt = $db->prepare("
        SELECT e.id, e.name, e.max_weekly_hours,
               SUM($timeDiff2) / 60.0 as weekly_hours
        FROM employees e
        JOIN shifts s ON s.employee_id = e.id
            AND s.shift_date BETWEEN ? AND ?
            AND s.status = 'scheduled'
        WHERE e.active = 1
        GROUP BY e.id, e.name, e.max_weekly_hours
        HAVING SUM($timeDiff2) / 60.0 > e.max_weekly_hours
    ");
    $stmt->execute([$monday, $sunday]);
    $overLimit = $stmt->fetchAll();

    foreach ($overLimit as $ol) {
        $alerts[] = [
            'type' => 'over_hours',
            'severity' => 'warning',
            'message' => $ol['name'] . ' has ' . round($ol['weekly_hours'], 1) . 'h this week (max: ' . $ol['max_weekly_hours'] . 'h)',
            'employee_id' => $ol['id'],
        ];
    }

    // 2. Pending swap requests
    $swapCount = $db->query("SELECT COUNT(*) FROM swap_requests WHERE status IN ('pending','accepted')")->fetchColumn();
    if ($swapCount > 0) {
        $alerts[] = [
            'type' => 'pending_swaps',
            'severity' => 'info',
            'message' => $swapCount . ' pending swap request(s) need attention',
        ];
    }

    // 3. Days with no coverage in next 7 days
    $shops = $db->query("SELECT id, name FROM shops WHERE active = 1")->fetchAll();
    for ($i = 0; $i < 7; $i++) {
        $checkDate = date('Y-m-d', strtotime("+$i days"));
        foreach ($shops as $shop) {
            $covered = $db->prepare("SELECT COUNT(*) FROM shifts WHERE shop_id = ? AND shift_date = ? AND status = 'scheduled'");
            $covered->execute([$shop['id'], $checkDate]);
            if ($covered->fetchColumn() == 0) {
                $dayName = date('l', strtotime($checkDate));
                $alerts[] = [
                    'type' => 'uncovered',
                    'severity' => 'danger',
                    'message' => $shop['name'] . ' has no staff on ' . $dayName . ' ' . $checkDate,
                    'shop_id' => $shop['id'],
                    'date' => $checkDate,
                ];
            }
        }
    }

    $response['alerts'] = $alerts;
}

// ─── SHOPS LIST ───
if ($view === 'shops' || $view === 'all') {
    $response['shops'] = $db->query("SELECT * FROM shops WHERE active = 1 ORDER BY name")->fetchAll();
}

jsonResponse($response);

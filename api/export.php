<?php
/**
 * Export API — Generate CSV/Excel with worked hours per employee
 * Usage: GET /api/export.php?date_from=2026-01-01&date_to=2026-01-31
 */
session_start();
require_once __DIR__ . '/../db.php';
setCorsHeaders();

$db = getDB();

$dateFrom = $_GET['date_from'] ?? date('Y-m-01');       // Default: 1st of current month
$dateTo = $_GET['date_to'] ?? date('Y-m-t');        // Default: last day of current month
$format = $_GET['format'] ?? 'csv';                 // csv or json
$shopId = !empty($_GET['shop_id']) ? intval($_GET['shop_id']) : null;

// Get shop name for filename if filtered
$shopName = '';
if ($shopId) {
    $stmtShop = $db->prepare("SELECT name FROM shops WHERE id = ?");
    $stmtShop->execute([$shopId]);
    $shopRow = $stmtShop->fetch();
    $shopName = $shopRow ? $shopRow['name'] : '';
}

// ─── Query: aggregate hours per employee in the given date range ───
$shopFilter = $shopId ? "AND s.shop_id = ?" : "";
$params1 = [$dateFrom, $dateTo];
if ($shopId)
    $params1[] = $shopId;

$sql = "
    SELECT 
        e.id AS employee_id,
        e.name AS employee_name,
        e.role,
        COUNT(s.id) AS total_shifts,
        COALESCE(SUM(
            TIMESTAMPDIFF(MINUTE, 
                CONCAT(s.shift_date, ' ', s.start_time), 
                CONCAT(s.shift_date, ' ', s.end_time)
            )
        ), 0) AS total_minutes,
        MIN(s.shift_date) AS first_shift,
        MAX(s.shift_date) AS last_shift
    FROM employees e
    LEFT JOIN shifts s ON s.employee_id = e.id 
        AND s.shift_date >= ? 
        AND s.shift_date <= ?
        AND s.status != 'cancelled'
        {$shopFilter}
    GROUP BY e.id, e.name, e.role
    ORDER BY e.name
";

$stmt = $db->prepare($sql);
$stmt->execute($params1);
$results = $stmt->fetchAll();

// If shop filter is active, only show employees that have shifts
if ($shopId) {
    $results = array_filter($results, function ($r) {
        return $r['total_shifts'] > 0;
    });
    $results = array_values($results);
}

// Also get per-shop breakdown per employee
$params2 = [$dateFrom, $dateTo];
if ($shopId)
    $params2[] = $shopId;

$sqlShops = "
    SELECT 
        e.id AS employee_id,
        sh.name AS shop_name,
        COUNT(s.id) AS shifts,
        COALESCE(SUM(
            TIMESTAMPDIFF(MINUTE, 
                CONCAT(s.shift_date, ' ', s.start_time), 
                CONCAT(s.shift_date, ' ', s.end_time)
            )
        ), 0) AS minutes
    FROM employees e
    JOIN shifts s ON s.employee_id = e.id 
        AND s.shift_date >= ? 
        AND s.shift_date <= ?
        AND s.status != 'cancelled'
        {$shopFilter}
    JOIN shops sh ON sh.id = s.shop_id
    GROUP BY e.id, sh.name
    ORDER BY e.name, sh.name
";

$stmtShops = $db->prepare($sqlShops);
$stmtShops->execute($params2);
$shopBreakdown = $stmtShops->fetchAll();

// Group shop breakdown by employee
$shopsByEmployee = [];
foreach ($shopBreakdown as $row) {
    $shopsByEmployee[$row['employee_id']][] = $row;
}

// Get all unique shop names for column headers
$allShops = [];
foreach ($shopBreakdown as $row) {
    if (!in_array($row['shop_name'], $allShops)) {
        $allShops[] = $row['shop_name'];
    }
}
sort($allShops);

// ─── Format: JSON (for preview) ───
if ($format === 'json') {
    header('Content-Type: application/json');
    $output = [];
    foreach ($results as $r) {
        $hours = round($r['total_minutes'] / 60, 2);
        $shops = [];
        if (isset($shopsByEmployee[$r['employee_id']])) {
            foreach ($shopsByEmployee[$r['employee_id']] as $sb) {
                $shops[] = [
                    'shop' => $sb['shop_name'],
                    'shifts' => intval($sb['shifts']),
                    'hours' => round($sb['minutes'] / 60, 2),
                ];
            }
        }
        $output[] = [
            'employee_id' => $r['employee_id'],
            'employee_name' => $r['employee_name'],
            'role' => $r['role'],
            'total_shifts' => intval($r['total_shifts']),
            'total_hours' => $hours,
            'first_shift' => $r['first_shift'],
            'last_shift' => $r['last_shift'],
            'shops' => $shops,
        ];
    }
    echo json_encode([
        'period' => ['from' => $dateFrom, 'to' => $dateTo],
        'employees' => $output,
    ]);
    exit;
}

// ─── Format: CSV (Excel-compatible) ───
$shopSlug = $shopName ? preg_replace('/[^a-zA-Z0-9]/', '_', $shopName) . '_' : '';
$filename = "payroll_{$shopSlug}{$dateFrom}_to_{$dateTo}.csv";
header('Content-Type: text/csv; charset=UTF-8');
header("Content-Disposition: attachment; filename=\"{$filename}\"");
// BOM for Excel UTF-8 compatibility
echo "\xEF\xBB\xBF";

$out = fopen('php://output', 'w');

// Header row
$headerRow = ['Employee', 'Role', 'Total Shifts', 'Total Hours'];
foreach ($allShops as $shop) {
    $headerRow[] = "{$shop} (Shifts)";
    $headerRow[] = "{$shop} (Hours)";
}
$headerRow[] = 'First Shift';
$headerRow[] = 'Last Shift';
$headerRow[] = 'Period From';
$headerRow[] = 'Period To';
fputcsv($out, $headerRow, ';');

// Data rows
foreach ($results as $r) {
    $hours = round($r['total_minutes'] / 60, 2);
    $row = [
        $r['employee_name'],
        $r['role'] ?: '-',
        $r['total_shifts'],
        $hours,
    ];

    // Per-shop columns
    foreach ($allShops as $shop) {
        $found = false;
        if (isset($shopsByEmployee[$r['employee_id']])) {
            foreach ($shopsByEmployee[$r['employee_id']] as $sb) {
                if ($sb['shop_name'] === $shop) {
                    $row[] = $sb['shifts'];
                    $row[] = round($sb['minutes'] / 60, 2);
                    $found = true;
                    break;
                }
            }
        }
        if (!$found) {
            $row[] = 0;
            $row[] = 0;
        }
    }

    $row[] = $r['first_shift'] ?: '-';
    $row[] = $r['last_shift'] ?: '-';
    $row[] = $dateFrom;
    $row[] = $dateTo;
    fputcsv($out, $row, ';');
}

// Summary row
$totalShifts = array_sum(array_column($results, 'total_shifts'));
$totalHours = round(array_sum(array_column($results, 'total_minutes')) / 60, 2);
$summaryRow = ['TOTAL', '', $totalShifts, $totalHours];
foreach ($allShops as $shop) {
    $shopTotalShifts = 0;
    $shopTotalMinutes = 0;
    foreach ($shopBreakdown as $sb) {
        if ($sb['shop_name'] === $shop) {
            $shopTotalShifts += $sb['shifts'];
            $shopTotalMinutes += $sb['minutes'];
        }
    }
    $summaryRow[] = $shopTotalShifts;
    $summaryRow[] = round($shopTotalMinutes / 60, 2);
}
$summaryRow[] = '';
$summaryRow[] = '';
$summaryRow[] = '';
$summaryRow[] = '';
fputcsv($out, $summaryRow, ';');

fclose($out);

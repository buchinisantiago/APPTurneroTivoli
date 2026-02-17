<?php
session_start();
require_once __DIR__ . '/../db.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$db = getDB();

// Only managers can generate templates
if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'manager') {
    jsonResponse(['error' => 'Unauthorized'], 403);
}

if ($method === 'POST') {
    $data = getRequestBody();

    // valid inputs: shop_id, date_start, date_end, pattern
    // pattern = { "1": [{"start":"10:00", "end":"18:00", "count":1}], "2": ... }

    $shopId = intval($data['shop_id'] ?? 0);
    $dateStart = $data['date_start'] ?? '';
    $dateEnd = $data['date_end'] ?? '';
    $pattern = $data['pattern'] ?? []; // Keyed by day number (1=Mon, 7=Sun)

    if (!$shopId || !$dateStart || !$dateEnd || empty($pattern)) {
        jsonResponse(['error' => 'Missing required fields'], 400);
    }

    $start = new DateTime($dateStart);
    $end = new DateTime($dateEnd);
    // End date inclusive
    $end->modify('+1 day');

    $interval = DateInterval::createFromDateString('1 day');
    $period = new DatePeriod($start, $interval, $end);

    $countCreated = 0;

    try {
        $db->beginTransaction();

        $stmt = $db->prepare("INSERT INTO shifts (shop_id, shift_date, start_time, end_time, notes, is_unassigned, employee_id) VALUES (?, ?, ?, ?, ?, 1, NULL)");

        foreach ($period as $dt) {
            $dayNum = $dt->format('N'); // 1 (Mon) to 7 (Sun)
            $dateStr = $dt->format('Y-m-d');

            if (isset($pattern[$dayNum]) && is_array($pattern[$dayNum])) {
                foreach ($pattern[$dayNum] as $slot) {
                    // slot: { "start": "HH:MM", "end": "HH:MM", "count": 1 }
                    $startTime = $slot['start'];
                    $endTime = $slot['end'];
                    $qty = intval($slot['count'] ?? 1);

                    for ($i = 0; $i < $qty; $i++) {
                        $stmt->execute([$shopId, $dateStr, $startTime, $endTime, 'Open Shift']);
                        $countCreated++;
                    }
                }
            }
        }

        $db->commit();
        jsonResponse(['success' => true, 'message' => "Successfully created $countCreated shifts"], 201);

    } catch (PDOException $e) {
        $db->rollBack();
        jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
} else {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

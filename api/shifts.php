<?php
/**
 * Shifts API — CRUD with overlap detection
 */
session_start();
require_once __DIR__ . '/../db.php';
setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$db = getDB();

/**
 * Check if a shift would overlap with existing shifts for the same employee
 */
function checkOverlap(PDO $db, int $employeeId, string $date, string $startTime, string $endTime, ?int $excludeId = null): ?array
{
    $sql = "SELECT s.*, sh.name as shop_name
            FROM shifts s
            JOIN shops sh ON sh.id = s.shop_id
            WHERE s.employee_id = ?
              AND s.shift_date = ?
              AND s.status != 'cancelled'
              AND s.start_time < ?
              AND s.end_time > ?";
    $params = [$employeeId, $date, $endTime, $startTime];

    if ($excludeId) {
        $sql .= " AND s.id != ?";
        $params[] = $excludeId;
    }

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetch() ?: null;
}

/**
 * Check if the employee has approved time off on a given date
 */
function checkTimeOff(PDO $db, int $employeeId, string $date): ?array
{
    $stmt = $db->prepare("
        SELECT t.*, e.name AS employee_name
        FROM time_off t
        JOIN employees e ON e.id = t.employee_id
        WHERE t.employee_id = ?
          AND t.date_from <= ?
          AND t.date_to >= ?
          AND t.status = 'approved'
        LIMIT 1
    ");
    $stmt->execute([$employeeId, $date, $date]);
    return $stmt->fetch() ?: null;
}

switch ($method) {
    // ─── LIST SHIFTS ───
    case 'GET':
        $id = $_GET['id'] ?? null;

        if ($id) {
            $stmt = $db->prepare("
                SELECT s.*, e.name as employee_name, sh.name as shop_name, sh.color as shop_color
                FROM shifts s
                JOIN employees e ON e.id = s.employee_id
                JOIN shops sh ON sh.id = s.shop_id
                WHERE s.id = ?
            ");
            $stmt->execute([$id]);
            $shift = $stmt->fetch();
            if (!$shift)
                jsonResponse(['error' => 'Shift not found'], 404);
            jsonResponse($shift);
        }

        // Build query with filters
        $where = ["s.status != 'cancelled'"];
        $params = [];

        if (!empty($_GET['shop_id'])) {
            $where[] = "s.shop_id = ?";
            $params[] = $_GET['shop_id'];
        }
        if (!empty($_GET['employee_id'])) {
            $where[] = "s.employee_id = ?";
            $params[] = $_GET['employee_id'];
        }
        if (!empty($_GET['date'])) {
            $where[] = "s.shift_date = ?";
            $params[] = $_GET['date'];
        }
        if (!empty($_GET['date_from'])) {
            $where[] = "s.shift_date >= ?";
            $params[] = $_GET['date_from'];
        }
        if (!empty($_GET['date_to'])) {
            $where[] = "s.shift_date <= ?";
            $params[] = $_GET['date_to'];
        }

        $whereClause = implode(' AND ', $where);
        $sql = "SELECT s.*, e.name as employee_name, sh.name as shop_name, sh.color as shop_color
                FROM shifts s
                LEFT JOIN employees e ON e.id = s.employee_id
                JOIN shops sh ON sh.id = s.shop_id
                WHERE $whereClause
                ORDER BY s.shift_date, s.start_time";

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        jsonResponse($stmt->fetchAll());
        break;

    // ─── CREATE SHIFT ───
    case 'POST':
        $data = getRequestBody();
        error_log("POST shift data: " . json_encode($data));

        $employeeId = intval($data['employee_id'] ?? 0);
        $shopId = intval($data['shop_id'] ?? 0);
        $date = $data['date'] ?? '';
        $startTime = $data['start_time'] ?? '';
        $endTime = $data['end_time'] ?? '';
        $notes = trim($data['notes'] ?? '');

        // Validation
        if (!$employeeId || !$shopId || !$date || !$startTime || !$endTime) {
            error_log("Validation failed");
            jsonResponse(['error' => 'employee_id, shop_id, date, start_time, end_time are required'], 400);
        }
        if ($startTime >= $endTime) {
            error_log("Time validation failed");
            jsonResponse(['error' => 'start_time must be before end_time'], 400);
        }

        // Check overlap
        $overlap = checkOverlap($db, $employeeId, $date, $startTime, $endTime);
        if ($overlap) {
            error_log("Overlap detected");

            jsonResponse([
                'error' => 'Schedule overlap detected',
                'conflict' => [
                    'shift_id' => $overlap['id'],
                    'shop' => $overlap['shop_name'],
                    'time' => $overlap['start_time'] . ' - ' . $overlap['end_time'],
                ]
            ], 409);
        }

        // Check time off
        $forceOverride = !empty($data['force_timeoff']);
        if (!$forceOverride) {
            try {
                $timeOff = checkTimeOff($db, $employeeId, $date);
                if ($timeOff) {
                    $typeLabels = ['vacation' => 'Vacation', 'unavailable' => 'Unavailable', 'sick' => 'Sick Leave', 'personal' => 'Personal'];
                    jsonResponse([
                        'error' => 'time_off_conflict',
                        'message' => $timeOff['employee_name'] . ' has approved time off (' . ($typeLabels[$timeOff['type']] ?? $timeOff['type']) . ') from ' . $timeOff['date_from'] . ' to ' . $timeOff['date_to'],
                        'time_off' => $timeOff
                    ], 409);
                }
            } catch (PDOException $e) {
                error_log("Error checking time off: " . $e->getMessage());
                // Continue without blocking if check fails, but log it
            }
        }

        try {
            $stmt = $db->prepare("INSERT INTO shifts (employee_id, shop_id, shift_date, start_time, end_time, notes) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([$employeeId, $shopId, $date, $startTime, $endTime, $notes]);
            error_log("Shift created successfully. ID: " . $db->lastInsertId());
            jsonResponse(['success' => true, 'id' => $db->lastInsertId(), 'message' => 'Shift created'], 201);
        } catch (PDOException $e) {
            error_log("Database error in POST shift: " . $e->getMessage());
            jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
        }
        break;

    // ─── UPDATE SHIFT ───
    case 'PUT':
        $data = getRequestBody();
        $id = $data['id'] ?? $_GET['id'] ?? null;
        if (!$id)
            jsonResponse(['error' => 'ID is required'], 400);

        // Get current shift
        $stmt = $db->prepare("SELECT * FROM shifts WHERE id = ?");
        $stmt->execute([$id]);
        $currentShift = $stmt->fetch();

        if (!$currentShift)
            jsonResponse(['error' => 'Shift not found'], 404);

        $employeeId = intval($data['employee_id'] ?? $currentShift['employee_id']);
        $shopId = intval($data['shop_id'] ?? $currentShift['shop_id']);
        $date = $data['date'] ?? $currentShift['shift_date'];
        $startTime = $data['start_time'] ?? $currentShift['start_time'];
        $endTime = $data['end_time'] ?? $currentShift['end_time'];
        $status = $data['status'] ?? $currentShift['status'];
        $notes = $data['notes'] ?? $currentShift['notes'];

        if ($startTime >= $endTime) {
            jsonResponse(['error' => 'start_time must be before end_time'], 400);
        }

        // Check overlap (exclude current shift)
        $overlap = checkOverlap($db, $employeeId, $date, $startTime, $endTime, intval($id));
        if ($overlap) {
            jsonResponse([
                'error' => 'Schedule overlap detected',
                'conflict' => [
                    'shift_id' => $overlap['id'],
                    'shop' => $overlap['shop_name'],
                    'time' => $overlap['start_time'] . ' - ' . $overlap['end_time'],
                ]
            ], 409);
        }

        // Check time off (allow override with force flag)
        $forceOverride = !empty($data['force_timeoff']);
        if (!$forceOverride) {
            try {
                $timeOff = checkTimeOff($db, $employeeId, $date);
                if ($timeOff) {
                    $typeLabels = ['vacation' => 'Vacation', 'unavailable' => 'Unavailable', 'sick' => 'Sick Leave', 'personal' => 'Personal'];
                    jsonResponse([
                        'error' => 'time_off_conflict',
                        'message' => $timeOff['employee_name'] . ' has approved time off (' . ($typeLabels[$timeOff['type']] ?? $timeOff['type']) . ') from ' . $timeOff['date_from'] . ' to ' . $timeOff['date_to'],
                        'time_off' => $timeOff
                    ], 409);
                }
            } catch (PDOException $e) {
                error_log("Error checking time off in PUT: " . $e->getMessage());
            }
        }

        $isUnassigned = isset($data['is_unassigned']) ? intval($data['is_unassigned']) : ($currentShift['is_unassigned'] ?? 0);

        $stmt = $db->prepare("UPDATE shifts SET employee_id = ?, shop_id = ?, shift_date = ?, start_time = ?, end_time = ?, status = ?, notes = ?, is_unassigned = ? WHERE id = ?");
        $stmt->execute([$employeeId, $shopId, $date, $startTime, $endTime, $status, $notes, $isUnassigned, $id]);

        jsonResponse(['success' => true, 'message' => 'Shift updated']);
        break;

    // ─── DELETE SHIFT ───
    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if (!$id)
            jsonResponse(['error' => 'ID is required'], 400);

        $db->prepare("UPDATE shifts SET status = 'cancelled' WHERE id = ?")->execute([$id]);
        jsonResponse(['success' => true, 'message' => 'Shift cancelled']);
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}

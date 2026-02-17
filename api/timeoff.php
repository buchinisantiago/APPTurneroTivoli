<?php
/**
 * Time Off API — Staff availability / unavailability
 */
session_start();
require_once __DIR__ . '/../db.php';
setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$db = getDB();

switch ($method) {
    // ─── LIST TIME OFF ───
    case 'GET':
        $where = ['1=1'];
        $params = [];

        if (!empty($_GET['employee_id'])) {
            $where[] = "t.employee_id = ?";
            $params[] = $_GET['employee_id'];
        }
        if (!empty($_GET['status'])) {
            $where[] = "t.status = ?";
            $params[] = $_GET['status'];
        }
        if (!empty($_GET['date_from'])) {
            $where[] = "t.date_to >= ?";
            $params[] = $_GET['date_from'];
        }
        if (!empty($_GET['date_to'])) {
            $where[] = "t.date_from <= ?";
            $params[] = $_GET['date_to'];
        }

        $whereClause = implode(' AND ', $where);
        $sql = "SELECT t.*, e.name AS employee_name
                FROM time_off t
                JOIN employees e ON e.id = t.employee_id
                WHERE {$whereClause}
                ORDER BY t.date_from DESC";

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        jsonResponse($stmt->fetchAll());
        break;

    // ─── CREATE TIME OFF REQUEST ───
    case 'POST':
        $data = getRequestBody();
        $employeeId = intval($data['employee_id'] ?? 0);
        $dateFrom = $data['date_from'] ?? '';
        $dateTo = $data['date_to'] ?? '';
        $type = $data['type'] ?? 'unavailable';
        $reason = trim($data['reason'] ?? '');

        if (!$employeeId || !$dateFrom || !$dateTo) {
            jsonResponse(['error' => 'employee_id, date_from, date_to are required'], 400);
        }
        if ($dateFrom > $dateTo) {
            jsonResponse(['error' => 'date_from must be before or equal to date_to'], 400);
        }

        // Check for overlapping time off
        $stmt = $db->prepare("SELECT id FROM time_off 
            WHERE employee_id = ? AND date_from <= ? AND date_to >= ? AND status != 'rejected'");
        $stmt->execute([$employeeId, $dateTo, $dateFrom]);
        if ($stmt->fetch()) {
            jsonResponse(['error' => 'Overlapping time off request already exists'], 409);
        }

        $stmt = $db->prepare("INSERT INTO time_off (employee_id, date_from, date_to, type, reason) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$employeeId, $dateFrom, $dateTo, $type, $reason]);

        jsonResponse(['success' => true, 'id' => $db->lastInsertId(), 'message' => 'Time off request submitted'], 201);
        break;

    // ─── UPDATE (approve/reject/cancel) ───
    case 'PUT':
        $data = getRequestBody();
        $id = $data['id'] ?? $_GET['id'] ?? null;
        $action = $data['action'] ?? '';

        if (!$id)
            jsonResponse(['error' => 'ID is required'], 400);

        switch ($action) {
            case 'approve':
                $db->prepare("UPDATE time_off SET status = 'approved' WHERE id = ?")->execute([$id]);
                jsonResponse(['success' => true, 'message' => 'Time off approved']);
                break;
            case 'reject':
                $db->prepare("UPDATE time_off SET status = 'rejected' WHERE id = ?")->execute([$id]);
                jsonResponse(['success' => true, 'message' => 'Time off rejected']);
                break;
            case 'cancel':
                $db->prepare("DELETE FROM time_off WHERE id = ?")->execute([$id]);
                jsonResponse(['success' => true, 'message' => 'Time off cancelled']);
                break;
            default:
                jsonResponse(['error' => 'Invalid action. Use: approve, reject, cancel'], 400);
        }
        break;

    // ─── DELETE ───
    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if (!$id)
            jsonResponse(['error' => 'ID is required'], 400);
        $db->prepare("DELETE FROM time_off WHERE id = ?")->execute([$id]);
        jsonResponse(['success' => true, 'message' => 'Time off deleted']);
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}

<?php
/**
 * Employees API — CRUD + Availability
 */
session_start();
require_once __DIR__ . '/../db.php';
setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$db = getDB();

switch ($method) {
    // ─── LIST ALL EMPLOYEES ───
    case 'GET':
        $id = $_GET['id'] ?? null;

        if ($id) {
            // Single employee with availability
            $stmt = $db->prepare("SELECT * FROM employees WHERE id = ? AND active = 1");
            $stmt->execute([$id]);
            $emp = $stmt->fetch();
            if (!$emp)
                jsonResponse(['error' => 'Employee not found'], 404);

            $avail = $db->prepare("SELECT id, day_of_week, start_time, end_time FROM availability WHERE employee_id = ? ORDER BY day_of_week, start_time");
            $avail->execute([$id]);
            $emp['availability'] = $avail->fetchAll();

            jsonResponse($emp);
        } else {
            // All employees
            $employees = $db->query("SELECT e.*, u.username FROM employees e LEFT JOIN users u ON u.employee_id = e.id WHERE e.active = 1 ORDER BY e.name")->fetchAll();

            // Attach availability
            foreach ($employees as &$emp) {
                $avail = $db->prepare("SELECT id, day_of_week, start_time, end_time FROM availability WHERE employee_id = ? ORDER BY day_of_week, start_time");
                $avail->execute([$emp['id']]);
                $emp['availability'] = $avail->fetchAll();
            }

            jsonResponse($employees);
        }
        break;

    // ─── CREATE EMPLOYEE ───
    case 'POST':
        $data = getRequestBody();
        $name = trim($data['name'] ?? '');
        $phone = trim($data['phone'] ?? '');
        $role = trim($data['role'] ?? '');
        $maxHours = floatval($data['max_weekly_hours'] ?? 40);
        $availability = $data['availability'] ?? [];

        if (empty($name))
            jsonResponse(['error' => 'Name is required'], 400);

        $db->beginTransaction();
        try {
            $stmt = $db->prepare("INSERT INTO employees (name, phone, role, max_weekly_hours) VALUES (?, ?, ?, ?)");
            $stmt->execute([$name, $phone, $role, $maxHours]);
            $empId = $db->lastInsertId();

            // Insert availability slots
            if (!empty($availability)) {
                $avStmt = $db->prepare("INSERT INTO availability (employee_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)");
                foreach ($availability as $slot) {
                    $avStmt->execute([$empId, $slot['day_of_week'], $slot['start_time'], $slot['end_time']]);
                }
            }

            // Link to user account if username provided
            if (!empty($data['link_username'])) {
                $linkStmt = $db->prepare("UPDATE users SET employee_id = ? WHERE username = ?");
                $linkStmt->execute([$empId, $data['link_username']]);
            }

            $db->commit();
            jsonResponse(['success' => true, 'id' => $empId, 'message' => 'Employee created'], 201);
        } catch (Exception $e) {
            $db->rollBack();
            jsonResponse(['error' => 'Failed to create employee: ' . $e->getMessage()], 500);
        }
        break;

    // ─── UPDATE EMPLOYEE ───
    case 'PUT':
        $data = getRequestBody();
        $id = $data['id'] ?? $_GET['id'] ?? null;
        if (!$id)
            jsonResponse(['error' => 'ID is required'], 400);

        $fields = [];
        $params = [];

        if (isset($data['name'])) {
            $fields[] = 'name = ?';
            $params[] = trim($data['name']);
        }
        if (isset($data['phone'])) {
            $fields[] = 'phone = ?';
            $params[] = trim($data['phone']);
        }
        if (isset($data['role'])) {
            $fields[] = 'role = ?';
            $params[] = trim($data['role']);
        }
        if (isset($data['max_weekly_hours'])) {
            $fields[] = 'max_weekly_hours = ?';
            $params[] = floatval($data['max_weekly_hours']);
        }

        if (empty($fields) && !isset($data['availability'])) {
            jsonResponse(['error' => 'No fields to update'], 400);
        }

        $db->beginTransaction();
        try {
            if (!empty($fields)) {
                $params[] = $id;
                $sql = "UPDATE employees SET " . implode(', ', $fields) . " WHERE id = ?";
                $db->prepare($sql)->execute($params);
            }

            // Update availability if provided
            if (isset($data['availability'])) {
                $db->prepare("DELETE FROM availability WHERE employee_id = ?")->execute([$id]);
                $avStmt = $db->prepare("INSERT INTO availability (employee_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)");
                foreach ($data['availability'] as $slot) {
                    $avStmt->execute([$id, $slot['day_of_week'], $slot['start_time'], $slot['end_time']]);
                }
            }

            $db->commit();
            jsonResponse(['success' => true, 'message' => 'Employee updated']);
        } catch (Exception $e) {
            $db->rollBack();
            jsonResponse(['error' => 'Failed to update: ' . $e->getMessage()], 500);
        }
        break;

    // ─── DELETE (soft) ───
    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if (!$id)
            jsonResponse(['error' => 'ID is required'], 400);

        $db->prepare("UPDATE employees SET active = 0 WHERE id = ?")->execute([$id]);
        jsonResponse(['success' => true, 'message' => 'Employee deactivated']);
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}

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
            $stmt = $db->prepare("SELECT e.*, u.username, u.id as user_id FROM employees e LEFT JOIN users u ON u.employee_id = e.id WHERE e.id = ? AND e.active = 1");
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
            $employees = $db->query("SELECT e.*, u.username, u.id as user_id FROM employees e LEFT JOIN users u ON u.employee_id = e.id WHERE e.active = 1 ORDER BY e.name")->fetchAll();

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
            $empId = isPostgres() ? $db->lastInsertId('employees_id_seq') : $db->lastInsertId();

            // Insert availability slots
            if (!empty($availability)) {
                $avStmt = $db->prepare("INSERT INTO availability (employee_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)");
                foreach ($availability as $slot) {
                    $avStmt->execute([$empId, $slot['day_of_week'], $slot['start_time'], $slot['end_time']]);
                }
            }

            // Auto-create user account with name.surname format
            $accents = ['á', 'é', 'í', 'ó', 'ú', 'Á', 'É', 'Í', 'Ó', 'Ú', 'ñ', 'Ñ'];
            $noAccents = ['a', 'e', 'i', 'o', 'u', 'a', 'e', 'i', 'o', 'u', 'n', 'n'];
            $cleanName = str_replace($accents, $noAccents, mb_strtolower(trim($name), 'UTF-8'));
            $baseUsername = preg_replace('/[^a-z0-9]+/', '.', $cleanName);
            $baseUsername = trim($baseUsername, '.');
            if (empty($baseUsername)) {
                $baseUsername = 'staff';
            }

            // Ensure unique username
            $username = $baseUsername;
            $counter = 1;
            while (true) {
                $chk = $db->prepare("SELECT id FROM users WHERE username = ?");
                $chk->execute([$username]);
                if (!$chk->fetch()) {
                    break;
                }
                $username = $baseUsername . $counter;
                $counter++;
            }

            // Create the linked user
            $defaultPassword = password_hash('1234', PASSWORD_DEFAULT);
            $userRole = 'staff';
            $userStmt = $db->prepare("INSERT INTO users (username, password_hash, role, employee_id) VALUES (?, ?, ?, ?)");
            $userStmt->execute([$username, $defaultPassword, $userRole, $empId]);

            $db->commit();
            jsonResponse(['success' => true, 'id' => $empId, 'message' => "Employee created (User: $username)"], 201);
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

        $db->beginTransaction();
        try {
            // Soft delete employee
            $db->prepare("UPDATE employees SET active = 0 WHERE id = ?")->execute([$id]);

            // Reassign future shifts to bidding
            $db->prepare("UPDATE shifts SET employee_id = NULL, is_unassigned = 1 WHERE employee_id = ? AND shift_date >= CURRENT_DATE AND status != 'cancelled'")->execute([$id]);

            $db->commit();
            jsonResponse(['success' => true, 'message' => 'Employee deactivated and shifts moved to bidding']);
        } catch (Exception $e) {
            $db->rollBack();
            jsonResponse(['error' => 'Failed to deactivate employee: ' . $e->getMessage()], 500);
        }
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}

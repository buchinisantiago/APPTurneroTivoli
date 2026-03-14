<?php
/**
 * Users API — Manage system accounts (Managers only)
 */
session_start();
require_once __DIR__ . '/../db.php';
setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$db = getDB();

// 1. Enforce Authentication
if (!isset($_SESSION['user_id'])) {
    jsonResponse(['error' => 'Not authenticated'], 401);
}

// 2. Allow any user to change their own password
if ($action === 'change_password' && $method === 'POST') {
    $data = getRequestBody();
    $old = $data['old_password'] ?? '';
    $new = $data['new_password'] ?? '';

    if (empty($old) || empty($new) || strlen($new) < 4) {
        jsonResponse(['error' => 'Invalid password format'], 400);
    }

    $stmt = $db->prepare("SELECT password_hash FROM users WHERE id = ?");
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($old, $user['password_hash'])) {
        jsonResponse(['error' => 'Incorrect current password'], 401);
    }

    $newHash = password_hash($new, PASSWORD_DEFAULT);
    $update = $db->prepare("UPDATE users SET password_hash = ? WHERE id = ?");
    $update->execute([$newHash, $_SESSION['user_id']]);

    jsonResponse(['success' => true, 'message' => 'Password updated']);
}

// 3. Enforce Manager Role for everything else
if ($_SESSION['role'] !== 'manager') {
    jsonResponse(['error' => 'Unauthorized. Manager access required.'], 403);
}

switch ($method) {
    case 'GET':
        // List all active users with their linked employee name
        $sql = "SELECT u.id, u.username, u.email, u.role, u.employee_id, u.active, e.name as employee_name 
                FROM users u
                LEFT JOIN employees e ON u.employee_id = e.id
                WHERE u.active = 1
                ORDER BY u.role, u.username";
        $users = $db->query($sql)->fetchAll();
        jsonResponse($users);
        break;

    case 'POST':
        if ($action === 'reset_password') {
            $data = getRequestBody();
            $id = $data['id'] ?? null;
            if (!$id)
                jsonResponse(['error' => 'User ID required'], 400);

            $newHash = password_hash('1234', PASSWORD_DEFAULT);
            $stmt = $db->prepare("UPDATE users SET password_hash = ? WHERE id = ?");
            $stmt->execute([$newHash, $id]);

            jsonResponse(['success' => true, 'message' => 'Password reset to 1234']);
            break;
        }

        // CREATE NEW USER (Default password '1234')
        $data = getRequestBody();
        $username = trim($data['username'] ?? '');
        $role = trim($data['role'] ?? 'staff');

        if (empty($username))
            jsonResponse(['error' => 'Username is required'], 400);
        if (!in_array($role, ['staff', 'manager']))
            jsonResponse(['error' => 'Invalid role'], 400);

        try {
            $hash = password_hash('1234', PASSWORD_DEFAULT);
            $stmt = $db->prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)");
            $stmt->execute([$username, $hash, $role]);
            jsonResponse(['success' => true, 'message' => 'User created']);
        } catch (PDOException $e) {
            // Check for duplicate username
            if (strpos($e->getMessage(), 'Duplicate entry') !== false || strpos($e->getMessage(), 'unique constraint') !== false) {
                jsonResponse(['error' => 'Username already exists'], 400);
            }
            jsonResponse(['error' => 'Failed to create user'], 500);
        }
        break;

    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if (!$id)
            jsonResponse(['error' => 'ID is required'], 400);
        if ($id == $_SESSION['user_id'])
            jsonResponse(['error' => 'Cannot delete your own account'], 400);

        $db->prepare("UPDATE users SET active = 0 WHERE id = ?")->execute([$id]);
        jsonResponse(['success' => true, 'message' => 'User deactivated']);
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}

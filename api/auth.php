<?php
/**
 * Auth API — Login / Session / Logout
 */
session_start();
require_once __DIR__ . '/../db.php';
setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

switch ($action) {
    case 'login':
        if ($method !== 'POST')
            jsonResponse(['error' => 'POST required'], 405);
        $data = getRequestBody();
        $username = trim($data['username'] ?? '');
        $password = $data['password'] ?? '';

        if (empty($username) || empty($password)) {
            jsonResponse(['error' => 'Username and password required'], 400);
        }

        $db = getDB();
        $stmt = $db->prepare("SELECT id, username, email, password_hash, role, employee_id FROM users WHERE username = ? AND active = 1");
        $stmt->execute([$username]);
        $user = $stmt->fetch();

        // Also try login by email
        if (!$user) {
            $stmt = $db->prepare("SELECT id, username, email, password_hash, role, employee_id FROM users WHERE email = ? AND active = 1");
            $stmt->execute([$username]);
            $user = $stmt->fetch();
        }

        if (!$user || !password_verify($password, $user['password_hash'])) {
            jsonResponse(['error' => 'Invalid credentials'], 401);
        }

        $_SESSION['user_id'] = $user['id'];
        $_SESSION['username'] = $user['username'];
        $_SESSION['role'] = $user['role'];
        $_SESSION['employee_id'] = $user['employee_id'];

        jsonResponse([
            'success' => true,
            'user' => [
                'id' => $user['id'],
                'username' => $user['username'],
                'email' => $user['email'],
                'role' => $user['role'],
                'employee_id' => $user['employee_id'],
            ]
        ]);
        break;

    case 'session':
        if (!isset($_SESSION['user_id'])) {
            jsonResponse(['authenticated' => false], 401);
        }
        jsonResponse([
            'authenticated' => true,
            'user' => [
                'id' => $_SESSION['user_id'],
                'username' => $_SESSION['username'],
                'role' => $_SESSION['role'],
                'employee_id' => $_SESSION['employee_id'] ?? null,
            ]
        ]);
        break;

    case 'logout':
        session_destroy();
        jsonResponse(['success' => true, 'message' => 'Logged out']);
        break;

    default:
        jsonResponse(['error' => 'Invalid action. Use: login, session, logout'], 400);
}

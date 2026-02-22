<?php
/**
 * Database Connection — APP-RRHH Schedule
 * Supports both MySQL (local/XAMPP) and PostgreSQL (Render/Supabase)
 */

// Detect environment
$database_url = getenv('DATABASE_URL');

if ($database_url) {
    // PRODUCTION (Render → Supabase PostgreSQL)
    $dbopts = parse_url($database_url);
    $host = $dbopts["host"];
    $port = $dbopts["port"];
    $user = $dbopts["user"];
    $pass = $dbopts["pass"];
    $dbname = ltrim($dbopts["path"], '/');

    define('DB_DSN', "pgsql:host=$host;port=$port;dbname=$dbname;sslmode=require");
    define('DB_USER', $user);
    define('DB_PASS', $pass);
    define('DB_DRIVER', 'pgsql');
} else {
    // LOCAL (XAMPP — MySQL)
    define('DB_DSN', "mysql:host=localhost;dbname=rrhh_schedule;charset=utf8mb4");
    define('DB_USER', 'root');
    define('DB_PASS', '');
    define('DB_DRIVER', 'mysql');
}

function getDB(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        try {
            $pdo = new PDO(
                DB_DSN,
                DB_USER,
                DB_PASS,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]
            );
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
            exit;
        }
    }
    return $pdo;
}

/**
 * Check if using PostgreSQL
 */
function isPostgres(): bool
{
    return DB_DRIVER === 'pgsql';
}

// CORS headers for API calls
function setCorsHeaders(): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit;
    }
}

// Get JSON body from request
function getRequestBody(): array
{
    $json = file_get_contents('php://input');
    return json_decode($json, true) ?? [];
}

// Send JSON response
function jsonResponse(mixed $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

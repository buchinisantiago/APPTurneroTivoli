<?php
/**
 * Database Connection — APP-RRHH Schedule
 * Supports both MySQL (local/XAMPP) and PostgreSQL (Render/Supabase)
 */

// Helper to read env var from all sources
function env(string $key, string $default = ''): string {
    return getenv($key) ?: ($_ENV[$key] ?? '') ?: ($_SERVER[$key] ?? '') ?: $default;
}

$db_host = env('DB_HOST');
$database_url = env('DATABASE_URL');

if ($db_host) {
    // PRODUCTION — Individual env vars (Render: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS)
    $host   = $db_host;
    $port   = env('DB_PORT', '6543');
    $dbname = env('DB_NAME', 'postgres');
    $user   = env('DB_USER');
    $pass   = env('DB_PASS');

    define('DB_DSN', "pgsql:host=$host;port=$port;dbname=$dbname;sslmode=require");
    define('DB_USER', $user);
    define('DB_PASS', $pass);
    define('DB_DRIVER', 'pgsql');
} elseif ($database_url) {
    // PRODUCTION fallback — Single DATABASE_URL string
    $dbopts = parse_url($database_url);
    $host   = $dbopts['host'];
    $port   = $dbopts['port'] ?? 5432;
    $user   = isset($dbopts['user']) ? urldecode($dbopts['user']) : '';
    $pass   = isset($dbopts['pass']) ? urldecode($dbopts['pass']) : '';
    $dbname = ltrim($dbopts['path'] ?? '/postgres', '/');

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
                    PDO::ATTR_EMULATE_PREPARES => true, // Required for Supabase Connection Pooler (PgBouncer)
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

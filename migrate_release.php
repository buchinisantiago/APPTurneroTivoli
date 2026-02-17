<?php
/**
 * Quick migration to add claimer_id column for Release Shift feature.
 * Run once then delete this file.
 */
try {
    $pdo = new PDO("mysql:host=localhost;dbname=rrhh_schedule;charset=utf8mb4", "root", "", [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
    ]);

    // Check if claimer_id already exists
    $cols = $pdo->query("SHOW COLUMNS FROM swap_requests LIKE 'claimer_id'")->fetchAll();
    if (count($cols) === 0) {
        $pdo->exec("ALTER TABLE swap_requests ADD COLUMN claimer_id INT DEFAULT NULL AFTER accepter_id");
        echo "<h2>✅ Added claimer_id column to swap_requests</h2>";
    } else {
        echo "<h2>⏭️ claimer_id already exists</h2>";
    }
    echo "<p><a href='/APP-RRHH%20Schedule/'>→ Go to App</a></p>";
} catch (PDOException $e) {
    echo "<h2>❌ Error: " . $e->getMessage() . "</h2>";
}

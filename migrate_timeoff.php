<?php
/**
 * Migration: Create time_off table for staff availability/unavailability
 * Run once: http://localhost/APP-RRHH%20Schedule/migrate_timeoff.php
 */
require_once __DIR__ . '/db.php';
$db = getDB();

try {
    $db->exec("
        CREATE TABLE IF NOT EXISTS time_off (
            id INT AUTO_INCREMENT PRIMARY KEY,
            employee_id INT NOT NULL,
            date_from DATE NOT NULL,
            date_to DATE NOT NULL,
            type ENUM('vacation','unavailable','sick','personal') NOT NULL DEFAULT 'unavailable',
            reason TEXT DEFAULT NULL,
            status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
            INDEX idx_timeoff_emp_dates (employee_id, date_from, date_to),
            INDEX idx_timeoff_dates (date_from, date_to)
        ) ENGINE=InnoDB;
    ");
    echo "<h2>✅ time_off table created successfully!</h2>";
    echo "<p>Staff can now set their availability via the app.</p>";
    echo "<p><a href='/APP-RRHH%20Schedule/'>← Back to App</a></p>";
} catch (PDOException $e) {
    echo "<h2>❌ Error: " . $e->getMessage() . "</h2>";
}

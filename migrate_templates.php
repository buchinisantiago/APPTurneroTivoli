<?php
require_once 'db.php';

try {
    $db = getDB();

    // Add is_unassigned column if it doesn't exist
    $sql = "SHOW COLUMNS FROM shifts LIKE 'is_unassigned'";
    $stmt = $db->query($sql);

    if ($stmt->rowCount() == 0) {
        // Column doesn't exist, add it
        $db->exec("ALTER TABLE shifts ADD COLUMN is_unassigned TINYINT(1) DEFAULT 0 AFTER employee_id");
        echo "✅ Column 'is_unassigned' added to 'shifts' table.<br>";

        // Make employee_id nullable to support unassigned shifts?
        // Actually, if is_unassigned is 1, employee_id can be NULL or we can force it 0.
        // Let's modify employee_id to be NULLABLE.
        $db->exec("ALTER TABLE shifts MODIFY COLUMN employee_id INT NULL");
        echo "✅ Column 'employee_id' modified to allow NULL.<br>";
    } else {
        echo "ℹ️ Column 'is_unassigned' already exists.<br>";
    }

    echo "Migration completed successfully.";

} catch (PDOException $e) {
    die("❌ Error during migration: " . $e->getMessage());
}

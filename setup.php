<?php
/**
 * Setup Script — Run ONCE to create database and seed data
 * Access: http://localhost/APP-RRHH%20Schedule/setup.php
 */

// Step 1: Create database
try {
  $pdo = new PDO("mysql:host=localhost;charset=utf8mb4", "root", "", [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
  ]);
  $pdo->exec("CREATE DATABASE IF NOT EXISTS rrhh_schedule CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  $pdo->exec("USE rrhh_schedule");
  echo "<h2>✅ Database created</h2>";
} catch (PDOException $e) {
  die("<h2>❌ Database error: " . $e->getMessage() . "</h2>");
}

// Step 2: Create tables
$tables = "
CREATE TABLE IF NOT EXISTS shops (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#6366f1',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(255) DEFAULT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('manager','staff') NOT NULL DEFAULT 'staff',
  employee_id INT DEFAULT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(30) DEFAULT NULL,
  role VARCHAR(100) DEFAULT NULL,
  max_weekly_hours DECIMAL(5,2) NOT NULL DEFAULT 40.00,
  active TINYINT(1) NOT NULL DEFAULT 1,
  user_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS availability (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  day_of_week TINYINT NOT NULL COMMENT '0=Sunday, 1=Monday ... 6=Saturday',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  INDEX idx_avail_employee (employee_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS shifts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  shop_id INT NOT NULL,
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status ENUM('scheduled','completed','cancelled') NOT NULL DEFAULT 'scheduled',
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  INDEX idx_shift_employee_date (employee_id, shift_date),
  INDEX idx_shift_shop_date (shop_id, shift_date),
  INDEX idx_shift_date (shift_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS swap_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shift_id INT NOT NULL,
  target_shift_id INT DEFAULT NULL,
  requester_id INT NOT NULL,
  accepter_id INT DEFAULT NULL,
  claimer_id INT DEFAULT NULL,
  status ENUM('pending','accepted','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  message TEXT DEFAULT NULL,
  manager_note TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
  FOREIGN KEY (target_shift_id) REFERENCES shifts(id) ON DELETE SET NULL,
  FOREIGN KEY (requester_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (accepter_id) REFERENCES employees(id) ON DELETE SET NULL,
  INDEX idx_swap_status (status)
) ENGINE=InnoDB;
";

// Execute each statement
foreach (explode(';', $tables) as $statement) {
  $statement = trim($statement);
  if (!empty($statement)) {
    $pdo->exec($statement);
  }
}
echo "<h2>✅ Tables created</h2>";

// Step 3: Seed shops (only if empty)
$shopCount = $pdo->query("SELECT COUNT(*) FROM shops")->fetchColumn();
if ($shopCount == 0) {
  $pdo->exec("INSERT INTO shops (name, color) VALUES
        ('ChinaTown',  '#6366f1'),
        ('Entrance',   '#f59e0b'),
        ('GlobesHats', '#10b981')
    ");
  echo "<h2>✅ 3 Shops seeded (ChinaTown, Entrance, GlobesHats)</h2>";
} else {
  echo "<h2>⏭️ Shops already exist, skipping</h2>";
}

// Step 4: Seed users (only if empty)
$userCount = $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
if ($userCount == 0) {
  // Manager
  $managerHash = password_hash('1234', PASSWORD_DEFAULT);
  $stmt = $pdo->prepare("INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'manager')");
  $stmt->execute(['manager', 'buchinisantiago@gmail.com', $managerHash]);

  // Staff 1-10
  $stmtStaff = $pdo->prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'staff')");
  for ($i = 1; $i <= 10; $i++) {
    $username = "staff$i";
    $hash = password_hash($username, PASSWORD_DEFAULT);
    $stmtStaff->execute([$username, $hash]);
  }
  echo "<h2>✅ 11 Users seeded (1 manager + 10 staff)</h2>";
} else {
  echo "<h2>⏭️ Users already exist, skipping</h2>";
}

echo "<br><h2>🎉 Setup complete!</h2>";
echo "<p><a href='/APP-RRHH%20Schedule/'>→ Go to App</a></p>";

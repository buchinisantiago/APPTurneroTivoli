-- ============================================
-- APP-RRHH Schedule — Database Setup
-- ============================================
-- Run this SQL in phpMyAdmin or MySQL CLI

CREATE DATABASE IF NOT EXISTS rrhh_schedule
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE rrhh_schedule;

-- ============================================
-- 1. SHOPS
-- ============================================
CREATE TABLE IF NOT EXISTS shops (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#6366f1',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO shops (name, color) VALUES
  ('ChinaTown',  '#6366f1'),
  ('Entrance',   '#f59e0b'),
  ('GlobesHats', '#10b981');

-- ============================================
-- 2. USERS (authentication)
-- ============================================
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

-- ============================================
-- 3. EMPLOYEES
-- ============================================
CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(30) DEFAULT NULL,
  role VARCHAR(100) DEFAULT NULL,
  max_weekly_hours DECIMAL(5,2) NOT NULL DEFAULT 40.00,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================
-- 4. AVAILABILITY (weekly schedule per employee)
-- ============================================
CREATE TABLE IF NOT EXISTS availability (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  day_of_week TINYINT NOT NULL COMMENT '0=Sunday, 1=Monday ... 6=Saturday',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  INDEX idx_avail_employee (employee_id),
  INDEX idx_avail_day (day_of_week)
) ENGINE=InnoDB;

-- ============================================
-- 5. SHIFTS
-- ============================================
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

-- ============================================
-- 6. SWAP REQUESTS
-- ============================================
CREATE TABLE IF NOT EXISTS swap_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shift_id INT NOT NULL COMMENT 'The shift the requester wants to swap',
  target_shift_id INT DEFAULT NULL COMMENT 'The shift offered in exchange (null = open request)',
  requester_id INT NOT NULL COMMENT 'Employee requesting the swap',
  accepter_id INT DEFAULT NULL COMMENT 'Employee who accepts',
  status ENUM('pending','accepted','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  message TEXT DEFAULT NULL,
  manager_note TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
  FOREIGN KEY (target_shift_id) REFERENCES shifts(id) ON DELETE SET NULL,
  FOREIGN KEY (requester_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (accepter_id) REFERENCES employees(id) ON DELETE SET NULL,
  INDEX idx_swap_status (status),
  INDEX idx_swap_requester (requester_id)
) ENGINE=InnoDB;

-- ============================================
-- 7. SEED: Manager + Staff users
-- ============================================
-- Manager account
INSERT INTO users (username, email, password_hash, role)
VALUES ('manager', 'buchinisantiago@gmail.com', '$2y$10$placeholder', 'manager');

-- Staff accounts (staff1 to staff10)
INSERT INTO users (username, password_hash, role) VALUES
  ('staff1',  '$2y$10$placeholder', 'staff'),
  ('staff2',  '$2y$10$placeholder', 'staff'),
  ('staff3',  '$2y$10$placeholder', 'staff'),
  ('staff4',  '$2y$10$placeholder', 'staff'),
  ('staff5',  '$2y$10$placeholder', 'staff'),
  ('staff6',  '$2y$10$placeholder', 'staff'),
  ('staff7',  '$2y$10$placeholder', 'staff'),
  ('staff8',  '$2y$10$placeholder', 'staff'),
  ('staff9',  '$2y$10$placeholder', 'staff'),
  ('staff10', '$2y$10$placeholder', 'staff');

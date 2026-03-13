<?php
/**
 * Stock API — Product catalog & daily stock entries
 */
session_start();
require_once __DIR__ . '/../db.php';
setCorsHeaders();

// Auth check
if (!isset($_SESSION['user_id'])) {
    jsonResponse(['error' => 'Not authenticated'], 401);
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$role = $_SESSION['role'] ?? 'staff';
$userId = $_SESSION['user_id'];

$db = getDB();

switch ($action) {

    // ═══════════════════════════════════════════
    // PRODUCTS — CRUD (manager) / Read (all)
    // ═══════════════════════════════════════════
    case 'products':
        if ($method === 'GET') {
            $shopId = $_GET['shop_id'] ?? null;
            $showInactive = $_GET['show_inactive'] ?? '0';

            $sql = "SELECT sp.*, s.name AS shop_name, s.color AS shop_color
                    FROM stock_products sp
                    JOIN shops s ON s.id = sp.shop_id";
            $params = [];

            $conditions = [];
            if ($shopId) {
                $conditions[] = "sp.shop_id = ?";
                $params[] = $shopId;
            }
            if ($showInactive !== '1') {
                $conditions[] = "sp.active = 1";
            }

            if ($conditions) {
                $sql .= " WHERE " . implode(' AND ', $conditions);
            }

            $sql .= " ORDER BY s.name, sp.name";

            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            jsonResponse($stmt->fetchAll());
        }

        if ($method === 'POST') {
            if ($role !== 'manager')
                jsonResponse(['error' => 'Manager access required'], 403);

            $data = getRequestBody();
            $shopId = $data['shop_id'] ?? null;
            $name = trim($data['name'] ?? '');
            $unit = trim($data['unit'] ?? 'units');
            $safetyStock = intval($data['safety_stock'] ?? 0);

            if (!$shopId || !$name) {
                jsonResponse(['error' => 'shop_id and name are required'], 400);
            }

            $stmt = $db->prepare("INSERT INTO stock_products (shop_id, name, unit, safety_stock) VALUES (?, ?, ?, ?)");
            $stmt->execute([$shopId, $name, $unit, $safetyStock]);

            $id = $db->lastInsertId();
            jsonResponse(['success' => true, 'id' => $id, 'message' => 'Product created']);
        }

        if ($method === 'PUT') {
            if ($role !== 'manager')
                jsonResponse(['error' => 'Manager access required'], 403);

            $data = getRequestBody();
            $id = $data['id'] ?? null;
            $name = trim($data['name'] ?? '');
            $unit = trim($data['unit'] ?? '');
            $safetyStock = isset($data['safety_stock']) ? intval($data['safety_stock']) : null;

            if (!$id)
                jsonResponse(['error' => 'Product id is required'], 400);

            $fields = [];
            $params = [];

            if ($name) {
                $fields[] = "name = ?";
                $params[] = $name;
            }
            if ($unit) {
                $fields[] = "unit = ?";
                $params[] = $unit;
            }
            if ($safetyStock !== null) {
                $fields[] = "safety_stock = ?";
                $params[] = $safetyStock;
            }

            if (empty($fields))
                jsonResponse(['error' => 'No fields to update'], 400);

            $params[] = $id;
            $sql = "UPDATE stock_products SET " . implode(', ', $fields) . " WHERE id = ?";
            $stmt = $db->prepare($sql);
            $stmt->execute($params);

            jsonResponse(['success' => true, 'message' => 'Product updated']);
        }

        if ($method === 'DELETE') {
            if ($role !== 'manager')
                jsonResponse(['error' => 'Manager access required'], 403);

            $id = $_GET['id'] ?? null;
            if (!$id)
                jsonResponse(['error' => 'Product id required'], 400);

            // Soft delete
            $stmt = $db->prepare("UPDATE stock_products SET active = 0 WHERE id = ?");
            $stmt->execute([$id]);

            jsonResponse(['success' => true, 'message' => 'Product deactivated']);
        }
        break;

    // ═══════════════════════════════════════════
    // ENTRIES — Daily stock counts
    // ═══════════════════════════════════════════
    case 'entries':
        if ($method === 'GET') {
            $shopId = $_GET['shop_id'] ?? null;
            $date = $_GET['date'] ?? date('Y-m-d');

            $sql = "SELECT se.*, sp.name AS product_name, sp.unit, sp.safety_stock,
                           sp.shop_id, u.username AS recorded_by_name
                    FROM stock_entries se
                    JOIN stock_products sp ON sp.id = se.stock_product_id
                    JOIN users u ON u.id = se.recorded_by
                    WHERE se.entry_date = ?";
            $params = [$date];

            if ($shopId) {
                $sql .= " AND sp.shop_id = ?";
                $params[] = $shopId;
            }

            $sql .= " ORDER BY sp.name";

            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            jsonResponse($stmt->fetchAll());
        }

        if ($method === 'POST') {
            $data = getRequestBody();
            $entries = $data['entries'] ?? [];
            $date = $data['date'] ?? date('Y-m-d');

            if (empty($entries)) {
                jsonResponse(['error' => 'No entries provided'], 400);
            }

            $db->beginTransaction();
            try {
                foreach ($entries as $entry) {
                    $productId = $entry['stock_product_id'] ?? null;
                    $quantity = intval($entry['quantity'] ?? 0);
                    $notes = trim($entry['notes'] ?? '');

                    if (!$productId)
                        continue;

                    if (isPostgres()) {
                        $sql = "INSERT INTO stock_entries (stock_product_id, quantity, entry_date, recorded_by, notes)
                                VALUES (?, ?, ?, ?, ?)
                                ON CONFLICT (stock_product_id, entry_date)
                                DO UPDATE SET quantity = EXCLUDED.quantity,
                                             recorded_by = EXCLUDED.recorded_by,
                                             notes = EXCLUDED.notes";
                    } else {
                        $sql = "INSERT INTO stock_entries (stock_product_id, quantity, entry_date, recorded_by, notes)
                                VALUES (?, ?, ?, ?, ?)
                                ON DUPLICATE KEY UPDATE quantity = VALUES(quantity),
                                                       recorded_by = VALUES(recorded_by),
                                                       notes = VALUES(notes)";
                    }

                    $stmt = $db->prepare($sql);
                    $stmt->execute([$productId, $quantity, $date, $userId, $notes]);
                }

                $db->commit();
                jsonResponse(['success' => true, 'message' => 'Stock entries saved']);
            } catch (Exception $e) {
                $db->rollBack();
                jsonResponse(['error' => 'Failed to save entries: ' . $e->getMessage()], 500);
            }
        }
        break;

    // ═══════════════════════════════════════════
    // ALERTS — Products below safety stock
    // ═══════════════════════════════════════════
    case 'alerts':
        if ($method === 'GET') {
            // Get the latest entry for each active product, find those below safety stock
            $today = date('Y-m-d');

            $sql = "SELECT sp.id, sp.name, sp.unit, sp.safety_stock, sp.shop_id,
                           s.name AS shop_name, s.color AS shop_color,
                           se.quantity AS last_quantity, se.entry_date AS last_date
                    FROM stock_products sp
                    JOIN shops s ON s.id = sp.shop_id
                    LEFT JOIN stock_entries se ON se.stock_product_id = sp.id
                        AND se.entry_date = (
                            SELECT MAX(se2.entry_date)
                            FROM stock_entries se2
                            WHERE se2.stock_product_id = sp.id
                        )
                    WHERE sp.active = 1
                      AND sp.safety_stock > 0
                      AND (se.quantity IS NULL OR se.quantity < sp.safety_stock)
                    ORDER BY s.name, sp.name";

            $stmt = $db->prepare($sql);
            $stmt->execute();
            $alerts = $stmt->fetchAll();

            jsonResponse(['alerts' => $alerts, 'count' => count($alerts)]);
        }
        break;

    // ═══════════════════════════════════════════
    // HISTORY — Recent entries for a product
    // ═══════════════════════════════════════════
    case 'history':
        if ($method === 'GET') {
            $productId = $_GET['product_id'] ?? null;
            if (!$productId)
                jsonResponse(['error' => 'product_id required'], 400);

            $limit = intval($_GET['limit'] ?? 14);
            $sql = "SELECT se.*, u.username AS recorded_by_name
                    FROM stock_entries se
                    JOIN users u ON u.id = se.recorded_by
                    WHERE se.stock_product_id = ?
                    ORDER BY se.entry_date DESC
                    LIMIT $limit";

            $stmt = $db->prepare($sql);
            $stmt->execute([$productId]);
            jsonResponse($stmt->fetchAll());
        }
        break;

    // ═══════════════════════════════════════════
    // REACTIVATE — Bring back a deactivated product
    // ═══════════════════════════════════════════
    case 'reactivate':
        if ($method === 'POST') {
            if ($role !== 'manager')
                jsonResponse(['error' => 'Manager access required'], 403);
            $data = getRequestBody();
            $id = $data['id'] ?? null;
            if (!$id)
                jsonResponse(['error' => 'Product id required'], 400);

            $stmt = $db->prepare("UPDATE stock_products SET active = 1 WHERE id = ?");
            $stmt->execute([$id]);
            jsonResponse(['success' => true, 'message' => 'Product reactivated']);
        }
        break;

    default:
        jsonResponse(['error' => 'Invalid action. Use: products, entries, alerts, history, reactivate'], 400);
}

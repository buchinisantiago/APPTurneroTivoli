<?php
/**
 * Release Requests API — Release / Claim / Approve shift releases
 * 
 * Flow:
 *   1. Employee "releases" a shift (status: released)
 *   2. Another employee "claims" it (status: claimed)
 *   3. Manager "approves" → shift transferred to claimer
 *      Manager "rejects" → shift stays with original owner
 *   4. If nobody claims before the shift date, original owner keeps it
 */
session_start();
require_once __DIR__ . '/../db.php';
setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$db = getDB();

switch ($method) {
    // ─── LIST RELEASE REQUESTS ───
    case 'GET':
        $status = $_GET['status'] ?? null;
        $employeeId = $_GET['employee_id'] ?? null;

        $where = ['1=1'];
        $params = [];

        if ($status) {
            $where[] = "sr.status = ?";
            $params[] = $status;
        }
        if ($employeeId) {
            $where[] = "(sr.requester_id = ? OR sr.claimer_id = ?)";
            $params[] = $employeeId;
            $params[] = $employeeId;
        }

        $whereClause = implode(' AND ', $where);
        $sql = "SELECT sr.*,
                    req.name as requester_name,
                    cl.name as claimer_name,
                    s1.shift_date as shift_date,
                    s1.start_time as shift_start,
                    s1.end_time as shift_end,
                    s1.employee_id as current_employee_id,
                    sh1.name as shift_shop,
                    sh1.color as shift_shop_color
                FROM swap_requests sr
                JOIN employees req ON req.id = sr.requester_id
                LEFT JOIN employees cl ON cl.id = sr.claimer_id
                JOIN shifts s1 ON s1.id = sr.shift_id
                JOIN shops sh1 ON sh1.id = s1.shop_id
                WHERE $whereClause
                ORDER BY sr.created_at DESC";

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $results = $stmt->fetchAll();

        // Map old column names for compatibility
        foreach ($results as &$r) {
            $r['accepter_name'] = $r['claimer_name'];
            $r['accepter_id'] = $r['claimer_id'];
        }

        jsonResponse($results);
        break;

    // ─── RELEASE A SHIFT ───
    case 'POST':
        $data = getRequestBody();
        $shiftId = intval($data['shift_id'] ?? 0);
        $requesterId = intval($data['requester_id'] ?? 0);
        $message = trim($data['message'] ?? '');

        if (!$shiftId || !$requesterId) {
            jsonResponse(['error' => 'shift_id and requester_id are required'], 400);
        }

        // Verify the shift belongs to the requester
        $check = $db->prepare("SELECT id FROM shifts WHERE id = ? AND employee_id = ? AND status = 'scheduled'");
        $check->execute([$shiftId, $requesterId]);
        if (!$check->fetch()) {
            jsonResponse(['error' => 'Shift not found or does not belong to you'], 400);
        }

        // Check no pending release exists for this shift
        $existing = $db->prepare("SELECT id FROM swap_requests WHERE shift_id = ? AND status IN ('pending','accepted')");
        $existing->execute([$shiftId]);
        if ($existing->fetch()) {
            jsonResponse(['error' => 'This shift has already been released'], 409);
        }

        $stmt = $db->prepare("INSERT INTO swap_requests (shift_id, requester_id, message) VALUES (?, ?, ?)");
        $stmt->execute([$shiftId, $requesterId, $message]);

        jsonResponse(['success' => true, 'id' => $db->lastInsertId(), 'message' => 'Shift released — waiting for someone to claim it'], 201);
        break;

    // ─── UPDATE RELEASE REQUEST (claim / approve / reject / cancel) ───
    case 'PUT':
        $data = getRequestBody();
        $id = $data['id'] ?? $_GET['id'] ?? null;
        $action = $data['action'] ?? '';

        if (!$id || !$action) {
            jsonResponse(['error' => 'id and action (accept/approve/reject/cancel) are required'], 400);
        }

        // Get current request
        $stmt = $db->prepare("SELECT * FROM swap_requests WHERE id = ?");
        $stmt->execute([$id]);
        $request = $stmt->fetch();
        if (!$request)
            jsonResponse(['error' => 'Release request not found'], 404);

        switch ($action) {
            case 'accept': // "claim" the released shift
                if ($request['status'] !== 'pending') {
                    jsonResponse(['error' => 'Can only claim released shifts that are pending'], 400);
                }
                $claimerId = intval($data['accepter_id'] ?? $data['claimer_id'] ?? 0);

                if (!$claimerId) {
                    jsonResponse(['error' => 'claimer_id is required'], 400);
                }

                // Make sure the claimer is not the same as the releaser
                if ($claimerId == $request['requester_id']) {
                    jsonResponse(['error' => 'You cannot claim your own released shift'], 400);
                }

                // No target_shift_id needed — just record who claims it
                $db->prepare("UPDATE swap_requests SET status = 'accepted', accepter_id = ?, claimer_id = ? WHERE id = ?")
                    ->execute([$claimerId, $claimerId, $id]);

                jsonResponse(['success' => true, 'message' => 'Shift claimed! Waiting for manager approval']);
                break;

            case 'approve':
                // Manager approves — transfer the shift to the claimer
                if ($request['status'] !== 'accepted') {
                    jsonResponse(['error' => 'Can only approve claimed releases'], 400);
                }

                $claimerId = $request['claimer_id'] ?? $request['accepter_id'];

                $db->beginTransaction();
                try {
                    // Transfer the shift to the claimer
                    $db->prepare("UPDATE shifts SET employee_id = ? WHERE id = ?")
                        ->execute([$claimerId, $request['shift_id']]);

                    // Update release request
                    $managerNote = trim($data['manager_note'] ?? '');
                    $db->prepare("UPDATE swap_requests SET status = 'approved', manager_note = ? WHERE id = ?")
                        ->execute([$managerNote, $id]);

                    $db->commit();
                    jsonResponse(['success' => true, 'message' => 'Release approved — shift transferred']);
                } catch (Exception $e) {
                    $db->rollBack();
                    jsonResponse(['error' => 'Approval failed: ' . $e->getMessage()], 500);
                }
                break;

            case 'reject':
                $managerNote = trim($data['manager_note'] ?? '');
                $db->prepare("UPDATE swap_requests SET status = 'rejected', manager_note = ? WHERE id = ?")
                    ->execute([$managerNote, $id]);
                jsonResponse(['success' => true, 'message' => 'Release rejected — original owner keeps the shift']);
                break;

            case 'cancel':
                if (!in_array($request['status'], ['pending', 'accepted'])) {
                    jsonResponse(['error' => 'Can only cancel pending or claimed releases'], 400);
                }
                $db->prepare("UPDATE swap_requests SET status = 'cancelled' WHERE id = ?")
                    ->execute([$id]);
                jsonResponse(['success' => true, 'message' => 'Release cancelled']);
                break;

            default:
                jsonResponse(['error' => 'Invalid action'], 400);
        }
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}

<?php
// up/api.php
require_once 'config.php';

// ENABLE DEBUGGING
if (defined('APP_DEBUG') && APP_DEBUG) {
    ini_set('display_errors', 1);
    ini_set('display_startup_errors', 1);
    error_reporting(E_ALL);
} else {
    ini_set('display_errors', 0);
    ini_set('display_startup_errors', 0);
    error_reporting(0);
}

// Start output buffering
ob_start();

header('Content-Type: application/json');

function jsonResponse($success, $message, $data = [])
{
    ob_clean();
    echo json_encode(['success' => $success, 'message' => $message, 'data' => $data]);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$action = $_POST['action'] ?? $_GET['action'] ?? $input['action'] ?? '';

try {
    switch ($action) {
        case 'save_clipboard':
            $text = $input['text'] ?? '';
            if (trim($text) === '')
                jsonResponse(false, 'Empty text');

            $filename = date('Y-m-d\THHis') . '.txt';
            if (file_put_contents(CLIPBOARD_DIR . $filename, $text)) {
                jsonResponse(true, 'Saved to clipboard history', ['filename' => $filename, 'time' => time()]);
            } else {
                jsonResponse(false, 'Failed to save clipboard');
            }
            break;

        case 'upload_file':
            if (!isset($_FILES['file']))
                jsonResponse(false, 'No file uploaded');

            $file = $_FILES['file'];
            // Sanitize filename
            $name = basename($file['name']);
            $targetPath = UPLOAD_DIR . $name;

            if (move_uploaded_file($file['tmp_name'], $targetPath)) {
                jsonResponse(true, 'File uploaded successfully', ['name' => $name, 'time' => time()]);
            } else {
                jsonResponse(false, 'Upload failed');
            }
            break;

        case 'check_status':
            jsonResponse(true, 'Anonymous API is active', ['loggedIn' => true]); // Pretend logged in for UI consistency if needed
            break;

        default:
            jsonResponse(false, 'Invalid action or unauthorized');
    }

} catch (Exception $e) {
    jsonResponse(false, 'API Error: ' . $e->getMessage());
} catch (Error $e) {
    jsonResponse(false, 'Fatal Error: ' . $e->getMessage());
}
?>
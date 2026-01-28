<?php
// config.php
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
ini_set('log_errors', 1); // Always log to file for security/audit

// Start output buffering to capture any unwanted output
ob_start();

// Check for manual installation (since Composer is not available)
if (file_exists(__DIR__ . '/lib/lbuchs/WebAuthn/WebAuthn.php')) {
    require_once __DIR__ . '/lib/lbuchs/WebAuthn/WebAuthn.php';
} else {
    // Fallback error
    ob_clean(); // Clean buffer
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'WebAuthn library missing. See lib/HOW_TO_INSTALL.txt']);
    exit;
}

use lbuchs\WebAuthn\WebAuthn;
use lbuchs\WebAuthn\WebAuthnException;

// Set session duration to 6 months
$sessionDuration = 15552000;
ini_set('session.gc_maxlifetime', $sessionDuration);
session_set_cookie_params($sessionDuration);

session_start();
header('Content-Type: application/json');

function jsonResponse($success, $message, $data = [])
{
    ob_clean(); // Discard any previous output (warnings, etc)
    echo json_encode(['success' => $success, 'message' => $message, 'data' => $data]);
    exit;
}

// Simple JSON file based user storage
function getUsers()
{
    if (!file_exists(USERS_FILE))
        return [];
    return json_decode(file_get_contents(USERS_FILE), true);
}

function saveUser($user)
{
    if (defined('APP_DEBUG') && APP_DEBUG) {
        error_log("DEBUG: Saving user " . print_r($user, true));
    }
    $users = getUsers();
    $users[] = $user;
    file_put_contents(USERS_FILE, json_encode($users, JSON_PRETTY_PRINT));
}

function findUserById($id)
{
    $users = getUsers();
    foreach ($users as $u) {
        if ($u['id'] === $id)
            return $u;
    }
    return null;
}

// Initialize WebAuthn
try {
    // $useBase64UrlEncoding = true (4th argument)
    $webAuthn = new WebAuthn(WEBAUTHN_NAME, WEBAUTHN_ID, null, true);
} catch (Exception $e) { // Catch ANY exception including WebAuthnException
    jsonResponse(false, 'WebAuthn Init Error: ' . $e->getMessage());
}

$input = json_decode(file_get_contents('php://input'), true);
$action = $_POST['action'] ?? $_GET['action'] ?? $input['action'] ?? '';

try {
    // --- Unauthenticated Actions (Login/Register Flow) ---

    if ($action === 'check_status') {
        $users = getUsers();

        // Debug checks
        $checks = [
            'php_version' => phpversion(),
            'openssl' => extension_loaded('openssl'),
            'json' => extension_loaded('json'),
            'data_dir_writable' => is_writable(DATA_DIR),
            'users_file_exists' => file_exists(USERS_FILE),
            'users_file_writable' => is_writable(USERS_FILE),
            'library_loaded' => class_exists('lbuchs\WebAuthn\WebAuthn'),
            'session_id' => session_id()
        ];

        jsonResponse(true, 'Status', [
            'loggedIn' => !empty($_SESSION['logged_in']) || (defined('APP_DEMO') && APP_DEMO),
            'hasUsers' => count($users) > 0,
            'debug' => (defined('APP_DEBUG') && APP_DEBUG) ? $checks : null,
            'appDebug' => (defined('APP_DEBUG') && APP_DEBUG),
            'appDemo' => (defined('APP_DEMO') && APP_DEMO)
        ]);
    }

    if ($action === 'register_challenge') {
        // Only allow registration if logged in OR if no users exist (Bootstrap)
        $users = getUsers();
        if (count($users) > 0 && empty($_SESSION['logged_in'])) {
            jsonResponse(false, 'Unauthorized. Login to register new devices.');
        }

        $userName = 'User ' . (count($users) + 1);
        $userId = bin2hex(random_bytes(16));

        // Get create args (challenge)
        // requireResidentKey: 'discouraged', userVerification: 'required'
        // Arguments: $userId, $userName, $userDisplayName, $timeout, $requireResidentKey, $requireUserVerification
        $args = $webAuthn->getCreateArgs($userId, $userName, $userName, 20, 'discouraged', 'required');

        $_SESSION['challenge'] = $webAuthn->getChallenge();
        $_SESSION['img_register_user_id'] = $userId;
        $_SESSION['img_register_user_name'] = $userName;

        jsonResponse(true, 'Challenge created', $args);
    }

    if ($action === 'register_verify') {
        $clientDataJSON = base64_decode($input['clientDataJSON']);
        $attestationObject = base64_decode($input['attestationObject']);
        $challenge = $_SESSION['challenge'];

        try {
            // processCreate args: $clientDataJSON, $attestationObject, $challenge, $requireUserVerification, ...
            // We requested 'required' UV, so we pass true here to enforce it.
            $data = $webAuthn->processCreate($clientDataJSON, $attestationObject, $challenge, true);

            $user = [
                'id' => $_SESSION['img_register_user_id'],
                'name' => $_SESSION['img_register_user_name'],
                'credentialId' => base64_encode($data->credentialId),
                'credentialPublicKey' => base64_encode($data->credentialPublicKey)
            ];

            saveUser($user);
            $_SESSION['logged_in'] = true;

            jsonResponse(true, 'Registration successful');
        } catch (WebAuthnException $e) {
            jsonResponse(false, $e->getMessage());
        }
    }

    if ($action === 'login_challenge') {
        $users = getUsers();
        $credentialIds = array_map(function ($u) {
            return base64_decode($u['credentialId']);
        }, $users);

        if (empty($credentialIds)) {
            jsonResponse(false, 'No users registered');
        }

        // getGetArgs args: $credentialIds, $timeout, $allowUsb, $allowNfc, $allowBle, $allowHybrid, $allowInternal, $requireUserVerification
        $args = $webAuthn->getGetArgs($credentialIds, 120, true, true, true, true, true, 'required');
        $_SESSION['challenge'] = $webAuthn->getChallenge();

        jsonResponse(true, 'Login challenge', $args);
    }

    if ($action === 'login_verify') {
        $clientDataJSON = base64_decode($input['clientDataJSON']);
        $authenticatorData = base64_decode($input['authenticatorData']);
        $signature = base64_decode($input['signature']);
        $userHandle = base64_decode($input['userHandle']);
        $id = base64_decode($input['id']);
        $challenge = $_SESSION['challenge'];

        // Find credential public key from our users
        $users = getUsers();
        $credentialPublicKey = null;
        $credentialBinaryId = base64_decode($input['id']);

        foreach ($users as $u) {
            if (base64_decode($u['credentialId']) === $credentialBinaryId) {
                $credentialPublicKey = base64_decode($u['credentialPublicKey']);
                break;
            }
        }

        if (!$credentialPublicKey) {
            jsonResponse(false, 'User not found');
        }

        try {
            $webAuthn->processGet($clientDataJSON, $authenticatorData, $signature, $credentialPublicKey, $challenge);
            $_SESSION['logged_in'] = true;
            jsonResponse(true, 'Login successful');
        } catch (WebAuthnException $e) {
            jsonResponse(false, 'Login failed: ' . $e->getMessage());
        }
    }


    // --- Authenticated Actions ---

    $isLoggedIn = !empty($_SESSION['logged_in']);
    $isDemo = (defined('APP_DEMO') && APP_DEMO);

    if (!$isLoggedIn && !$isDemo) {
        jsonResponse(false, 'Unauthorized');
    }

    switch ($action) {
        case 'save_clipboard':
            $text = $input['text'] ?? '';
            if (trim($text) === '')
                jsonResponse(false, 'Empty text');

            $filename = date('Y-m-d\THHis') . '.txt';
            file_put_contents(CLIPBOARD_DIR . $filename, $text);
            jsonResponse(true, 'Saved to clipboard history');
            break;

        case 'get_history':
            $files = glob(CLIPBOARD_DIR . '*.txt');
            $history = [];
            foreach ($files as $file) {
                $history[] = [
                    'filename' => basename($file),
                    'content' => file_get_contents($file),
                    'time' => filemtime($file)
                ];
            }
            usort($history, function ($a, $b) {
                return $b['time'] - $a['time'];
            });

            $current = $history[0]['content'] ?? '';

            jsonResponse(true, 'History retrieved', ['history' => $history, 'current' => $current]);
            break;

        case 'upload_file':
            if (!isset($_FILES['file']))
                jsonResponse(false, 'No file uploaded');

            $file = $_FILES['file'];
            $targetPath = UPLOAD_DIR . basename($file['name']);

            if (move_uploaded_file($file['tmp_name'], $targetPath)) {
                jsonResponse(true, 'File uploaded successfully');
            } else {
                jsonResponse(false, 'Upload failed');
            }
            break;

        case 'get_files':
            $files = glob(UPLOAD_DIR . '*');
            $fileList = [];
            foreach ($files as $file) {
                if (is_file($file)) {
                    $name = basename($file);
                    $size = filesize($file);
                    $dimensions = null;
                    $serialNumber = null;
                    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
                    $imgExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'];

                    if (in_array($ext, $imgExts)) {
                        $imgData = @getimagesize($file);
                        if ($imgData) {
                            $dimensions = ['width' => $imgData[0], 'height' => $imgData[1]];
                        }
                    } elseif ($ext === 'csv') {
                        $content = file_get_contents($file);

                        // Handle UTF-16LE encoding often used in Windows-generated CSVs
                        if (str_starts_with($content, "\xFF\xFE")) {
                            $content = mb_convert_encoding($content, 'UTF-8', 'UTF-16LE');
                        }

                        // Strip BOM if present
                        $content = preg_replace('/^\xEF\xBB\xBF/', '', $content);

                        // Split into lines
                        $lines = explode("\n", str_replace("\r", "", $content));
                        if (count($lines) >= 2) {
                            // Try to detect delimiter
                            $delimiters = [",", ";", "\t"];
                            foreach ($delimiters as $delim) {
                                $header = str_getcsv($lines[0], $delim);
                                if ($header && isset($header[0]) && trim($header[0], "\" ") === "Device Serial Number") {
                                    $firstRow = str_getcsv($lines[1], $delim);
                                    if ($firstRow && isset($firstRow[0])) {
                                        $serialNumber = trim($firstRow[0], "\" ");
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    $fileList[] = [
                        'name' => $name,
                        'size' => $size,
                        'dimensions' => $dimensions,
                        'serialNumber' => $serialNumber,
                        'time' => filemtime($file),
                        'url' => 'api.php?action=serve_file&name=' . urlencode($name)
                    ];
                }
            }
            usort($fileList, function ($a, $b) {
                return $b['time'] - $a['time'];
            });
            jsonResponse(true, 'Files retrieved', ['files' => $fileList]);
            break;

        case 'hide_item':
            $type = $input['type'] ?? '';
            $name = $input['name'] ?? '';

            if (!$name || strpos($name, '/') !== false || strpos($name, '\\') !== false) {
                jsonResponse(false, 'Invalid filename');
            }

            $dir = '';
            if ($type === 'clipboard') {
                $dir = CLIPBOARD_DIR;
            } elseif ($type === 'file') {
                $dir = UPLOAD_DIR;
            } else {
                jsonResponse(false, 'Invalid type');
            }

            $source = $dir . $name;
            // Prevent hiding already hidden files or non-existent files
            if (!file_exists($source) || strpos($name, '.') === 0) {
                jsonResponse(false, 'File not found or invalid');
            }

            $target = $dir . '.' . $name;
            if (rename($source, $target)) {
                jsonResponse(true, 'Item hidden');
            } else {
                jsonResponse(false, 'Failed to hide item');
            }
            break;

        case 'serve_file':
            $name = $_GET['name'] ?? '';
            if (!$name || strpos($name, '/') !== false || strpos($name, '\\') !== false) {
                header("HTTP/1.1 400 Bad Request");
                exit;
            }

            $path = UPLOAD_DIR . $name;
            if (!file_exists($path)) {
                header("HTTP/1.1 404 Not Found");
                exit;
            }

            $mime = mime_content_type($path);
            header("Content-Type: " . $mime);
            header("Content-Length: " . filesize($path));
            // Cache control for performance
            header("Cache-Control: private, max-age=604800");

            readfile($path);
            exit;

        case 'logout':
            session_destroy();
            jsonResponse(true, 'Logged out');
            break;

        default:
            jsonResponse(false, 'Invalid action');
    }

} catch (Exception $e) {
    jsonResponse(false, 'API Error: ' . $e->getMessage());
} catch (Error $e) {
    jsonResponse(false, 'Fatal Error: ' . $e->getMessage());
}
?>
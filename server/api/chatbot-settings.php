<?php
require_once __DIR__ . '/_lib/auth.php';
require_once __DIR__ . '/_lib/chatbot-settings.php';
funbikeBootstrapApi();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if (!in_array($method, ['GET', 'PUT', 'POST'], true)) funbikeJsonResponse(405, ['error' => 'Méthode non autorisée.']);
funbikeProtectWriteMethods($method);
funbikeRequireAdmin();
$dir = dirname(__DIR__) . '/storage/private';
if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) funbikeJsonResponse(500, ['error' => 'Stockage privé indisponible.']);
$lock = @fopen($dir . '/chatbot-settings.lock', 'c');
if (!$lock || !flock($lock, $method === 'GET' ? LOCK_SH : LOCK_EX)) funbikeJsonResponse(500, ['error' => 'Réglage indisponible.']);
register_shutdown_function(function () use ($lock) { flock($lock, LOCK_UN); fclose($lock); });
$current = funbikeChatbotRead();
if ($current === null) funbikeJsonResponse(500, ['error' => 'Réglage du chatbot invalide. Restaurez une sauvegarde.']);
$revision = funbikeChatbotRevision($current);
if ($method === 'GET') funbikeJsonResponse(200, ['data' => $current, 'revision' => $revision]);
if ($method === 'POST' && empty($_POST) && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) funbikeJsonResponse(413, ['error' => 'Envoi trop volumineux ou impossible. Vérifiez la limite du serveur.']);
$body = $method === 'POST' ? $_POST : funbikeReadJsonBody();
if (!is_string($body['revision'] ?? null) || !hash_equals($revision, $body['revision'])) funbikeJsonResponse(409, ['error' => 'Le réglage a changé. Rechargez avant de réenregistrer.']);
$data = $current;
if ($method === 'PUT') {
    if (array_key_exists('enabled', $body)) {
        if (!is_bool($body['enabled'])) funbikeJsonResponse(400, ['error' => 'État du chatbot invalide.']);
        $data['enabled'] = $body['enabled'];
    }
    if (array_key_exists('name', $body)) {
        $name = is_string($body['name']) ? trim($body['name']) : null;
        if (!funbikeChatbotValidName($name)) funbikeJsonResponse(400, ['error' => 'Nom invalide : 1 à 40 caractères, sans caractères de contrôle ni <, > ou *.']);
        $data['name'] = $name;
    }
    if (array_key_exists('resetLogo', $body)) {
        if ($body['resetLogo'] !== true) funbikeJsonResponse(400, ['error' => 'Demande de logo invalide.']);
        $data['logo'] = null;
    }
    if (!array_key_exists('enabled', $body) && !array_key_exists('name', $body) && !array_key_exists('resetLogo', $body)) funbikeJsonResponse(400, ['error' => 'Aucun réglage à enregistrer.']);
} else {
    $image = $_FILES['logo'] ?? null;
    if (!is_array($image) || ($image['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($image['tmp_name'] ?? '') || ($image['size'] ?? 0) < 1 || $image['size'] > 2 * 1024 * 1024) funbikeJsonResponse(400, ['error' => 'Choisissez une image valide de 2 Mo maximum.']);
    $info = @getimagesize($image['tmp_name']);
    $mime = function_exists('mime_content_type') ? @mime_content_type($image['tmp_name']) : '';
    $types = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!is_array($info) || !isset($types[$mime]) || ($info['mime'] ?? '') !== $mime || $info[0] < 1 || $info[1] < 1 || $info[0] * $info[1] > 12000000) funbikeJsonResponse(400, ['error' => 'Image invalide : JPEG, PNG ou WebP de 12 millions de pixels maximum.']);
    $uploadDir = dirname(__DIR__) . '/uploads/chatbot';
    if (is_link($uploadDir)) funbikeJsonResponse(500, ['error' => 'Dossier des logos invalide.']);
    if (!is_dir($uploadDir) && !@mkdir($uploadDir, 0755, true) && !is_dir($uploadDir)) funbikeJsonResponse(500, ['error' => 'Dossier des logos indisponible.']);
    do { $filename = 'logo-' . bin2hex(random_bytes(16)) . '.' . $types[$mime]; $path = $uploadDir . '/' . $filename; } while (file_exists($path) || is_link($path));
    if (!move_uploaded_file($image['tmp_name'], $path)) funbikeJsonResponse(500, ['error' => 'Impossible d’enregistrer le logo.']);
    // Les anciens fichiers restent disponibles pour sauvegarde, restauration et caches.
    $data['logo'] = '/server/uploads/chatbot/' . $filename;
}
$file = dirname(__DIR__) . '/storage/data/chatbot-settings.json';
if (!funbikeAtomicWrite($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))) funbikeJsonResponse(500, ['error' => 'Impossible d’enregistrer le réglage.']);
funbikeJsonResponse(200, ['data' => $data, 'revision' => funbikeChatbotRevision($data)]);

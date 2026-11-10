<?php
require_once __DIR__ . '/_lib/auth.php';
require_once __DIR__ . '/_lib/chatbot-settings.php';
funbikeBootstrapApi();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if (!in_array($method, ['GET', 'DELETE'], true)) funbikeJsonResponse(405, ['error' => 'Méthode non autorisée.']);
funbikeProtectWriteMethods($method);
funbikeRequireAdmin();

// Le même verrou que chatbot-settings.php protège le logo actif et les fichiers
// contre une suppression pendant une modification des réglages.
$privateDir = dirname(__DIR__) . '/storage/private';
if (!is_dir($privateDir) && !@mkdir($privateDir, 0750, true) && !is_dir($privateDir)) funbikeJsonResponse(500, ['error' => 'Stockage privé indisponible.']);
$lock = @fopen($privateDir . '/chatbot-settings.lock', 'c');
if (!$lock || !flock($lock, $method === 'GET' ? LOCK_SH : LOCK_EX)) funbikeJsonResponse(500, ['error' => 'Bibliothèque indisponible.']);
register_shutdown_function(function () use ($lock) { flock($lock, LOCK_UN); fclose($lock); });
$current = funbikeChatbotRead();
if ($current === null) funbikeJsonResponse(500, ['error' => 'Réglage du chatbot invalide. Restaurez une sauvegarde.']);
$uploadDir = dirname(__DIR__) . '/uploads/chatbot';
if (is_link($uploadDir) || (file_exists($uploadDir) && !is_dir($uploadDir))) funbikeJsonResponse(500, ['error' => 'Dossier des logos invalide.']);

if ($method === 'DELETE') {
    $body = funbikeReadJsonBody();
    $url = $body['url'] ?? null;
    if (!is_string($url) || !funbikeChatbotValidLogo($url)) funbikeJsonResponse(400, ['error' => 'Logo invalide.']);
    if ($url === $current['logo']) funbikeJsonResponse(409, ['error' => 'Ce logo est actuellement utilisé. Choisissez un autre logo avant de le supprimer.']);
    $path = $uploadDir . '/' . basename($url);
    if (is_link($path) || !is_file($path)) funbikeJsonResponse(404, ['error' => 'Logo introuvable ou non supprimable.']);
    if (!@unlink($path)) funbikeJsonResponse(500, ['error' => 'Impossible de supprimer ce logo.']);
}
$logos = [];
if (is_dir($uploadDir)) {
    $files = @scandir($uploadDir);
    if ($files === false) funbikeJsonResponse(500, ['error' => 'Impossible de lire les logos.']);
    foreach ($files as $filename) {
        $url = '/server/uploads/chatbot/' . $filename;
        $path = $uploadDir . '/' . $filename;
        if (funbikeChatbotValidLogo($url) && !is_link($path) && is_file($path)) $logos[] = $url;
    }
}
funbikeJsonResponse(200, ['logos' => $logos, 'current' => $current['logo']]);

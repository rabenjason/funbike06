<?php
// Images du bandeau Sherco : gestion réservée aux administrateurs.
require_once __DIR__ . '/_lib/auth.php';
require_once __DIR__ . '/_lib/sherco-banner.php';
funbikeBootstrapApi();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
funbikeProtectWriteMethods($method);
if (!in_array($method, ['GET', 'POST', 'PUT', 'DELETE'], true)) funbikeJsonResponse(405, ['error' => 'Méthode non autorisée.']);
if ($method === 'GET') funbikeRequireAdmin();
$data = funbikeShercoBannerRead();
if ($method === 'GET') funbikeJsonResponse(200, ['data' => $data ?? ['images' => [], 'selected' => null], 'legacy' => $data === null]);
$data = $data ?? ['images' => [], 'selected' => null];
if ($method === 'POST') {
    if (count($data['images']) >= 40) funbikeJsonResponse(400, ['error' => 'La bibliothèque est limitée à 40 images.']);
    $image = $_FILES['image'] ?? null;
    if (!is_array($image) || ($image['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($image['tmp_name'] ?? '') || ($image['size'] ?? 0) < 1 || $image['size'] > 8 * 1024 * 1024) {
        funbikeJsonResponse(400, ['error' => 'Choisissez une image valide de 8 Mo maximum.']);
    }
    $info = @getimagesize($image['tmp_name']);
    $mime = function_exists('mime_content_type') ? @mime_content_type($image['tmp_name']) : '';
    $types = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!is_array($info) || !isset($types[$mime]) || ($info['mime'] ?? '') !== $mime || $info[0] < 1 || $info[1] < 1 || $info[0] * $info[1] > 30000000) {
        funbikeJsonResponse(400, ['error' => 'Image invalide. Utilisez un JPEG, PNG ou WebP de 30 millions de pixels maximum.']);
    }
    $dir = dirname(__DIR__) . '/uploads/homepage';
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) funbikeJsonResponse(500, ['error' => 'Dossier des images indisponible.']);
    $id = bin2hex(random_bytes(16));
    $filename = 'sherco-' . $id . '.' . $types[$mime];
    $path = $dir . '/' . $filename;
    if (!move_uploaded_file($image['tmp_name'], $path)) funbikeJsonResponse(500, ['error' => 'Impossible d’enregistrer l’image.']);
    $data['images'][] = ['id' => $id, 'url' => '/server/uploads/homepage/' . $filename];
    if ($data['selected'] === null) $data['selected'] = $id;
    // En cas d'échec de la sauvegarde, l'image précédente reste sélectionnée.
    // Le fichier orphelin est conservé pour une récupération après sauvegarde.
    funbikeShercoBannerWrite($data);
    funbikeJsonResponse(201, ['data' => $data]);
}
$body = funbikeReadJsonBody();
$id = $body['id'] ?? null;
if (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/D', $id)) funbikeJsonResponse(400, ['error' => 'Identifiant d’image invalide.']);
$index = null;
foreach ($data['images'] as $i => $image) if ($image['id'] === $id) { $index = $i; break; }
if ($index === null) funbikeJsonResponse(404, ['error' => 'Image introuvable. Rechargez la bibliothèque.']);
if ($method === 'PUT') {
    $data['selected'] = $id;
    funbikeShercoBannerWrite($data);
    funbikeJsonResponse(200, ['data' => $data]);
}
// Supprimer la référence seulement après confirmation côté client. Conserver
// le fichier physique pour permettre une restauration après sauvegarde.
array_splice($data['images'], $index, 1);
if ($data['selected'] === $id) $data['selected'] = null;
funbikeShercoBannerWrite($data);
funbikeJsonResponse(200, ['data' => $data]);

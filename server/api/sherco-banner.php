<?php
// Images du bandeau Sherco : gestion réservée aux administrateurs.
require_once __DIR__ . '/_lib/auth.php';
require_once __DIR__ . '/_lib/sherco-banner.php';
funbikeBootstrapApi();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
funbikeProtectWriteMethods($method);
if (!in_array($method, ['GET', 'POST', 'PUT', 'DELETE'], true)) funbikeJsonResponse(405, ['error' => 'Méthode non autorisée.']);
if ($method === 'GET') funbikeRequireAdmin();

// Les fichiers déjà retirés par l'ancienne version n'ont plus d'entrée dans
// le JSON. Ne découvrir que les noms créés par cette bibliothèque, sans
// suivre les liens symboliques et sans jamais modifier le dossier à la lecture.
function bannerRetiredFiles($data)
{
    $dir = dirname(__DIR__) . '/uploads/homepage';
    if (!file_exists($dir) && !is_link($dir)) return [];
    if (is_link($dir) || !is_dir($dir) || !is_readable($dir)) funbikeJsonResponse(500, ['error' => 'Dossier des photos indisponible.']);
    $names = @scandir($dir);
    if ($names === false) funbikeJsonResponse(500, ['error' => 'Impossible de lire les photos retirées.']);
    $active = [];
    foreach (($data['images'] ?? []) as $image) $active[$image['id']] = true;
    $retired = [];
    foreach ($names as $name) {
        if (!preg_match('/^sherco-([a-f0-9]{32})\.(jpg|png|webp)$/D', $name, $match) || isset($active[$match[1]])) continue;
        $path = $dir . '/' . $name;
        if (is_link($path) || !is_file($path)) continue;
        $retired[] = ['id' => $match[1], 'url' => '/server/uploads/homepage/' . $name];
    }
    return $retired;
}

function bannerRespond($status, $data)
{
    funbikeJsonResponse($status, [
        'data' => $data ?? ['images' => [], 'selected' => null],
        'retired' => bannerRetiredFiles($data),
        'legacy' => $data === null || ($data['legacy'] ?? false) === true,
    ]);
}

// Ne pas supprimer une photo si une autre donnée JSON du site la référence.
// D'autres références hors stockage peuvent exister : l'administrateur doit
// toujours vérifier avant de confirmer la suppression définitive.
function bannerContainsReference($value, $url)
{
    if (is_string($value)) return strpos($value, $url) !== false;
    if (!is_array($value)) return false;
    foreach ($value as $key => $item) {
        if ((is_string($key) && strpos($key, $url) !== false) || bannerContainsReference($item, $url)) return true;
    }
    return false;
}

function bannerAssertNotReferenced($url)
{
    $dir = dirname(__DIR__) . '/storage/data';
    try {
        $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
        foreach ($files as $file) {
            if ($file->isLink()) funbikeJsonResponse(409, ['error' => 'Impossible de vérifier les références : lien symbolique dans les données.']);
            if (!$file->isFile() || strtolower($file->getExtension()) !== 'json' || $file->getPathname() === $dir . '/sherco-banner.json') continue;
            $raw = @file_get_contents($file->getPathname());
            if ($raw === false) funbikeJsonResponse(500, ['error' => 'Impossible de vérifier toutes les données. Aucune photo supprimée.']);
            $decoded = json_decode($raw, true);
            if (json_last_error() !== JSON_ERROR_NONE) funbikeJsonResponse(500, ['error' => 'Impossible de vérifier toutes les données JSON. Aucune photo supprimée.']);
            if (bannerContainsReference($decoded, $url)) funbikeJsonResponse(409, ['error' => 'Cette photo est encore référencée dans les données du site. Aucune photo supprimée.']);
        }
    } catch (UnexpectedValueException $e) {
        funbikeJsonResponse(500, ['error' => 'Impossible de vérifier toutes les données. Aucune photo supprimée.']);
    }
}

$data = funbikeShercoBannerRead();
if ($method === 'GET') bannerRespond(200, $data);
$legacy = $data === null || ($data['legacy'] ?? false) === true;
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
    if (is_link($dir)) funbikeJsonResponse(500, ['error' => 'Dossier des images invalide.']);
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) funbikeJsonResponse(500, ['error' => 'Dossier des images indisponible.']);
    // Ne jamais écraser un fichier existant, même en cas de collision d'identifiant.
    do {
        $id = bin2hex(random_bytes(16));
        $matches = glob($dir . '/sherco-' . $id . '.*');
        if ($matches === false) funbikeJsonResponse(500, ['error' => 'Impossible de vérifier les fichiers existants.']);
        $idInCatalog = false;
        foreach ($data['images'] as $existing) if ($existing['id'] === $id) $idInCatalog = true;
    } while ($matches || $idInCatalog);
    $filename = 'sherco-' . $id . '.' . $types[$mime];
    $path = $dir . '/' . $filename;
    if (!move_uploaded_file($image['tmp_name'], $path)) funbikeJsonResponse(500, ['error' => 'Impossible d’enregistrer l’image.']);
    $data['images'][] = ['id' => $id, 'url' => '/server/uploads/homepage/' . $filename];
    if ($data['selected'] === null) { $data['selected'] = $id; unset($data['legacy']); }
    // En cas d'échec de sauvegarde, le fichier est conservé pour récupération.
    funbikeShercoBannerWrite($data);
    bannerRespond(201, $data);
}
$body = funbikeReadJsonBody();
$id = $body['id'] ?? null;
if (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/D', $id)) funbikeJsonResponse(400, ['error' => 'Identifiant d’image invalide.']);
$action = $body['action'] ?? ($method === 'PUT' ? 'select' : 'retire');
if (!is_string($action) || !in_array($action, $method === 'PUT' ? ['select', 'restore'] : ['retire', 'purge'], true)) funbikeJsonResponse(400, ['error' => 'Action invalide.']);

if ($action === 'restore' || $action === 'purge') {
    // L'URL aussi doit correspondre exactement à un fichier repéré, pas à un
    // chemin fourni librement par le client.
    $url = $body['url'] ?? null;
    $image = null;
    foreach (bannerRetiredFiles($data) as $candidate) if ($candidate['id'] === $id && $candidate['url'] === $url) { $image = $candidate; break; }
    if ($image === null) funbikeJsonResponse(404, ['error' => 'Photo retirée introuvable. Rechargez la liste.']);
    $dir = dirname(__DIR__) . '/uploads/homepage';
    $path = $dir . '/' . basename($image['url']);
    $realDir = realpath($dir);
    $realPath = realpath($path);
    if ($realDir === false || $realPath === false || is_link($dir) || is_link($path) || dirname($realPath) !== $realDir || !is_file($realPath)) funbikeJsonResponse(409, ['error' => 'Fichier indisponible ou non autorisé.']);
    if ($action === 'restore') {
        if (count($data['images']) >= 40) funbikeJsonResponse(400, ['error' => 'La bibliothèque est limitée à 40 images.']);
        $info = @getimagesize($realPath);
        $types = ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];
        $extension = pathinfo($realPath, PATHINFO_EXTENSION);
        if (!is_array($info) || !isset($types[$extension]) || ($info['mime'] ?? '') !== $types[$extension]) funbikeJsonResponse(400, ['error' => 'Ce fichier n’est pas une image valide.']);
        $data['images'][] = $image;
        // Restaurer ne doit pas modifier la bannière publique existante.
        if ($legacy) $data['legacy'] = true;
        funbikeShercoBannerWrite($data);
        bannerRespond(200, $data);
    }
    bannerAssertNotReferenced($image['url']);
    if (!@unlink($realPath)) funbikeJsonResponse(500, ['error' => 'Impossible de supprimer le fichier. Il reste dans la liste.']);
    // Un nettoyage d'anciens fichiers ne doit pas initialiser le catalogue ni
    // modifier l'image actuellement affichée.
    bannerRespond(200, $legacy && !isset($data['legacy']) && count($data['images']) === 0 ? null : $data);
}
$index = null;
foreach ($data['images'] as $i => $image) if ($image['id'] === $id) { $index = $i; break; }
if ($index === null) funbikeJsonResponse(404, ['error' => 'Image introuvable. Rechargez la bibliothèque.']);
if ($action === 'select') {
    $data['selected'] = $id;
    unset($data['legacy']);
    funbikeShercoBannerWrite($data);
    bannerRespond(200, $data);
}
array_splice($data['images'], $index, 1);
if ($data['selected'] === $id) $data['selected'] = null;
funbikeShercoBannerWrite($data);
bannerRespond(200, $data);

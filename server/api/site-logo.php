<?php
// Bibliothèque indépendante : l'original reste en dehors de ce dossier.
require_once __DIR__ . '/_lib/auth.php';
require_once __DIR__ . '/_lib/site-logo.php';
funbikeBootstrapApi();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if (!in_array($method, ['GET', 'POST', 'PUT', 'DELETE'], true)) funbikeJsonResponse(405, ['error' => 'Méthode non autorisée.']);
funbikeProtectWriteMethods($method);
funbikeRequireAdmin();
$data = funbikeSiteLogoRead();
if ($data === null) funbikeJsonResponse(500, ['error' => 'Bibliothèque de logos invalide. Restaurez une sauvegarde.']);
function siteLogoReply($status, $data) {
    funbikeJsonResponse($status, ['data' => $data, 'revision' => funbikeSiteLogoRevision($data), 'defaultLogo' => FUNBIKE_DEFAULT_SITE_LOGO]);
}
if ($method === 'GET') siteLogoReply(200, $data);
if ($method === 'POST' && empty($_POST) && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) funbikeJsonResponse(413, ['error' => 'Envoi trop volumineux ou impossible.']);
$body = $method === 'POST' ? $_POST : funbikeReadJsonBody();
if (!is_string($body['revision'] ?? null) || !hash_equals(funbikeSiteLogoRevision($data), $body['revision'])) funbikeJsonResponse(409, ['error' => 'La bibliothèque a changé. Rechargez avant de continuer.']);
$dir = dirname(__DIR__) . '/uploads/site-logo';
if (is_link($dir) || (file_exists($dir) && !is_dir($dir))) funbikeJsonResponse(500, ['error' => 'Dossier des logos invalide.']);
function siteLogoName($name) {
    if (!is_string($name) || trim($name) === '' || strlen($name) > 240 || preg_match('/[\x00-\x1f\x7f]/', $name) || !preg_match('//u', $name)) funbikeJsonResponse(400, ['error' => 'Indiquez un nom de logo valide (240 octets maximum).']);
    return trim($name);
}
if ($method === 'POST') {
    $name = siteLogoName($body['name'] ?? 'Logo');
    if (count($data['images']) >= 40) funbikeJsonResponse(400, ['error' => 'La bibliothèque est limitée à 40 logos.']);
    $image = $_FILES['image'] ?? null;
    if (!is_array($image) || ($image['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($image['tmp_name'] ?? '') || ($image['size'] ?? 0) < 1 || $image['size'] > 8 * 1024 * 1024) funbikeJsonResponse(400, ['error' => 'Choisissez une image valide de 8 Mo maximum.']);
    $info = @getimagesize($image['tmp_name']);
    $mime = function_exists('mime_content_type') ? @mime_content_type($image['tmp_name']) : '';
    $types = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!is_array($info) || !isset($types[$mime]) || ($info['mime'] ?? '') !== $mime || $info[0] < 1 || $info[1] < 1 || $info[0] * $info[1] > 12000000) funbikeJsonResponse(400, ['error' => 'Image invalide : JPEG, PNG ou WebP de 12 millions de pixels maximum.']);
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) funbikeJsonResponse(500, ['error' => 'Dossier des logos indisponible.']);
    do { $id = bin2hex(random_bytes(16)); $path = $dir . '/logo-' . $id . '.' . $types[$mime]; } while (file_exists($path) || is_link($path));
    if (!move_uploaded_file($image['tmp_name'], $path)) funbikeJsonResponse(500, ['error' => 'Impossible d’enregistrer le logo.']);
    $data['images'][] = ['id' => $id, 'url' => '/server/uploads/site-logo/' . basename($path), 'name' => $name];
    // Sur échec de sauvegarde, ne pas effacer silencieusement l'image transférée.
    if (!funbikeSiteLogoWrite($data)) funbikeJsonResponse(500, ['error' => 'Logo transféré mais bibliothèque non enregistrée. Vérifiez le stockage.']);
    siteLogoReply(201, $data);
}
if (!array_key_exists('id', $body)) funbikeJsonResponse(400, ['error' => 'Logo non précisé.']);
$id = $body['id'];
if ($method === 'PUT' && $id === null) {
    $data['selected'] = null;
    if (!funbikeSiteLogoWrite($data)) funbikeJsonResponse(500, ['error' => 'Impossible de modifier le logo.']);
    siteLogoReply(200, $data);
}
if (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/D', $id)) funbikeJsonResponse(400, ['error' => 'Logo invalide. Le logo par défaut ne peut jamais être supprimé.']);
$index = null; foreach ($data['images'] as $i => $image) if ($image['id'] === $id) { $index = $i; break; }
if ($index === null) funbikeJsonResponse(404, ['error' => 'Logo introuvable.']);
if ($method === 'PUT' && ($body['action'] ?? '') === 'rename') {
    $data['images'][$index]['name'] = siteLogoName($body['name'] ?? null);
    if (!funbikeSiteLogoWrite($data)) funbikeJsonResponse(500, ['error' => 'Impossible de renommer le logo.']);
    siteLogoReply(200, $data);
}
$filename = basename($data['images'][$index]['url']);
$path = $dir . '/' . $filename;
if (is_link($path)) funbikeJsonResponse(409, ['error' => 'Fichier du logo non autorisé. Aucun fichier supprimé.']);
if (!is_file($path)) {
    // Une absence ne doit pas être déduite d'un dossier inaccessible.
    if ($method !== 'DELETE') funbikeJsonResponse(404, ['error' => 'Fichier du logo indisponible.']);
    $uploads = dirname($dir);
    if (is_link($uploads) || !is_dir($uploads) || ($uploadEntries = @scandir($uploads)) === false) funbikeJsonResponse(500, ['error' => 'Dossier des logos inaccessible. Aucun logo supprimé.']);
    if (is_dir($dir)) {
        $entries = @scandir($dir);
        if ($entries === false || in_array($filename, $entries, true)) funbikeJsonResponse(500, ['error' => 'Fichier du logo inaccessible. Aucun logo supprimé.']);
    } elseif (in_array('site-logo', $uploadEntries, true)) funbikeJsonResponse(500, ['error' => 'Dossier des logos inaccessible. Aucun logo supprimé.']);
    array_splice($data['images'], $index, 1);
    if ($data['selected'] === $id) $data['selected'] = null;
    if (!funbikeSiteLogoWrite($data)) funbikeJsonResponse(500, ['error' => 'Impossible de modifier la bibliothèque.']);
    funbikeJsonResponse(200, ['data' => $data, 'revision' => funbikeSiteLogoRevision($data), 'defaultLogo' => FUNBIKE_DEFAULT_SITE_LOGO, 'fileStatus' => 'missing']);
}
if ($method === 'PUT') {
    $data['selected'] = $id;
    if (!funbikeSiteLogoWrite($data)) funbikeJsonResponse(500, ['error' => 'Impossible de modifier le logo.']);
    siteLogoReply(200, $data);
}
// Un autre contenu JSON peut conserver une référence à cette image : ne pas supprimer à l'aveugle.
function siteLogoContainsReference($value, $url) {
    if (is_string($value)) {
        $value = str_replace('\\', '/', rawurldecode(html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8')));
        return stripos($value, ltrim($url, '/')) !== false;
    }
    if (!is_array($value)) return false;
    foreach ($value as $key => $item) if ((is_string($key) && siteLogoContainsReference($key, $url)) || siteLogoContainsReference($item, $url)) return true;
    return false;
}
try {
    $dataDir = dirname(__DIR__) . '/storage/data';
    if (is_link($dataDir)) throw new RuntimeException();
    $libraryPath = realpath($dataDir . '/site-logo.json');
    if ($libraryPath === false) throw new RuntimeException();
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dataDir, FilesystemIterator::SKIP_DOTS));
    foreach ($files as $entry) {
        if ($entry->isLink()) funbikeJsonResponse(409, ['error' => 'Impossible de vérifier les références : lien symbolique dans les données.']);
        if (!$entry->isFile() || strtolower($entry->getExtension()) !== 'json') continue;
        $entryPath = $entry->getRealPath();
        if ($entryPath === false) throw new RuntimeException();
        // Sous Windows, l'itérateur et le chemin PHP peuvent utiliser des séparateurs différents.
        $sameFile = PHP_OS_FAMILY === 'Windows' ? strcasecmp($entryPath, $libraryPath) === 0 : $entryPath === $libraryPath;
        if ($sameFile) continue;
        $raw = @file_get_contents($entry->getPathname());
        $value = $raw === false ? null : json_decode($raw, true);
        if ($raw === false || json_last_error() !== JSON_ERROR_NONE) funbikeJsonResponse(500, ['error' => 'Impossible de vérifier les données. Aucun logo supprimé.']);
        if (siteLogoContainsReference($value, $data['images'][$index]['url'])) funbikeJsonResponse(409, ['error' => 'Ce logo est encore utilisé dans les données « ' . $entry->getFilename() . ' ». Aucun logo supprimé.']);
    }
} catch (Throwable $e) { funbikeJsonResponse(500, ['error' => 'Impossible de vérifier les références. Aucun logo supprimé.']); }

// Déplacer temporairement le seul fichier concerné pour pouvoir rétablir la
// bibliothèque si son écriture échoue ; l'original ne peut jamais être visé.
$staged = $dir . '/.suppression-' . $id;
if (file_exists($staged) || is_link($staged) || !@rename($path, $staged)) funbikeJsonResponse(500, ['error' => 'Impossible de préparer la suppression du logo.']);
$previous = $data;
array_splice($data['images'], $index, 1);
if ($data['selected'] === $id) $data['selected'] = null;
if (!funbikeSiteLogoWrite($data)) {
    if (!@rename($staged, $path)) funbikeJsonResponse(500, ['error' => 'Enregistrement impossible ; logo conservé en fichier temporaire. Vérifiez une sauvegarde.']);
    funbikeJsonResponse(500, ['error' => 'Impossible d’enregistrer la bibliothèque. Logo conservé.']);
}
if (!@unlink($staged)) {
    // Si l'effacement échoue, rétablir si possible la bibliothèque et son fichier.
    if (!@rename($staged, $path)) funbikeJsonResponse(500, ['error' => 'Fichier temporaire non supprimé. Vérifiez le serveur et vos sauvegardes.']);
    if (!funbikeSiteLogoWrite($previous)) funbikeJsonResponse(500, ['error' => 'Fichier conservé mais bibliothèque non rétablie. Vérifiez le serveur et vos sauvegardes.']);
    funbikeJsonResponse(500, ['error' => 'Suppression impossible : logo conservé. Vérifiez les permissions du serveur.']);
}
siteLogoReply(200, $data);

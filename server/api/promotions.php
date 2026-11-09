<?php
// Campagnes séparées du catalogue : seules des références aux fiches sont stockées.
require_once __DIR__ . '/_lib/auth.php';
funbikeBootstrapApi();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
funbikeProtectWriteMethods($method);
if (!in_array($method, ['GET', 'POST', 'PUT', 'DELETE'], true)) funbikeJsonResponse(405, ['error' => 'Méthode non autorisée.']);
$file = dirname(__DIR__) . '/storage/data/promotions.json';
if (!file_exists($file)) $campaigns = [];
else {
    $raw = @file_get_contents($file);
    $data = $raw === false ? null : json_decode($raw, true);
    if (!is_array($data) || !isset($data['campaigns']) || !is_array($data['campaigns'])) funbikeJsonResponse(500, ['error' => 'Données des promotions indisponibles.']);
    $campaigns = $data['campaigns'];
}
function promotionSave($file, $campaigns) {
    $encoded = json_encode(['campaigns' => array_values($campaigns)], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false || !funbikeAtomicWrite($file, $encoded)) funbikeJsonResponse(500, ['error' => 'Impossible d’enregistrer les promotions.']);
}
function promotionDateValid($date) {
    if (!is_string($date) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $date, $m)) return false;
    return (int)$m[1] > 0 && checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
}
$files = ['motos' => 'motorcycles', 'casques' => 'helmets', 'equipements' => 'riding-gear', 'pieces-detachees' => 'spare-parts'];
if ($method === 'GET') {
    if (($_GET['admin'] ?? '') === '1') { funbikeRequireAdmin(); funbikeJsonResponse(200, ['campaigns' => $campaigns]); }
    $today = (new DateTimeImmutable('now', new DateTimeZone('Indian/Antananarivo')))->format('Y-m-d');
    $published = [];
    foreach ($files as $catalogFile) {
        foreach (funbikePublicProducts(funbikeCatalogRecords('products/' . $catalogFile . '.json', 'products')) as $p) $published[($p['categoryId'] ?? '') . ':' . ($p['id'] ?? '')] = true;
    }
    $visible = [];
    foreach ($campaigns as $campaign) {
        if (!is_array($campaign) || ($campaign['enabled'] ?? false) !== true || ($campaign['published'] ?? false) !== true || !promotionDateValid($campaign['startDate'] ?? null) || !promotionDateValid($campaign['endDate'] ?? null) || $campaign['startDate'] > $today || $today > $campaign['endDate'] || !is_array($campaign['products'] ?? null)) continue;
        $campaign['products'] = array_values(array_filter($campaign['products'], function ($p) use ($published) { return is_array($p) && isset($published[($p['categoryId'] ?? '') . ':' . ($p['productId'] ?? '')]); }));
        if ($campaign['products']) $visible[] = $campaign;
    }
    funbikeJsonResponse(200, ['campaigns' => $visible, 'serverTime' => gmdate('c')]);
}
if ($method === 'POST' && isset($_FILES['banner'])) {
    $image = $_FILES['banner'];
    if (!is_array($image) || ($image['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($image['tmp_name'] ?? '') || ($image['size'] ?? 0) < 1 || $image['size'] > 8 * 1024 * 1024) funbikeJsonResponse(400, ['error' => 'Choisissez une image de 8 Mo maximum.']);
    $info = @getimagesize($image['tmp_name']);
    $mime = function_exists('mime_content_type') ? @mime_content_type($image['tmp_name']) : '';
    $types = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!is_array($info) || !isset($types[$mime]) || ($info['mime'] ?? '') !== $mime || $info[0] < 1 || $info[1] < 1 || $info[0] * $info[1] > 30000000) funbikeJsonResponse(400, ['error' => 'Image JPEG, PNG ou WebP invalide.']);
    $dir = dirname(__DIR__) . '/uploads/promotions';
    if (is_link($dir) || (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir))) funbikeJsonResponse(500, ['error' => 'Dossier des images indisponible.']);
    do { $name = bin2hex(random_bytes(16)) . '.' . $types[$mime]; } while (file_exists($dir . '/' . $name));
    if (!move_uploaded_file($image['tmp_name'], $dir . '/' . $name)) funbikeJsonResponse(500, ['error' => 'Impossible d’enregistrer l’image.']);
    funbikeJsonResponse(201, ['url' => '/server/uploads/promotions/' . $name]);
}
$body = funbikeReadJsonBody();
if ($method === 'DELETE') {
    $id = $body['id'] ?? null;
    if (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/D', $id)) funbikeJsonResponse(400, ['error' => 'Identifiant invalide.']);
    $remaining = array_values(array_filter($campaigns, function ($c) use ($id) { return ($c['id'] ?? null) !== $id; }));
    if (count($remaining) === count($campaigns)) funbikeJsonResponse(404, ['error' => 'Promotion introuvable.']);
    promotionSave($file, $remaining); funbikeJsonResponse(200, ['campaigns' => $remaining]);
}
$c = $body['campaign'] ?? null;
if (!is_array($c) || !is_string($c['name'] ?? null) || trim($c['name']) === '' || strlen($c['name']) > 600 || !is_string($c['description'] ?? null) || strlen($c['description']) > 20000 || !promotionDateValid($c['startDate'] ?? null) || !promotionDateValid($c['endDate'] ?? null) || $c['startDate'] > $c['endDate'] || !is_bool($c['enabled'] ?? null) || !is_bool($c['published'] ?? null) || !is_array($c['products'] ?? null) || count($c['products']) > 500) funbikeJsonResponse(400, ['error' => 'Informations de campagne invalides. Vérifiez le nom et les dates.']);
$banner = $c['bannerUrl'] ?? '';
if (!is_string($banner) || ($banner !== '' && (!preg_match('#^/server/uploads/promotions/[a-f0-9]{32}\.(jpg|png|webp)$#D', $banner) || !is_file(dirname(__DIR__, 2) . $banner)))) funbikeJsonResponse(400, ['error' => 'Bannière invalide.']);
$id = $c['id'] ?? '';
if ($method === 'POST') $id = bin2hex(random_bytes(16));
elseif (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/D', $id) || !funbikeFindRecord($campaigns, $id)) funbikeJsonResponse(404, ['error' => 'Promotion introuvable.']);
$seen = []; $items = [];
foreach ($c['products'] as $p) {
    if (!is_array($p) || !is_string($p['categoryId'] ?? null) || !isset($files[$p['categoryId']]) || !is_string($p['productId'] ?? null) || $p['productId'] === '' || !is_int($p['originalPrice'] ?? null) || $p['originalPrice'] <= 0 || $p['originalPrice'] > 1000000000000 || !is_numeric($p['discountPercent'] ?? null) || $p['discountPercent'] <= 0 || $p['discountPercent'] > 100 || abs($p['discountPercent'] * 100 - round($p['discountPercent'] * 100)) > 0.00000001) funbikeJsonResponse(400, ['error' => 'Prix ou réduction invalide : renseignez un prix positif et une réduction entre 0,01 et 100 %.']);
    $key = $p['categoryId'] . ':' . $p['productId'];
    if (isset($seen[$key])) funbikeJsonResponse(400, ['error' => 'Produit ajouté deux fois.']);
    $seen[$key] = true;
    $product = funbikeFindRecord(funbikeCatalogRecords('products/' . $files[$p['categoryId']] . '.json', 'products'), $p['productId']);
    if (!$product || ($product['categoryId'] ?? null) !== $p['categoryId']) funbikeJsonResponse(400, ['error' => 'Un produit est introuvable dans le catalogue.']);
    $items[] = ['categoryId' => $p['categoryId'], 'productId' => $p['productId'], 'originalPrice' => $p['originalPrice'], 'discountPercent' => (float)$p['discountPercent']];
}
if ($c['enabled'] && $c['published']) foreach ($campaigns as $other) {
    if (($other['id'] ?? '') === $id || ($other['enabled'] ?? false) !== true || ($other['published'] ?? false) !== true || ($other['endDate'] ?? '') < $c['startDate'] || ($other['startDate'] ?? '') > $c['endDate']) continue;
    foreach (($other['products'] ?? []) as $p) if (isset($seen[($p['categoryId'] ?? '') . ':' . ($p['productId'] ?? '')])) funbikeJsonResponse(409, ['error' => 'Un produit est déjà dans une autre promotion activée et publiée aux mêmes dates.']);
}
$clean = ['id' => $id, 'name' => trim($c['name']), 'description' => $c['description'], 'bannerUrl' => $banner, 'startDate' => $c['startDate'], 'endDate' => $c['endDate'], 'enabled' => $c['enabled'], 'published' => $c['published'], 'products' => $items];
$campaigns = array_values(array_filter($campaigns, function ($v) use ($id) { return ($v['id'] ?? '') !== $id; }));
$campaigns[] = $clean; promotionSave($file, $campaigns);
funbikeJsonResponse($method === 'POST' ? 201 : 200, ['campaign' => $clean, 'campaigns' => $campaigns]);

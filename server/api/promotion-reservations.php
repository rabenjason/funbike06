<?php
// Réception publique limitée ; consultation et gestion strictement administrateur.
require_once __DIR__ . '/_lib/auth.php';
funbikeBootstrapApi();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if (!in_array($method, ['GET', 'POST', 'PUT', 'DELETE'], true)) funbikeJsonResponse(405, ['error' => 'Méthode non autorisée.']);
if ($method !== 'GET') funbikeRequireTrustedOrigin();
if ($method !== 'POST') funbikeRequireAdmin();
if ($method === 'POST') funbikeCatalogLock(false); // Toujours avant le verrou des réservations.
$dir = dirname(__DIR__) . '/storage/private';
if (is_link($dir) || (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir))) funbikeJsonResponse(500, ['error' => 'Stockage privé indisponible.']);
$lock = @fopen($dir . '/promotion-reservations.lock', 'c');
if (!$lock || !flock($lock, $method === 'GET' ? LOCK_SH : LOCK_EX)) funbikeJsonResponse(500, ['error' => 'Stockage des réservations indisponible.']);
register_shutdown_function(function () use ($lock) { flock($lock, LOCK_UN); fclose($lock); });
$file = $dir . '/promotion-reservations.json';
function reservationLoad($file) {
    if (!file_exists($file)) return ['reservations' => [], 'limits' => [], 'salt' => bin2hex(random_bytes(32))];
    $raw = @file_get_contents($file); $data = $raw === false ? null : json_decode($raw, true);
    if (!is_array($data) || !is_array($data['reservations'] ?? null) || !is_array($data['limits'] ?? null) || !is_string($data['salt'] ?? null) || !preg_match('/^[a-f0-9]{64}$/D', $data['salt'])) funbikeJsonResponse(500, ['error' => 'Données des réservations invalides. Restaurez une sauvegarde.']);
    $seen = [];
    foreach ($data['reservations'] as $item) {
        if (!is_array($item) || !is_string($item['id'] ?? null) || !preg_match('/^[a-f0-9]{32}$/D', $item['id']) || isset($seen[$item['id']]) || !in_array($item['source'] ?? null, ['form', 'whatsapp'], true) || !in_array($item['status'] ?? null, ['new', 'whatsapp_initiated', 'contacted', 'confirmed', 'cancelled'], true) || !is_string($item['createdAt'] ?? null) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/D', $item['createdAt']) || !is_array($item['customer'] ?? null) || !is_array($item['product'] ?? null) || !is_array($item['promotion'] ?? null) || !is_int($item['quantity'] ?? null) || !is_string($item['message'] ?? null) || !is_string($item['internalNotes'] ?? null)) funbikeJsonResponse(500, ['error' => 'Données des réservations invalides. Restaurez une sauvegarde.']);
        foreach (['name', 'phone', 'city'] as $key) if (!is_string($item['customer'][$key] ?? null)) funbikeJsonResponse(500, ['error' => 'Données des réservations invalides. Restaurez une sauvegarde.']);
        foreach (['id', 'name', 'brand', 'categoryId', 'path', 'image'] as $key) if (!is_string($item['product'][$key] ?? null)) funbikeJsonResponse(500, ['error' => 'Données des réservations invalides. Restaurez une sauvegarde.']);
        foreach (['id', 'name', 'startDate', 'endDate'] as $key) if (!is_string($item['promotion'][$key] ?? null)) funbikeJsonResponse(500, ['error' => 'Données des réservations invalides. Restaurez une sauvegarde.']);
        if (!is_int($item['promotion']['originalPrice'] ?? null) || !is_int($item['promotion']['promotionalPrice'] ?? null) || !is_numeric($item['promotion']['discountPercent'] ?? null)) funbikeJsonResponse(500, ['error' => 'Données des réservations invalides. Restaurez une sauvegarde.']);
        $seen[$item['id']] = true;
    }
    return $data;
}
function reservationSave($file, $data) {
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false || !funbikeAtomicWrite($file, $json)) funbikeJsonResponse(500, ['error' => 'Enregistrement impossible.']);
}
function reservationBody() {
    if (isset($_SERVER['CONTENT_LENGTH']) && (int) $_SERVER['CONTENT_LENGTH'] > 16384) funbikeJsonResponse(413, ['error' => 'Demande trop volumineuse.']);
    $stream = fopen('php://input', 'r'); $raw = $stream ? stream_get_contents($stream, 16385) : false;
    if ($stream) fclose($stream);
    if ($raw === false || strlen($raw) > 16384) funbikeJsonResponse(413, ['error' => 'Demande trop volumineuse.']);
    $body = json_decode($raw, true);
    if (!is_array($body)) funbikeJsonResponse(400, ['error' => 'Demande invalide.']);
    return $body;
}
function reservationText($body, $key, $max, $required = false, $multiline = false) {
    $value = $body[$key] ?? '';
    if (!is_string($value)) funbikeJsonResponse(400, ['error' => 'Champ invalide : ' . $key]);
    $value = trim($value);
    if (($required && $value === '') || strlen($value) > $max * 4 || !preg_match('//u', $value) || preg_match_all('/./us', $value) > $max || preg_match($multiline ? '/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/' : '/[\x00-\x1f\x7f]/', $value)) funbikeJsonResponse(400, ['error' => 'Vérifiez le champ ' . $key . '.']);
    return $value;
}
function reservationPhone($phone, $required) {
    if ($phone === '' && !$required) return;
    $digits = preg_replace('/\D/', '', $phone);
    if (!preg_match('/^[+0-9 ().-]{6,60}$/D', $phone) || strlen($digits) < 6 || strlen($digits) > 15) funbikeJsonResponse(400, ['error' => 'Vérifiez le numéro de téléphone.']);
}
function reservationDateValid($date) {
    return is_string($date) && preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $date, $m) && (int)$m[1] > 0 && checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
}
function reservationRevision($item) { return hash('sha256', json_encode($item, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)); }
$data = reservationLoad($file);
if ($method === 'POST') {
    $body = reservationBody();
    if (!empty($body['website'])) funbikeJsonResponse(400, ['error' => 'Demande invalide.']);
    $source = $body['source'] ?? null;
    if (!in_array($source, ['form', 'whatsapp'], true)) funbikeJsonResponse(400, ['error' => 'Origine invalide.']);
    $campaignId = $body['campaignId'] ?? null; $productId = $body['productId'] ?? null; $categoryId = $body['categoryId'] ?? null;
    $files = ['motos' => 'motorcycles', 'casques' => 'helmets', 'equipements' => 'riding-gear', 'pieces-detachees' => 'spare-parts'];
    if (!is_string($campaignId) || !preg_match('/^[a-f0-9]{32}$/D', $campaignId) || !is_string($productId) || $productId === '' || strlen($productId) > 240 || !is_string($categoryId) || !isset($files[$categoryId])) funbikeJsonResponse(400, ['error' => 'Promotion invalide.']);
    $campaignFile = dirname(__DIR__) . '/storage/data/promotions.json';
    $raw = @file_get_contents($campaignFile); $campaignData = $raw === false ? null : json_decode($raw, true);
    if (!is_array($campaignData) || !is_array($campaignData['campaigns'] ?? null)) funbikeJsonResponse(503, ['error' => 'Promotions indisponibles.']);
    $campaign = funbikeFindRecord($campaignData['campaigns'], $campaignId);
    $today = (new DateTimeImmutable('now', new DateTimeZone('Indian/Antananarivo')))->format('Y-m-d');
    if (!$campaign || ($campaign['enabled'] ?? null) !== true || ($campaign['published'] ?? null) !== true || !reservationDateValid($campaign['startDate'] ?? null) || !reservationDateValid($campaign['endDate'] ?? null) || $campaign['startDate'] > $today || $today > $campaign['endDate'] || !is_array($campaign['products'] ?? null)) funbikeJsonResponse(409, ['error' => 'Cette promotion n’est plus disponible. Actualisez la page.']);
    $offer = null;
    foreach ($campaign['products'] as $item) if (($item['productId'] ?? null) === $productId && ($item['categoryId'] ?? null) === $categoryId) { $offer = $item; break; }
    $products = funbikePublicProducts(funbikeCatalogRecords('products/' . $files[$categoryId] . '.json', 'products'));
    $product = funbikeFindRecord($products, $productId);
    if (!$offer || !$product || ($product['categoryId'] ?? null) !== $categoryId) funbikeJsonResponse(409, ['error' => 'Ce produit n’est plus disponible dans la promotion.']);
    $price = $offer['originalPrice'] ?? null; $discount = $offer['discountPercent'] ?? null;
    if (!is_int($price) || $price <= 0 || $price > 1000000000000 || !is_numeric($discount) || $discount <= 0 || $discount > 100 || abs($discount * 100 - round($discount * 100)) > 0.00000001) funbikeJsonResponse(409, ['error' => 'Prix promotionnel indisponible.']);
    if (($body['originalPrice'] ?? null) !== $price || !is_numeric($body['discountPercent'] ?? null) || (float)$body['discountPercent'] !== (float)$discount) funbikeJsonResponse(409, ['error' => 'Le prix de la promotion a changé. Actualisez avant de continuer.']);
    $brand = funbikeFindRecord(funbikeCatalogRecords('brands.json', 'brands'), $product['brandId'] ?? '');
    $images = is_array($product['images'] ?? null) ? $product['images'] : []; $image = '';
    foreach ($images as $entry) if (!empty($entry['isMain'])) { $image = $entry['url'] ?? ''; break; }
    if (!$image && isset($images[0]['url'])) $image = $images[0]['url'];
    if (!is_string($image) || !preg_match('#^/server/(uploads|public)/[^\s?\#]*$#D', $image) || strpos($image, '..') !== false) $image = '';
    $prefix = ['motos' => 'motos', 'casques' => 'casques', 'equipements' => 'equipements', 'pieces-detachees' => 'pieces-detachees'][$categoryId];
    $snapshot = ['product' => ['id' => $productId, 'categoryId' => $categoryId, 'name' => $product['name'], 'brand' => $brand['name'] ?? '', 'path' => '/' . $prefix . '/' . rawurlencode($productId), 'image' => $image], 'promotion' => ['id' => $campaignId, 'name' => $campaign['name'], 'startDate' => $campaign['startDate'], 'endDate' => $campaign['endDate'], 'originalPrice' => $price, 'promotionalPrice' => $price - intdiv($price * (int) round($discount * 100) + 5000, 10000), 'discountPercent' => (float)$discount]];
    $phone = null;
    if ($source === 'whatsapp') {
        $settingsFile = $dir . '/whatsapp-settings.json'; $settings = is_file($settingsFile) ? json_decode((string) @file_get_contents($settingsFile), true) : null;
        $team = $categoryId === 'pieces-detachees' ? 'parts' : 'sales'; $group = $settings[$team] ?? null;
        if (($settings['enabled'] ?? null) === true && is_array($group) && is_string($group['activeId'] ?? null) && is_array($group['people'] ?? null)) foreach ($group['people'] as $person) if (($person['id'] ?? null) === $group['activeId']) { $phone = $person['phone'] ?? null; break; }
        if (!is_string($phone) || !preg_match('/^\+[0-9\s().-]+$/D', $phone) || !preg_match('/^[1-9][0-9]{7,14}$/D', preg_replace('/\D/', '', $phone))) funbikeJsonResponse(409, ['error' => 'Le contact WhatsApp est indisponible. Utilisez le formulaire.']);
    }
    $name = reservationText($body, 'name', 80, $source === 'form');
    $customerPhone = reservationText($body, 'phone', 60, $source === 'form'); reservationPhone($customerPhone, $source === 'form');
    $city = reservationText($body, 'city', 100, $source === 'form');
    $message = reservationText($body, 'message', 2000, false, true);
    $quantity = $body['quantity'] ?? 1;
    if (!is_int($quantity) || $quantity < 1 || $quantity > 999) funbikeJsonResponse(400, ['error' => 'Quantité invalide.']);
    $now = time();
    foreach ($data['limits'] as $key => $times) { $data['limits'][$key] = array_values(array_filter(is_array($times) ? $times : [], function ($t) use ($now) { return is_int($t) && $t > $now - 600; })); if (!$data['limits'][$key]) unset($data['limits'][$key]); }
    $ipKey = hash_hmac('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'), $data['salt']);
    if (count($data['limits'][$ipKey] ?? []) >= 10) funbikeJsonResponse(429, ['error' => 'Trop de demandes. Réessayez dans quelques minutes.']);
    $data['limits'][$ipKey][] = $now;
    $item = ['id' => bin2hex(random_bytes(16)), 'source' => $source, 'status' => $source === 'form' ? 'new' : 'whatsapp_initiated', 'createdAt' => gmdate('Y-m-d\TH:i:s\Z'), 'product' => $snapshot['product'], 'promotion' => $snapshot['promotion'], 'customer' => ['name' => $name, 'phone' => $customerPhone, 'city' => $city], 'quantity' => $quantity, 'message' => $message, 'internalNotes' => ''];
    $data['reservations'][] = $item; reservationSave($file, $data);
    // Aucune coordonnée client ou note interne dans la réponse publique.
    funbikeJsonResponse(201, ['id' => $item['id'], 'product' => $snapshot['product'], 'promotion' => $snapshot['promotion'], 'phone' => $phone]);
}
if ($method === 'GET') {
    if (($_GET['count'] ?? '') === 'unread') {
        $count = 0; foreach ($data['reservations'] as $item) if (in_array($item['status'] ?? null, ['new', 'whatsapp_initiated'], true)) $count++;
        funbikeJsonResponse(200, ['unreadCount' => $count]);
    }
    $items = array_map(function ($item) { $item['revision'] = reservationRevision($item); return $item; }, $data['reservations']);
    funbikeJsonResponse(200, ['reservations' => $items]);
}
$body = reservationBody();
if ($method === 'DELETE') {
    $ids = $body['ids'] ?? null;
    if (!is_array($ids) || !$ids || count($ids) > 100) funbikeJsonResponse(400, ['error' => 'Sélection invalide.']);
    foreach ($ids as $id) if (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/D', $id)) funbikeJsonResponse(400, ['error' => 'Identifiant invalide.']);
    if (count(array_unique($ids)) !== count($ids)) funbikeJsonResponse(400, ['error' => 'Sélection invalide.']);
    $present = array_column($data['reservations'], 'id');
    foreach ($ids as $id) if (!in_array($id, $present, true)) funbikeJsonResponse(409, ['error' => 'Une réservation a changé ou a déjà été supprimée. Rechargez.']);
    $data['reservations'] = array_values(array_filter($data['reservations'], function ($item) use ($ids) { return !in_array($item['id'] ?? '', $ids, true); }));
    reservationSave($file, $data); funbikeJsonResponse(200, ['deleted' => count($ids)]);
}
$id = $body['id'] ?? null; $revision = $body['revision'] ?? null; $index = null;
if (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/D', $id) || !is_string($revision)) funbikeJsonResponse(400, ['error' => 'Identifiant invalide.']);
foreach ($data['reservations'] as $i => $item) if (($item['id'] ?? null) === $id) { $index = $i; break; }
if ($index === null) funbikeJsonResponse(404, ['error' => 'Réservation introuvable.']);
if (!hash_equals(reservationRevision($data['reservations'][$index]), $revision)) funbikeJsonResponse(409, ['error' => 'Cette réservation a changé. Rechargez avant de modifier.']);
$status = $body['status'] ?? null;
if (!in_array($status, ['new', 'whatsapp_initiated', 'contacted', 'confirmed', 'cancelled'], true)) funbikeJsonResponse(400, ['error' => 'Statut invalide.']);
$customer = $body['customer'] ?? null;
if (!is_array($customer)) funbikeJsonResponse(400, ['error' => 'Coordonnées invalides.']);
$name = reservationText($customer, 'name', 80); $customerPhone = reservationText($customer, 'phone', 60); reservationPhone($customerPhone, false); $city = reservationText($customer, 'city', 100);
$notes = reservationText($body, 'internalNotes', 4000, false, true);
$data['reservations'][$index]['status'] = $status;
$data['reservations'][$index]['customer'] = ['name' => $name, 'phone' => $customerPhone, 'city' => $city];
$data['reservations'][$index]['internalNotes'] = $notes;
$item = $data['reservations'][$index]; reservationSave($file, $data); $item['revision'] = reservationRevision($item);
funbikeJsonResponse(200, ['reservation' => $item]);

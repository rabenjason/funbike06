<?php
// Réception publique des demandes et boîte de réception réservée aux admins.
require_once __DIR__ . '/_lib/auth.php';
funbikeBootstrapApi();

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if (!in_array($method, ['GET', 'POST', 'PUT', 'DELETE'], true)) funbikeJsonResponse(405, ['error' => 'Méthode non autorisée.']);
if ($method !== 'GET') funbikeRequireTrustedOrigin();
if ($method !== 'POST') funbikeRequireAdmin();

$dir = dirname(__DIR__) . '/storage/private';
if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) funbikeJsonResponse(500, ['error' => 'Stockage des messages indisponible.']);
$lock = fopen($dir . '/messages.lock', 'c');
if (!$lock || !flock($lock, $method === 'GET' ? LOCK_SH : LOCK_EX)) funbikeJsonResponse(500, ['error' => 'Stockage des messages indisponible.']);
register_shutdown_function(function () use ($lock) { flock($lock, LOCK_UN); fclose($lock); });
$file = $dir . '/messages.json';

function loadMessages($file) {
    if (!file_exists($file)) return ['messages' => [], 'limits' => [], 'salt' => bin2hex(random_bytes(32))];
    $data = json_decode((string) @file_get_contents($file), true);
    if (!is_array($data) || !isset($data['messages'], $data['limits'], $data['salt']) || !is_array($data['messages']) || !is_array($data['limits']) || !is_string($data['salt']))
        funbikeJsonResponse(500, ['error' => 'Données des messages invalides. Restaurez une sauvegarde.']);
    return $data;
}
function saveMessages($file, $data) {
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false || !funbikeAtomicWrite($file, $json)) funbikeJsonResponse(500, ['error' => 'Impossible d’enregistrer la demande. Réessayez.']);
}
function messageBody() {
    if (isset($_SERVER['CONTENT_LENGTH']) && (int) $_SERVER['CONTENT_LENGTH'] > 16384) funbikeJsonResponse(413, ['error' => 'Demande trop volumineuse.']);
    $stream = fopen('php://input', 'r');
    $raw = $stream ? stream_get_contents($stream, 16385) : false;
    if ($stream) fclose($stream);
    if ($raw === false || strlen($raw) > 16384) funbikeJsonResponse(413, ['error' => 'Demande trop volumineuse.']);
    $body = json_decode($raw, true);
    if (!is_array($body)) funbikeJsonResponse(400, ['error' => 'Demande invalide.']);
    return $body;
}
function messageField($body, $key, $max, $required = true, $multiline = false) {
    $value = $body[$key] ?? '';
    if (!is_string($value)) funbikeJsonResponse(400, ['error' => 'Champ ' . $key . ' invalide.']);
    $value = trim($value);
    if (($required && $value === '') || strlen($value) > $max || preg_match($multiline ? '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/' : '/[\x00-\x1F\x7F]/', $value))
        funbikeJsonResponse(400, ['error' => 'Vérifiez le champ ' . $key . '.']);
    return $value;
}

$data = loadMessages($file);
if ($method === 'POST') {
    $body = messageBody();
    if (!empty($body['website'])) funbikeJsonResponse(400, ['error' => 'Demande invalide.']);
    $name = messageField($body, 'name', 320);
    $phone = messageField($body, 'phone', 60);
    $email = messageField($body, 'email', 254);
    $whatsapp = messageField($body, 'whatsapp', 60, false);
    $subject = messageField($body, 'subject', 50);
    $message = messageField($body, 'message', 8000, true, true);
    $subjects = ['tvs' => 'Informations TVS', 'tvs-accessoires' => 'Équipements TVS (casques, blousons, gants)', 'tuktuk-tvs' => 'Informations TukTuk TVS', 'fantic' => 'Informations Fantic', 'sherco' => 'Informations Sherco', 'pieces' => 'Pièces détachées', 'autres' => 'Autres'];
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !isset($subjects[$subject])) funbikeJsonResponse(400, ['error' => 'Vérifiez l’e-mail et le sujet.']);
    $validPhone = function ($value) { $count = strlen(preg_replace('/\D/', '', $value)); return preg_match('/^[+0-9 ()\.\-]{6,60}$/', $value) && $count >= 6 && $count <= 15; };
    if (!$validPhone($phone) || ($whatsapp !== '' && !$validPhone($whatsapp))) funbikeJsonResponse(400, ['error' => 'Vérifiez les numéros de téléphone.']);

    // Limite simple par adresse réseau : aucun en-tête proxy fourni par le client n'est utilisé.
    $now = time();
    foreach ($data['limits'] as $key => $times) {
        $data['limits'][$key] = array_values(array_filter(is_array($times) ? $times : [], function ($time) use ($now) { return is_int($time) && $time > $now - 600; }));
        if (!$data['limits'][$key]) unset($data['limits'][$key]);
    }
    $ipKey = hash_hmac('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'), $data['salt']);
    if (count($data['limits'][$ipKey] ?? []) >= 10) funbikeJsonResponse(429, ['error' => 'Trop de demandes. Veuillez réessayer dans quelques minutes.']);
    $data['limits'][$ipKey][] = $now;
    $data['messages'][] = ['id' => bin2hex(random_bytes(16)), 'createdAt' => gmdate('Y-m-d\TH:i:s\Z'), 'status' => 'NEW', 'name' => $name, 'phone' => $phone, 'email' => $email, 'whatsapp' => $whatsapp, 'subject' => $subject, 'subjectLabel' => $subjects[$subject], 'message' => $message];
    saveMessages($file, $data);
    funbikeJsonResponse(201, ['message' => 'Votre demande a bien été reçue.']);
}

if ($method === 'GET') {
    // Le compteur couvre toute la boîte, indépendamment de la page affichée.
    if (($_GET['count'] ?? '') === 'unread') {
        $unread = 0;
        foreach ($data['messages'] as $item) if (($item['status'] ?? null) === 'NEW') $unread++;
        funbikeJsonResponse(200, ['unreadCount' => $unread]);
    }
    $order = $_GET['order'] ?? 'desc';
    if (!in_array($order, ['asc', 'desc'], true)) funbikeJsonResponse(400, ['error' => 'Tri invalide.']);
    $pageValue = $_GET['page'] ?? '1';
    if (!is_string($pageValue) || !preg_match('/^[1-9][0-9]{0,6}$/', $pageValue)) funbikeJsonResponse(400, ['error' => 'Page invalide.']);
    // L'index d'enregistrement départage les messages reçus à la même seconde.
    $indexed = [];
    foreach ($data['messages'] as $index => $item) $indexed[] = ['index' => $index, 'item' => $item];
    usort($indexed, function ($a, $b) use ($order) {
        $compare = strcmp($a['item']['createdAt'] ?? '', $b['item']['createdAt'] ?? '');
        if ($compare === 0) $compare = $a['index'] <=> $b['index'];
        return $order === 'asc' ? $compare : -$compare;
    });
    $total = count($indexed); $limit = 10; $pages = max(1, (int) ceil($total / $limit)); $page = min((int) $pageValue, $pages);
    $items = array_map(function ($entry) { return $entry['item']; }, array_slice($indexed, ($page - 1) * $limit, $limit));
    funbikeJsonResponse(200, ['messages' => $items, 'total' => $total, 'page' => $page, 'pages' => $pages, 'order' => $order]);
}

$id = $_GET['id'] ?? '';
if (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/', $id)) funbikeJsonResponse(400, ['error' => 'Identifiant invalide.']);
$index = null;
foreach ($data['messages'] as $i => $item) if (($item['id'] ?? '') === $id) { $index = $i; break; }
if ($index === null) funbikeJsonResponse(404, ['error' => 'Message introuvable.']);
if ($method === 'PUT') {
    $body = messageBody(); $status = $body['status'] ?? null;
    if (!is_string($status) || !in_array($status, ['NEW', 'READ', 'PROCESSED'], true)) funbikeJsonResponse(400, ['error' => 'Statut invalide.']);
    $data['messages'][$index]['status'] = $status;
    $item = $data['messages'][$index]; saveMessages($file, $data);
    funbikeJsonResponse(200, ['message' => $item]);
}
array_splice($data['messages'], $index, 1); saveMessages($file, $data);
funbikeJsonResponse(200, ['message' => 'Message supprimé.']);

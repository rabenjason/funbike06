<?php
// Configuration WhatsApp : les numéros non actifs ne sont visibles que par les administrateurs.
require_once __DIR__ . '/_lib/auth.php';
funbikeBootstrapApi();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if (!in_array($method, ['GET', 'PUT'], true)) funbikeJsonResponse(405, ['error' => 'Méthode non autorisée.']);
funbikeProtectWriteMethods($method);
$admin = $method === 'PUT' || ($_GET['admin'] ?? '') === '1';
if ($admin) funbikeRequireAdmin();
$dir = dirname(__DIR__) . '/storage/private';
if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) funbikeJsonResponse(500, ['error' => 'Stockage privé indisponible.']);
$file = $dir . '/whatsapp-settings.json';
$defaults = [
    'enabled' => false, 'askIntent' => true,
    'texts' => [
        'intentTitle' => 'Que souhaitez-vous demander ?', 'priceLabel' => 'Prix et disponibilité', 'infoLabel' => 'Informations',
        'choiceTitle' => 'Comment souhaitez-vous vous renseigner ?', 'siteLabel' => 'Via le site', 'whatsappLabel' => 'Par WhatsApp',
        'continueLabel' => 'Continuer sur WhatsApp',
        'priceTemplate' => "Bonjour, je souhaite connaître le prix et la disponibilité de {produit}.\n{lien}",
        'infoTemplate' => "Bonjour, je souhaite obtenir des informations sur {produit}.\n{lien}",
        'directTemplate' => "Bonjour, je souhaite me renseigner sur {produit}.\n{lien}"
    ],
    'sales' => ['activeId' => null, 'people' => []], 'parts' => ['activeId' => null, 'people' => []]
];
function validWhatsappData($data, $defaults) {
    if (!is_array($data) || !is_bool($data['enabled'] ?? null) || !is_bool($data['askIntent'] ?? null) || !is_array($data['texts'] ?? null)) return false;
    foreach ($defaults['texts'] as $key => $_) {
        $text = $data['texts'][$key] ?? null;
        $limit = strpos($key, 'Template') !== false ? 1200 : 120;
        if (!is_string($text) || trim($text) === '' || strlen($text) > $limit * 4 || !preg_match('//u', $text) || preg_match_all('/./us', $text) > $limit || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', $text)) return false;
        if (strpos($key, 'Template') !== false && (strpos($text, '{produit}') === false || strpos($text, '{lien}') === false)) return false;
    }
    foreach (['sales', 'parts'] as $team) {
        $group = $data[$team] ?? null;
        if (!is_array($group) || !array_key_exists('activeId', $group) || !is_array($group['people'] ?? null) || count($group['people']) > 30 || array_values($group['people']) !== $group['people']) return false;
        $ids = [];
        foreach ($group['people'] as $person) {
            if (!is_array($person) || !is_string($person['id'] ?? null) || !preg_match('/^[a-zA-Z0-9_-]{1,64}$/D', $person['id']) || isset($ids[$person['id']])) return false;
            $ids[$person['id']] = true;
            $name = $person['name'] ?? null; $phone = $person['phone'] ?? null;
            if (!is_string($name) || trim($name) === '' || strlen($name) > 320 || !preg_match('//u', $name) || preg_match_all('/./us', $name) > 80 || preg_match('/[\x00-\x1f\x7f]/', $name)) return false;
            if (!is_string($phone) || !preg_match('/^\+[0-9\s().-]+$/D', $phone) || !preg_match('/^[1-9][0-9]{7,14}$/D', preg_replace('/\D/', '', $phone))) return false;
        }
        if ($group['activeId'] !== null && (!is_string($group['activeId']) || !isset($ids[$group['activeId']]))) return false;
    }
    return true;
}
$current = $defaults;
if (file_exists($file)) {
    $raw = @file_get_contents($file); $current = $raw === false ? null : json_decode($raw, true);
    if (!validWhatsappData($current, $defaults)) funbikeJsonResponse(500, ['error' => 'Réglages WhatsApp invalides. Restaurez une sauvegarde.']);
}
// La révision ne sert qu'aux administrateurs : éviter son calcul pour chaque visiteur.
$revision = $admin ? hash('sha256', json_encode($current, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) : null;
if ($method === 'PUT') {
    $body = funbikeReadJsonBody();
    if (!is_string($body['revision'] ?? null) || !hash_equals($revision, $body['revision'])) funbikeJsonResponse(409, ['error' => 'Les réglages ont changé. Rechargez avant de réenregistrer.']);
    $next = $body['data'] ?? null;
    if (!validWhatsappData($next, $defaults)) funbikeJsonResponse(400, ['error' => 'Réglages invalides : vérifiez les numéros avec indicatif, les textes et les variables {produit} et {lien}.']);
    // Ne conserver que les champs connus et éviter de publier des champs arbitraires.
    $clean = ['enabled' => $next['enabled'], 'askIntent' => $next['askIntent'], 'texts' => array_intersect_key($next['texts'], $defaults['texts'])];
    foreach (['sales', 'parts'] as $team) {
        $clean[$team] = ['activeId' => $next[$team]['activeId'], 'people' => array_map(function ($person) { return ['id' => $person['id'], 'name' => trim($person['name']), 'phone' => trim($person['phone'])]; }, $next[$team]['people'])];
    }
    if (!funbikeAtomicWrite($file, json_encode($clean, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))) funbikeJsonResponse(500, ['error' => 'Impossible d’enregistrer les réglages.']);
    funbikeHistoryNote('Modification — WhatsApp', 'Réglages WhatsApp', 'Réglages et responsables modifiés.');
    funbikeJsonResponse(200, ['data' => $clean, 'revision' => hash('sha256', json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))]);
}
if ($admin) funbikeJsonResponse(200, ['data' => $current, 'revision' => $revision]);
$public = ['enabled' => $current['enabled'], 'askIntent' => $current['askIntent'], 'texts' => $current['texts']];
foreach (['sales', 'parts'] as $team) {
    $public[$team] = null;
    if ($current[$team]['activeId'] !== null) {
        foreach ($current[$team]['people'] as $person) if ($person['id'] === $current[$team]['activeId']) { $public[$team] = ['phone' => $person['phone']]; break; }
    }
}
funbikeJsonResponse(200, ['data' => $public]);

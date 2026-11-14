<?php
// Mesure d'audience interne. Désactivée tant que l'hébergement ne l'active pas.
require_once __DIR__ . '/_lib/auth.php';
funbikeBootstrapApi();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if (!in_array($method, ['GET', 'POST'], true)) funbikeJsonResponse(405, ['message' => 'Méthode non autorisée.']);
$enabled = getenv('FUNBIKE_OPENINGS_ENABLED') === '1';
$input = null;
if ($method === 'GET') funbikeRequireAdmin();
else {
    funbikeRequireTrustedOrigin();
    if (!$enabled) { http_response_code(204); exit; }
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 512) funbikeJsonResponse(413, ['message' => 'Requête trop volumineuse.']);
    $rawInput = file_get_contents('php://input', false, null, 0, 513);
    if ($rawInput === false || strlen($rawInput) > 512) funbikeJsonResponse(400, ['message' => 'Requête invalide.']);
    $input = json_decode($rawInput, true);
    if (!is_array($input) || !in_array($input['kind'] ?? null, ['opening', 'visitor'], true) ||
        (isset($input['id']) && (!is_string($input['id']) || !preg_match('/^[a-f0-9]{64}$/D', $input['id']))) ||
        ($input['kind'] === 'visitor' && !isset($input['id'])) || count(array_diff(array_keys($input), ['kind', 'id'])) !== 0) {
        funbikeJsonResponse(400, ['message' => 'Requête invalide.']);
    }
    // Anciennes pages encore en cache : ignorer leurs événements et identifiants visiteurs.
    if ($input['kind'] === 'visitor') { http_response_code(204); exit; }
    unset($input['id']);
}
$now = new DateTimeImmutable('now', new DateTimeZone('Indian/Antananarivo'));
$month = $now->format('Y-m');
$firstMonth = $now->modify('first day of this month')->modify('-35 months')->format('Y-m');
$dir = dirname(__DIR__) . '/storage/private';
// Nouvelle série : ne jamais supprimer ni mélanger les anciennes données d'ouvertures.
$file = $dir . '/site-audience.json';
if ($method === 'GET' && !file_exists($file)) funbikeJsonResponse(200, ['enabled' => $enabled, 'currentMonth' => $month, 'months' => [], 'years' => []]);
if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) funbikeJsonResponse(503, ['message' => 'Statistiques indisponibles.']);
$lock = @fopen($dir . '/site-audience.lock', 'c');
if (!$lock || !flock($lock, $method === 'POST' ? LOCK_EX : LOCK_SH)) funbikeJsonResponse(503, ['message' => 'Statistiques indisponibles.']);
try {
    $state = ['months' => [], 'limit' => ['minute' => 0, 'count' => 0]];
    if (file_exists($file)) {
        $raw = @file_get_contents($file);
        $state = $raw === false ? null : json_decode($raw, true);
        if (!is_array($state) || !isset($state['months'], $state['limit']) || !is_array($state['months']) || !is_array($state['limit']) || !is_int($state['limit']['minute'] ?? null) || !is_int($state['limit']['count'] ?? null) || $state['limit']['count'] < 0) throw new RuntimeException();
    }
    $months = [];
    foreach ($state['months'] as $key => $entry) {
        if (!is_string($key) || !preg_match('/^\d{4}-(0[1-9]|1[0-2])$/D', $key) || $key > $month || !is_array($entry) || !is_int($entry['count'] ?? null) || $entry['count'] < 0 || !is_array($entry['visitors'] ?? null) || count($entry['visitors']) > 50000) throw new RuntimeException();
        foreach ($entry['visitors'] as $hash) if (!is_string($hash) || !preg_match('/^[a-f0-9]{64}$/D', $hash)) throw new RuntimeException();
        if (count(array_unique($entry['visitors'])) !== count($entry['visitors'])) throw new RuntimeException();
        if ($key >= $firstMonth) $months[$key] = $entry;
    }
    ksort($months);
    if ($method === 'POST') {
        $minute = intdiv(time(), 60);
        $limit = $state['limit']['minute'] === $minute ? $state['limit']['count'] : 0;
        if ($limit < 120) {
            $entry = $months[$month] ?? ['count' => 0, 'visitors' => []];
            if ($input['kind'] === 'opening') {
                if ($entry['count'] >= PHP_INT_MAX) throw new RuntimeException();
                $entry['count']++;
            }
            $months[$month] = $entry;
            $json = json_encode(['months' => $months, 'limit' => ['minute' => $minute, 'count' => $limit + 1]], JSON_UNESCAPED_SLASHES);
            if ($json === false || !funbikeAtomicWrite($file, $json)) throw new RuntimeException();
        }
    }
} catch (Throwable $e) {
    flock($lock, LOCK_UN); fclose($lock);
    funbikeJsonResponse(503, ['message' => 'Statistiques indisponibles.']);
}
flock($lock, LOCK_UN); fclose($lock);
if ($method === 'POST') { http_response_code(204); exit; }
$rows = []; $years = [];
foreach ($months as $key => $entry) {
    $rows[] = ['month' => $key, 'count' => $entry['count'], 'visitors' => count($entry['visitors'])];
    $year = substr($key, 0, 4);
    if (!isset($years[$year])) $years[$year] = [];
    foreach ($entry['visitors'] as $hash) $years[$year][$hash] = true;
}
$annual = []; foreach ($years as $year => $visitors) $annual[] = ['year' => (string)$year, 'visitors' => count($visitors)];
funbikeJsonResponse(200, ['enabled' => $enabled, 'currentMonth' => $month, 'months' => $rows, 'years' => $annual]);

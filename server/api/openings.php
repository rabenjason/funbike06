<?php
// Mesure d'audience interne : IP et identifiants aléatoires, pseudonymisés chaque année.
require_once __DIR__ . '/_lib/auth.php';
funbikeBootstrapApi();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if (!in_array($method, ['GET', 'POST'], true)) funbikeJsonResponse(405, ['message' => 'Méthode non autorisée.']);
$enabled = getenv('FUNBIKE_OPENINGS_ENABLED') !== '0';
$input = null;
if ($method === 'GET') {
    $user = funbikeRequireAdmin();
    if (($user['role'] ?? 'admin') !== 'superadmin') funbikeJsonResponse(403, ['code' => 'SUPERADMIN_REQUIRED', 'message' => 'Seul le superadministrateur peut consulter les statistiques.']);
}
else {
    funbikeRequireTrustedOrigin();
    if (!$enabled) { http_response_code(204); exit; }
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 512) funbikeJsonResponse(413, ['message' => 'Requête trop volumineuse.']);
    $rawInput = file_get_contents('php://input', false, null, 0, 513);
    if ($rawInput === false || strlen($rawInput) > 512) funbikeJsonResponse(400, ['message' => 'Requête invalide.']);
    $input = json_decode($rawInput, true);
    if (!is_array($input) || !in_array($input['kind'] ?? null, ['opening', 'visitor'], true) ||
        (isset($input['id']) && (!is_string($input['id']) || !preg_match('/^[a-f0-9]{64}$/D', $input['id']))) ||
        ($input['kind'] === 'visitor' && !isset($input['id'])) ||
        (isset($input['browserId']) && (!is_string($input['browserId']) || !preg_match('/^[a-f0-9]{64}$/D', $input['browserId']))) || count(array_diff(array_keys($input), ['kind', 'id', 'browserId'])) !== 0) {
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
$file = $dir . '/site-ip-audience.json';
$keyFile = $dir . '/site-ip-audience-key.json';
if ($method === 'GET' && !file_exists($file)) funbikeJsonResponse(200, ['enabled' => $enabled, 'currentMonth' => $month, 'months' => [], 'years' => [], 'days' => []]);
if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) funbikeJsonResponse(503, ['message' => 'Statistiques indisponibles.']);
$lock = @fopen($dir . '/site-ip-audience.lock', 'c');
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
        if (array_key_exists('browsers', $entry)) {
            if (!is_array($entry['browsers']) || count($entry['browsers']) > 50000) throw new RuntimeException();
            foreach ($entry['browsers'] as $hash) if (!is_string($hash) || !preg_match('/^[a-f0-9]{64}$/D', $hash)) throw new RuntimeException();
            if (count(array_unique($entry['browsers'])) !== count($entry['browsers'])) throw new RuntimeException();
        }
        if (array_key_exists('days', $entry)) {
            if (!is_array($entry['days']) || count($entry['days']) > count($entry['visitors'])) throw new RuntimeException();
            $lastDay = $key === $month ? (int) $now->format('j') : (int) (new DateTimeImmutable($key . '-01', new DateTimeZone('Indian/Antananarivo')))->format('t');
            $maxMask = (1 << ($lastDay - 1)) | ((1 << ($lastDay - 1)) - 1);
            foreach ($entry['days'] as $index => $mask) {
                if (!is_int($index) || $index < 0 || !isset($entry['visitors'][$index]) || !is_int($mask) || $mask < 1 || $mask > $maxMask) throw new RuntimeException();
            }
        }
        if ($key >= $firstMonth) $months[$key] = $entry;
    }
    ksort($months);
    if ($method === 'POST') {
        $minute = intdiv(time(), 60);
        $limit = $state['limit']['minute'] === $minute ? $state['limit']['count'] : 0;
        if ($limit < 120) {
            // Ne jamais faire confiance aux en-têtes X-Forwarded-For fournis par le client.
            $ip = @inet_pton((string)($_SERVER['REMOTE_ADDR'] ?? ''));
            if ($ip === false) throw new RuntimeException();
            $year = $now->format('Y');
            $keyState = null;
            if (file_exists($keyFile)) {
                $keyState = json_decode((string)@file_get_contents($keyFile), true);
                if (!is_array($keyState) || !is_string($keyState['year'] ?? null) || !preg_match('/^\d{4}$/D', $keyState['year']) || !is_string($keyState['key'] ?? null) || !preg_match('/^[a-f0-9]{64}$/D', $keyState['key']) || $keyState['year'] > $year) throw new RuntimeException();
            }
            if (!$keyState || $keyState['year'] !== $year) {
                // Une clé perdue pendant une année ne doit pas créer des doubles silencieux.
                foreach ($months as $key => $value) if (substr($key, 0, 4) === $year && count($value['visitors']) > 0) throw new RuntimeException();
                $keyState = ['year' => $year, 'key' => bin2hex(random_bytes(32))];
                if (!funbikeAtomicWrite($keyFile, json_encode($keyState))) throw new RuntimeException();
                @chmod($keyFile, 0600);
            }
            $hash = hash_hmac('sha256', $ip, hex2bin($keyState['key']));
            $entry = $months[$month] ?? ['count' => 0, 'visitors' => []];
            $visitorIndex = array_search($hash, $entry['visitors'], true);
            if ($visitorIndex === false) {
                if (count($entry['visitors']) >= 50000) throw new RuntimeException();
                $entry['visitors'][] = $hash;
                $visitorIndex = array_key_last($entry['visitors']);
            }
            // Un masque compact indexé sur les empreintes mensuelles : un bit par jour.
            // Les anciens mois sans ce champ restent inchangés et non reconstitués.
            if (!is_int($visitorIndex) || $visitorIndex < 0) throw new RuntimeException();
            if (!isset($entry['days'])) $entry['days'] = [];
            $dayBit = 1 << ((int) $now->format('j') - 1);
            $entry['days'][$visitorIndex] = ($entry['days'][$visitorIndex] ?? 0) | $dayBit;
            if (isset($input['browserId'])) {
                $browserHash = hash_hmac('sha256', "browser:" . $input['browserId'], hex2bin($keyState['key']));
                if (!isset($entry['browsers'])) $entry['browsers'] = [];
                if (!in_array($browserHash, $entry['browsers'], true)) {
                    if (count($entry['browsers']) >= 50000) throw new RuntimeException();
                    $entry['browsers'][] = $browserHash;
                }
            }
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
$rows = []; $years = []; $days = [];
foreach ($months as $key => $entry) {
    $rows[] = ['month' => $key, 'count' => $entry['count'], 'visitors' => count($entry['visitors']), 'browsers' => isset($entry['browsers']) ? count($entry['browsers']) : null];
    $dailyCounts = [];
    foreach (($entry['days'] ?? []) as $mask) {
        for ($day = 1; $day <= 31; $day++) {
            if ($mask & (1 << ($day - 1))) $dailyCounts[$day] = ($dailyCounts[$day] ?? 0) + 1;
        }
    }
    ksort($dailyCounts);
    foreach ($dailyCounts as $day => $count) $days[] = ['date' => $key . '-' . str_pad((string) $day, 2, '0', STR_PAD_LEFT), 'visitors' => $count];
    $year = substr($key, 0, 4);
    if (!isset($years[$year])) $years[$year] = ['visitors' => [], 'browsers' => null];
    foreach ($entry['visitors'] as $hash) $years[$year]['visitors'][$hash] = true;
    if (isset($entry['browsers'])) {
        if ($years[$year]['browsers'] === null) $years[$year]['browsers'] = [];
        foreach ($entry['browsers'] as $hash) $years[$year]['browsers'][$hash] = true;
    }
}
$annual = [];
foreach ($years as $year => $entries) $annual[] = ['year' => (string)$year, 'visitors' => count($entries['visitors']), 'browsers' => $entries['browsers'] === null ? null : count($entries['browsers'])];
funbikeJsonResponse(200, ['enabled' => $enabled, 'currentMonth' => $month, 'months' => $rows, 'years' => $annual, 'days' => $days]);

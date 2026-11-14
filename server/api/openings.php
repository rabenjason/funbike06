<?php
// Comptage agrégé d'ouvertures du site. Désactivé tant que l'hébergement ne l'active pas explicitement.
require_once __DIR__ . '/_lib/auth.php';
funbikeBootstrapApi();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if (!in_array($method, ['GET', 'POST'], true)) funbikeJsonResponse(405, ['message' => 'Méthode non autorisée.']);
$enabled = getenv('FUNBIKE_OPENINGS_ENABLED') === '1';
if ($method === 'GET') funbikeRequireAdmin();
else {
    funbikeRequireTrustedOrigin();
    if (!$enabled) { http_response_code(204); exit; }
}
$now = new DateTimeImmutable('now', new DateTimeZone('Indian/Antananarivo'));
$month = $now->format('Y-m');
$firstMonth = $now->modify('first day of this month')->modify('-35 months')->format('Y-m');
$dir = dirname(__DIR__) . '/storage/private';
$file = $dir . '/site-openings.json';
if ($method === 'GET' && !file_exists($file)) funbikeJsonResponse(200, ['enabled' => $enabled, 'currentMonth' => $month, 'months' => []]);
if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) funbikeJsonResponse(503, ['message' => 'Statistiques indisponibles.']);
$lock = @fopen($dir . '/site-openings.lock', 'c');
if (!$lock || !flock($lock, $method === 'POST' ? LOCK_EX : LOCK_SH)) funbikeJsonResponse(503, ['message' => 'Statistiques indisponibles.']);
try {
    $state = ['months' => [], 'limit' => ['minute' => 0, 'count' => 0]];
    if (file_exists($file)) {
        $raw = @file_get_contents($file);
        $state = $raw === false ? null : json_decode($raw, true);
        if (!is_array($state) || !isset($state['months'], $state['limit']) || !is_array($state['months']) || !is_array($state['limit']) || !is_int($state['limit']['minute'] ?? null) || !is_int($state['limit']['count'] ?? null) || $state['limit']['count'] < 0) throw new RuntimeException();
        foreach ($state['months'] as $key => $count) {
            if (!is_string($key) || !preg_match('/^\d{4}-(0[1-9]|1[0-2])$/D', $key) || !is_int($count) || $count < 0) throw new RuntimeException();
        }
    }
    // Conserver au plus 36 mois glissants lors de la prochaine ouverture.
    $months = [];
    foreach ($state['months'] as $key => $count) {
        if ($key > $month) throw new RuntimeException(); // Horloge incohérente : ne pas effacer de données futures.
        if ($key >= $firstMonth) $months[$key] = $count;
    }
    ksort($months);
    if ($method === 'POST') {
        // Limite globale, sans adresse IP ni identifiant : évite les écritures illimitées.
        $minute = intdiv(time(), 60);
        $limit = $state['limit']['minute'] === $minute ? $state['limit']['count'] : 0;
        if ($limit < 120) {
            $value = $months[$month] ?? 0;
            if ($value >= PHP_INT_MAX) throw new RuntimeException();
            $months[$month] = $value + 1;
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
$rows = [];
foreach ($months as $key => $count) $rows[] = ['month' => $key, 'count' => $count];
funbikeJsonResponse(200, ['enabled' => $enabled, 'currentMonth' => $month, 'months' => $rows]);

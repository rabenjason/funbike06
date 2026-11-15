<?php
// Consultation réservée au superadmin, sans accès direct au stockage.
require_once __DIR__ . '/_lib/auth.php';
require_once __DIR__ . '/_lib/admin-history.php';
funbikeBootstrapApi();
funbikeRequireSuperAdmin();
if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') funbikeJsonResponse(405, ['error' => 'Méthode non autorisée.']);
$filters = [];
foreach (['account', 'type', 'from', 'to', 'q'] as $name) {
    $value = $_GET[$name] ?? '';
    if (!is_string($value) || strlen($value) > 200 || !preg_match('//u', $value)) funbikeJsonResponse(400, ['error' => 'Filtre invalide.']);
    $filters[$name] = trim($value);
}
foreach (['from', 'to'] as $name) if ($filters[$name] !== '') {
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $filters[$name], $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1])) funbikeJsonResponse(400, ['error' => 'Date invalide.']);
}
if ($filters['from'] !== '' && $filters['to'] !== '' && $filters['from'] > $filters['to']) funbikeJsonResponse(400, ['error' => 'La date de début est après la date de fin.']);
$page = $_GET['page'] ?? '1';
if (!is_string($page) || !preg_match('/^[1-9]\d{0,5}$/D', $page)) funbikeJsonResponse(400, ['error' => 'Page invalide.']);
try { $result = funbikeHistoryRead($filters, (int)$page); }
catch (Throwable $e) { error_log('FUNBIKE historique : ' . $e->getMessage()); funbikeJsonResponse(500, ['error' => 'Historique indisponible. Vérifiez le stockage privé.']); }
funbikeJsonResponse(200, $result);

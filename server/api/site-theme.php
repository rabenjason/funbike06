<?php
require_once __DIR__ . '/_lib/auth.php';
require_once __DIR__ . '/_lib/site-theme.php';
funbikeBootstrapApi();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if (!in_array($method, ['GET', 'PUT'], true)) funbikeJsonResponse(405, ['error' => 'Méthode non autorisée.']);
funbikeProtectWriteMethods($method);
funbikeRequireAdmin();
$current = funbikeSiteThemeRead();
if ($current === null) funbikeJsonResponse(500, ['error' => 'Réglage du thème invalide. Restaurez une sauvegarde.']);
$revision = funbikeSiteThemeRevision($current);
if ($method === 'GET') funbikeJsonResponse(200, ['data' => $current, 'revision' => $revision]);
$body = funbikeReadJsonBody();
if (!is_string($body['revision'] ?? null) || !hash_equals($revision, $body['revision'])) funbikeJsonResponse(409, ['error' => 'Le thème a changé. Rechargez avant de réenregistrer.']);
if (!in_array($body['theme'] ?? null, ['funbike', 'tvs'], true)) funbikeJsonResponse(400, ['error' => 'Thème invalide.']);
$data = ['theme' => $body['theme']];
$file = dirname(__DIR__) . '/storage/data/site-theme.json';
if (!funbikeAtomicWrite($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))) funbikeJsonResponse(500, ['error' => 'Impossible d’enregistrer le thème.']);
funbikeJsonResponse(200, ['data' => $data, 'revision' => funbikeSiteThemeRevision($data)]);

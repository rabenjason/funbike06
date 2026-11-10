<?php
require_once __DIR__ . '/_lib/auth.php';
require_once __DIR__ . '/_lib/chatbot-settings.php';
funbikeBootstrapApi();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if (!in_array($method, ['GET', 'PUT'], true)) funbikeJsonResponse(405, ['error' => 'Méthode non autorisée.']);
funbikeProtectWriteMethods($method);
funbikeRequireAdmin();
// Les lectures et écritures concurrentes ne doivent pas écraser un autre choix.
$dir = dirname(__DIR__) . '/storage/private';
if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) funbikeJsonResponse(500, ['error' => 'Stockage privé indisponible.']);
$lock = @fopen($dir . '/chatbot-settings.lock', 'c');
if (!$lock || !flock($lock, $method === 'PUT' ? LOCK_EX : LOCK_SH)) funbikeJsonResponse(500, ['error' => 'Réglage indisponible.']);
register_shutdown_function(function () use ($lock) { flock($lock, LOCK_UN); fclose($lock); });
$current = funbikeChatbotRead();
if ($current === null) funbikeJsonResponse(500, ['error' => 'Réglage du chatbot invalide. Restaurez une sauvegarde.']);
$revision = funbikeChatbotRevision($current);
if ($method === 'GET') funbikeJsonResponse(200, ['data' => $current, 'revision' => $revision]);
$body = funbikeReadJsonBody();
if (!is_string($body['revision'] ?? null) || !hash_equals($revision, $body['revision'])) funbikeJsonResponse(409, ['error' => 'Le réglage a changé. Rechargez avant de réenregistrer.']);
if (!array_key_exists('enabled', $body) || !is_bool($body['enabled'])) funbikeJsonResponse(400, ['error' => 'État du chatbot invalide.']);
$data = ['enabled' => $body['enabled']];
$file = dirname(__DIR__) . '/storage/data/chatbot-settings.json';
if (!funbikeAtomicWrite($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))) funbikeJsonResponse(500, ['error' => 'Impossible d’enregistrer le réglage.']);
funbikeJsonResponse(200, ['data' => $data, 'revision' => funbikeChatbotRevision($data)]);

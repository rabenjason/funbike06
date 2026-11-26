<?php
require_once __DIR__ . '/_lib/auth.php';
require_once __DIR__ . '/_lib/promotions-display.php';
funbikeBootstrapApi();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
funbikeProtectWriteMethods($method);
funbikeRequireAdmin();
if (!in_array($method, ['GET', 'PUT'], true)) funbikeJsonResponse(405, ['error' => 'Méthode non autorisée.']);
$current = funbikePromotionDisplayRead();
if ($current === null) funbikeJsonResponse(500, ['error' => 'Réglage d’affichage invalide. Restaurez une sauvegarde.']);
$revision = funbikePromotionDisplayRevision($current);
if ($method === 'GET') funbikeJsonResponse(200, ['data' => $current, 'revision' => $revision]);
$body = funbikeReadJsonBody();
if (!is_string($body['revision'] ?? null) || !hash_equals($revision, $body['revision'])) funbikeJsonResponse(409, ['error' => 'Le réglage a changé. Rechargez avant de réenregistrer.']);
$category = $body['preferredCategory'] ?? null;
if (!in_array($category, ['tous', 'motos', 'equipements', 'pieces'], true)) funbikeJsonResponse(400, ['error' => 'Catégorie invalide.']);
// Un ancien client qui ne connaît pas ce champ ne doit pas effacer le choix enregistré.
$showDescription = array_key_exists('showCardDescription', $body) ? $body['showCardDescription'] : $current['showCardDescription'];
if (!is_bool($showDescription)) funbikeJsonResponse(400, ['error' => 'Réglage des descriptions invalide.']);
// Les anciens clients conservent également la couleur enregistrée.
$priceColor = array_key_exists('originalPriceColor', $body) ? $body['originalPriceColor'] : $current['originalPriceColor'];
if (!is_string($priceColor) || !preg_match('/^(?:|#[0-9a-fA-F]{6})$/D', $priceColor)) funbikeJsonResponse(400, ['error' => 'Couleur du prix barré invalide.']);
$data = ['preferredCategory' => $category, 'showCardDescription' => $showDescription, 'originalPriceColor' => $priceColor];
$file = dirname(__DIR__) . '/storage/data/promotions-display.json';
if (!funbikeAtomicWrite($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))) funbikeJsonResponse(500, ['error' => 'Impossible d’enregistrer le réglage.']);
funbikeJsonResponse(200, ['data' => $data, 'revision' => funbikePromotionDisplayRevision($data)]);

<?php
// Modification ciblée d'une sélection de l'accueil, sans réécrire le produit.
require_once __DIR__ . '/_lib/auth.php';
funbikeBootstrapApi();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
funbikeProtectWriteMethods($method);
if ($method !== 'PUT') funbikeJsonResponse(405, ['error' => 'Méthode non autorisée.']);

$body = funbikeReadJsonBody();
$category = $body['categoryId'] ?? null;
$id = $body['id'] ?? null;
$field = $body['field'] ?? null;
$value = $body['value'] ?? null;
$files = [
    'motos' => 'motorcycles', 'casques' => 'helmets',
    'equipements' => 'riding-gear', 'pieces-detachees' => 'spare-parts'
];
$allowed = ['isNewArrival', 'isHomepageHero', 'isMotoAccueil', 'isEquipementAccueil'];
if (!is_string($category) || !isset($files[$category]) || !is_string($id) || $id === '' || !is_string($field) || !in_array($field, $allowed, true) || !is_bool($value)) {
    funbikeJsonResponse(400, ['error' => 'Sélection ou produit invalide.']);
}
if ((in_array($field, ['isHomepageHero', 'isMotoAccueil'], true) && $category !== 'motos') ||
    ($field === 'isEquipementAccueil' && !in_array($category, ['casques', 'equipements'], true))) {
    funbikeJsonResponse(400, ['error' => 'Ce produit ne peut pas être choisi pour cette section.']);
}
$file = dirname(__DIR__) . '/storage/data/products/' . $files[$category] . '.json';
$content = @file_get_contents($file);
$data = $content === false ? null : json_decode($content, true);
if (!is_array($data) || !isset($data['products']) || !is_array($data['products'])) {
    funbikeJsonResponse(500, ['error' => 'Données du catalogue indisponibles.']);
}
$found = false;
foreach ($data['products'] as &$product) {
    if (is_array($product) && ($product['id'] ?? null) === $id && ($product['categoryId'] ?? null) === $category) {
        $product[$field] = $value;
        $updated = $product;
        $found = true;
        break;
    }
}
unset($product);
if (!$found) funbikeJsonResponse(404, ['error' => 'Produit introuvable.']);
$encoded = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($encoded === false || !funbikeAtomicWrite($file, $encoded)) funbikeJsonResponse(500, ['error' => 'Impossible d’enregistrer la sélection.']);
funbikeJsonResponse(200, ['data' => $updated, 'message' => 'Sélection enregistrée.']);

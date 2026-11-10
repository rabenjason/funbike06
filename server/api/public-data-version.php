<?php
// Empreinte des sources lues par les API publiques du catalogue et des contacts.
// Aucun contenu ni chemin des données n'est renvoyé au visiteur.
require_once __DIR__ . '/_lib/auth.php';
funbikeBootstrapApi();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if ($method !== 'GET') funbikeJsonResponse(405, ['error' => 'Méthode non autorisée.']);
funbikeCatalogLock(false);

$server = dirname(__DIR__);
$dataFiles = [
    'brands.json' => 'brands', 'categories.json' => 'categories', 'families.json' => 'families',
    'product-types.json' => 'productTypes', 'models.json' => 'models',
    'products/motorcycles.json' => 'products', 'products/helmets.json' => 'products',
    'products/riding-gear.json' => 'products', 'products/spare-parts.json' => 'products',
    'dealers.json' => 'dealers', 'contacts.json' => 'contact',
];
$hash = hash_init('sha256');
hash_update($hash, "funbike-public-data-v1\0");
foreach ($dataFiles as $file => $key) {
    $content = @file_get_contents($server . '/storage/data/' . $file);
    if ($content === false) funbikeJsonResponse(500, ['error' => 'Données publiques indisponibles.']);
    $decoded = json_decode($content, true);
    if (!is_array($decoded) || !isset($decoded[$key]) || !is_array($decoded[$key])) funbikeJsonResponse(500, ['error' => 'Données publiques invalides.']);
    // Longueur et nom délimitent les fichiers pour éviter toute ambiguïté.
    hash_update($hash, $file . "\0" . strlen($content) . "\0" . $content);
}
// Une mise à jour du traitement des API peut modifier leurs réponses sans
// changement des JSON : invalider également l'empreinte dans ce cas.
$codeFiles = ['brands.php', 'categories.php', 'families.php', 'product-types.php', 'models.php',
    'products/motorcycles.php', 'products/helmets.php', 'products/riding-gear.php', 'products/spare-parts.php',
    'dealers.php', 'contacts.php', '_lib/catalog.php'];
foreach ($codeFiles as $file) {
    $content = @file_get_contents(__DIR__ . '/' . $file);
    if ($content === false) funbikeJsonResponse(500, ['error' => 'Service de vérification indisponible.']);
    hash_update($hash, $file . "\0" . strlen($content) . "\0" . $content);
}
funbikeJsonResponse(200, ['version' => hash_final($hash)]);

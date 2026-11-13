<?php
// Nettoyage explicite des anciens fichiers de photos d'un seul produit.
require_once dirname(__DIR__) . '/_lib/auth.php';
funbikeBootstrapApi();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
funbikeProtectWriteMethods($method);
if ($method === 'GET') funbikeRequireAdmin();
if (!in_array($method, ['GET', 'POST'], true)) funbikeJsonResponse(405, ['message' => 'Méthode non autorisée.']);
$body = $method === 'POST' ? funbikeReadJsonBody() : $_GET;
$categories = ['motos' => 'motorcycles', 'casques' => 'helmets', 'equipements' => 'riding-gear', 'pieces-detachees' => 'spare-parts'];
$category = $body['categoryId'] ?? null;
$id = $body['productId'] ?? null;
if (!is_string($category) || !isset($categories[$category]) || !is_string($id) || !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $id)) funbikeJsonResponse(400, ['message' => 'Produit invalide.']);
$name = $categories[$category];
$base = dirname(__DIR__, 2);
$dataDir = $base . '/storage/data';
$jsonFile = $dataDir . '/products/' . $name . '.json';
$raw = @file_get_contents($jsonFile);
$data = $raw === false ? null : json_decode($raw, true);
if (!is_array($data) || !isset($data['products']) || !is_array($data['products'])) funbikeJsonResponse(500, ['message' => 'Impossible de lire les données du produit.']);
$found = false;
foreach ($data['products'] as $product) if (($product['id'] ?? null) === $id) { $found = true; break; }
if (!$found) funbikeJsonResponse(404, ['message' => 'Produit introuvable.']);

function cleanupHasReference($value, $url) {
    if (is_string($value)) {
        // Les URL absolues ou relatives, encodées ou de casse différente peuvent désigner le même fichier.
        $value = str_replace('\\', '/', rawurldecode(html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8')));
        return stripos($value, ltrim($url, '/')) !== false;
    }
    if (!is_array($value)) return false;
    foreach ($value as $key => $item) if ((is_string($key) && cleanupHasReference($key, $url)) || cleanupHasReference($item, $url)) return true;
    return false;
}
// Tout fichier JSON doit pouvoir être inspecté. Un doute bloque le nettoyage.
$datasets = [];
try {
    if (is_link($dataDir)) throw new RuntimeException();
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dataDir, FilesystemIterator::SKIP_DOTS));
    foreach ($iterator as $file) {
        if ($file->isLink()) throw new RuntimeException();
        if (!$file->isFile() || strtolower($file->getExtension()) !== 'json') continue;
        $content = @file_get_contents($file->getPathname());
        if ($content === false) throw new RuntimeException();
        $decoded = json_decode($content, true);
        if (json_last_error() !== JSON_ERROR_NONE) throw new RuntimeException();
        $datasets[] = $decoded;
    }
} catch (Throwable $e) { funbikeJsonResponse(500, ['message' => 'Impossible de vérifier toutes les données. Aucun fichier supprimé.']); }

// Parcours exact, sans liens symboliques ; une absence n'est acceptée que si le parent est lisible.
$dir = $base;
$exists = true;
foreach (['uploads', 'products', $name, $id] as $part) {
    if (is_link($dir) || !is_dir($dir) || ($entries = @scandir($dir)) === false) funbikeJsonResponse(500, ['message' => 'Dossier des photos inaccessible. Aucun fichier supprimé.']);
    if (!in_array($part, $entries, true)) { $exists = false; break; }
    $dir .= '/' . $part;
    if (is_link($dir)) funbikeJsonResponse(409, ['message' => 'Dossier des photos non autorisé. Aucun fichier supprimé.']);
}
$removable = [];
$referenced = [];
$ignored = 0;
if ($exists) {
    $realDir = realpath($dir);
    $entries = @scandir($dir);
    if ($realDir === false || !is_dir($dir) || $entries === false) funbikeJsonResponse(500, ['message' => 'Dossier des photos inaccessible. Aucun fichier supprimé.']);
    foreach ($entries as $filename) {
        if ($filename === '.' || $filename === '..') continue;
        // Seulement les noms générés par les API produits, y compris les anciens noms.
        if (!preg_match('/^(?:main(?:-[a-f0-9]{16})?|image-[0-9]+(?:-[a-f0-9]{16})?)\.(?:jpg|jpeg|png|webp)$/iD', $filename)) { $ignored++; continue; }
        $path = $dir . '/' . $filename;
        $realPath = realpath($path);
        if (is_link($path) || $realPath === false || dirname($realPath) !== $realDir || !is_file($realPath)) { $ignored++; continue; }
        $url = '/server/uploads/products/' . $name . '/' . $id . '/' . $filename;
        $used = false;
        foreach ($datasets as $dataset) if (cleanupHasReference($dataset, $url)) { $used = true; break; }
        $entry = ['name' => $filename, 'url' => $url, 'size' => filesize($realPath) ?: 0];
        if ($used) $referenced[] = $entry;
        else $removable[] = $entry;
    }
}
if ($method === 'GET') funbikeJsonResponse(200, ['removable' => $removable, 'referenced' => $referenced, 'ignored' => $ignored]);
$requested = $body['files'] ?? null;
if (!is_array($requested) || !count($requested) || count($requested) > 500) funbikeJsonResponse(400, ['message' => 'Sélection de fichiers invalide.']);
foreach ($requested as $filename) if (!is_string($filename)) funbikeJsonResponse(400, ['message' => 'Sélection de fichiers invalide.']);
if (count(array_unique($requested)) !== count($requested)) funbikeJsonResponse(400, ['message' => 'Sélection de fichiers invalide.']);
$allowed = [];
foreach ($removable as $file) $allowed[$file['name']] = true;
foreach ($requested as $filename) {
    if (!is_string($filename) || !isset($allowed[$filename])) funbikeJsonResponse(409, ['message' => 'La liste a changé ou un fichier est utilisé. Vérifiez à nouveau : aucun fichier supprimé.']);
}
$deleted = [];
$failed = [];
foreach ($requested as $filename) {
    $path = $dir . '/' . $filename;
    // Revérifier avant chaque suppression ; ne jamais suivre de lien symbolique.
    $actual = realpath($path);
    if (is_link($path) || $actual === false || dirname($actual) !== $realDir || !is_file($actual) || !@unlink($actual)) $failed[] = $filename;
    else $deleted[] = $filename;
}
funbikeJsonResponse(200, ['deleted' => $deleted, 'failed' => $failed]);

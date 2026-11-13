<?php
// Suppression d'une seule photo enregistrée, jamais d'un chemin libre.
require_once dirname(__DIR__) . '/_lib/auth.php';
funbikeBootstrapApi();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
funbikeProtectWriteMethods($method);
if ($method !== 'DELETE') funbikeJsonResponse(405, ['message' => 'Méthode non autorisée.']);
$body = funbikeReadJsonBody();
$categories = ['motos' => 'motorcycles', 'casques' => 'helmets', 'equipements' => 'riding-gear', 'pieces-detachees' => 'spare-parts'];
$category = $body['categoryId'] ?? null;
$id = $body['productId'] ?? null;
$url = $body['url'] ?? null;
if (!is_string($category) || !isset($categories[$category]) || !is_string($id) || !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $id) || !is_string($url)) {
    funbikeJsonResponse(400, ['message' => 'Photo ou produit invalide.']);
}
$name = $categories[$category];
$base = dirname(__DIR__, 2);
$dataDir = $base . '/storage/data';
$jsonFile = $dataDir . '/products/' . $name . '.json';
$prefix = '/server/uploads/products/' . $name . '/' . $id . '/';
$filename = substr($url, strlen($prefix));
if (strpos($url, $prefix) !== 0 || !preg_match('/^[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/iD', $filename)) {
    funbikeJsonResponse(409, ['message' => 'Cette photo ne se trouve pas dans le dossier du produit. Aucune suppression effectuée.']);
}
$dir = $base . '/uploads/products/' . $name . '/' . $id;
$path = $dir . '/' . $filename;
foreach ([$base . '/uploads', $base . '/uploads/products', $base . '/uploads/products/' . $name, $dir, $path] as $part) {
    if (is_link($part)) funbikeJsonResponse(409, ['message' => 'Chemin de photo non autorisé. Aucune suppression effectuée.']);
}
$realDir = realpath($dir);
$realPath = realpath($path);
if ($realDir === false || $realPath === false || dirname($realPath) !== $realDir || !is_file($realPath)) {
    funbikeJsonResponse(409, ['message' => 'Fichier introuvable ou inaccessible. Aucune suppression effectuée.']);
}
$raw = @file_get_contents($jsonFile);
$data = $raw === false ? null : json_decode($raw, true);
if (!is_array($data) || !isset($data['products']) || !is_array($data['products'])) funbikeJsonResponse(500, ['message' => 'Données du produit indisponibles. Aucune suppression effectuée.']);
$found = false;
foreach ($data['products'] as &$product) {
    if (($product['id'] ?? null) !== $id) continue;
    if (!isset($product['images']) || !is_array($product['images'])) break;
    foreach ($product['images'] as $index => $image) {
        if (($image['url'] ?? null) === $url) {
            array_splice($product['images'], $index, 1);
            $found = true;
            break;
        }
    }
    if ($found) {
        foreach ($product['images'] as $index => &$image) {
            $image['position'] = $index;
            $image['isMain'] = $index === 0;
            $image['id'] = $id . '-image-' . ($index + 1);
        }
        unset($image);
        $product['updatedAt'] = date('c');
    }
    break;
}
unset($product);
if (!$found) funbikeJsonResponse(404, ['message' => 'Photo non trouvée sur cette fiche. Rechargez la page.']);
function photoContainsReference($value, $url) {
    if (is_string($value)) return strpos($value, $url) !== false;
    if (!is_array($value)) return false;
    foreach ($value as $key => $item) if ((is_string($key) && strpos($key, $url) !== false) || photoContainsReference($item, $url)) return true;
    return false;
}
// Tester les données après retrait de l'entrée concernée. Un doute bloque toute suppression.
try {
    if (is_link($dataDir)) throw new RuntimeException();
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dataDir, FilesystemIterator::SKIP_DOTS));
    foreach ($files as $file) {
        if ($file->isLink()) throw new RuntimeException();
        if (!$file->isFile() || strtolower($file->getExtension()) !== 'json') continue;
        if ($file->getPathname() === $jsonFile) $decoded = $data;
        else {
            $content = @file_get_contents($file->getPathname());
            if ($content === false) throw new RuntimeException();
            $decoded = json_decode($content, true);
            if (json_last_error() !== JSON_ERROR_NONE) throw new RuntimeException();
        }
        if (photoContainsReference($decoded, $url)) funbikeJsonResponse(409, ['message' => 'Cette photo est encore utilisée dans les données du site. Aucune suppression effectuée.']);
    }
} catch (Throwable $e) {
    funbikeJsonResponse(500, ['message' => 'Impossible de vérifier les données du site. Aucune suppression effectuée.']);
}
$encoded = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($encoded === false || !funbikeAtomicWrite($jsonFile, $encoded)) funbikeJsonResponse(500, ['message' => 'Impossible de mettre à jour la fiche. Aucune suppression effectuée.']);
// Si l'effacement échoue, la fiche reste à jour et l'admin est averti sans risque de faux succès.
$deleted = @unlink($realPath);
funbikeJsonResponse(200, ['success' => true, 'deleted' => $deleted, 'message' => $deleted ? 'Photo supprimée.' : 'La photo a été retirée de la fiche, mais le fichier reste sur le serveur : vérifiez les permissions.']);

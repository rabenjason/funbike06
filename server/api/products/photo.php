<?php
// Retrait d'une photo d'une fiche. Aucun chemin fourni par le client n'est effacé directement.
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
$imageId = $body['imageId'] ?? null; // Facultatif pour les anciennes versions du front.
if (!is_string($category) || !isset($categories[$category]) || !is_string($id) || !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $id) || !is_string($url) || $url === '' || strlen($url) > 4096 || ($imageId !== null && (!is_string($imageId) || $imageId === ''))) {
    funbikeJsonResponse(400, ['message' => 'Photo ou produit invalide.']);
}
$name = $categories[$category];
$base = dirname(__DIR__, 2);
$dataDir = $base . '/storage/data';
$jsonFile = $dataDir . '/products/' . $name . '.json';
$raw = @file_get_contents($jsonFile);
$data = $raw === false ? null : json_decode($raw, true);
if (!is_array($data) || !isset($data['products']) || !is_array($data['products'])) funbikeJsonResponse(500, ['message' => 'Données du produit indisponibles. Aucune modification effectuée.']);
$found = false;
$renumbered = [];
foreach ($data['products'] as &$product) {
    if (($product['id'] ?? null) !== $id) continue;
    if (!isset($product['images']) || !is_array($product['images'])) break;
    $matches = [];
    foreach ($product['images'] as $index => $image) {
        if (($image['url'] ?? null) === $url && ($imageId === null || ($image['id'] ?? null) === $imageId)) $matches[] = $index;
    }
    if ($imageId !== null && count($matches) > 1) funbikeJsonResponse(409, ['message' => 'Photo ambiguë. Rechargez la fiche avant de réessayer.']);
    if ($matches) {
        array_splice($product['images'], $matches[0], 1);
        $found = true;
        foreach ($product['images'] as $index => &$image) {
            $oldId = $image['id'] ?? null;
            $image['position'] = $index;
            $image['isMain'] = $index === 0;
            $image['id'] = $id . '-image-' . ($index + 1);
            $renumbered[] = ['oldId' => $oldId, 'url' => $image['url'] ?? null, 'id' => $image['id'], 'position' => $index];
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
// Si le chemin n'appartient pas au produit ou ne peut être vérifié, on ne touche pas au fichier.
$prefix = '/server/uploads/products/' . $name . '/' . $id . '/';
$filename = strpos($url, $prefix) === 0 ? substr($url, strlen($prefix)) : '';
$fileStatus = 'external';
$realPath = null;
if (preg_match('/^[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/iD', $filename)) {
    $fileStatus = 'unverified';
    $parent = $base;
    $parts = ['uploads', 'products', $name, $id, $filename];
    foreach ($parts as $index => $part) {
        // Un répertoire illisible ne prouve pas que le fichier est absent.
        if (is_link($parent) || !is_dir($parent) || ($entries = @scandir($parent)) === false) break;
        if (!in_array($part, $entries, true)) { $fileStatus = 'missing'; break; }
        $next = $parent . '/' . $part;
        if (is_link($next)) break;
        if ($index === count($parts) - 1) {
            $realDir = realpath($parent);
            $candidate = realpath($next);
            if ($realDir !== false && $candidate !== false && dirname($candidate) === $realDir && is_file($candidate)) {
                $realPath = $candidate;
                $fileStatus = 'candidate';
            }
        } else $parent = $next;
    }
}
if ($fileStatus === 'candidate') {
    // Vérifier l'ensemble des données avant tout effacement. Un doute conserve le fichier.
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
            if (photoContainsReference($decoded, $url)) { $fileStatus = 'shared'; break; }
        }
    } catch (Throwable $e) { $fileStatus = 'unverified'; }
}
$encoded = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($encoded === false || !funbikeAtomicWrite($jsonFile, $encoded)) funbikeJsonResponse(500, ['message' => 'Impossible de mettre à jour la fiche. Aucune modification effectuée.']);
if ($fileStatus === 'candidate') $fileStatus = @unlink($realPath) ? 'deleted' : 'failed';
$messages = [
    'deleted' => 'Photo retirée et fichier supprimé définitivement.',
    'missing' => 'Photo retirée de la fiche : le fichier était déjà absent.',
    'shared' => 'Photo retirée de cette fiche. Le fichier reste sur le serveur car il est encore utilisé ailleurs.',
    'external' => 'Photo retirée de cette fiche. Son fichier externe ou hors du dossier du produit a été conservé.',
    'unverified' => 'Photo retirée de cette fiche. Le fichier a été conservé car sa situation ou ses autres usages ne peuvent pas être vérifiés.',
    'failed' => 'Photo retirée de cette fiche, mais le fichier reste sur le serveur : vérifiez les permissions.',
];
funbikeJsonResponse(200, ['success' => true, 'deleted' => $fileStatus === 'deleted', 'fileStatus' => $fileStatus, 'message' => $messages[$fileStatus], 'renumbered' => $renumbered]);

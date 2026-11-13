<?php
// Gestion des photos produit : retrait immédiat et nettoyage explicite des anciens fichiers.
require_once dirname(__DIR__) . '/_lib/auth.php';
funbikeBootstrapApi();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
funbikeProtectWriteMethods($method);
$action = $_GET['action'] ?? '';
$isCleanup = $action === 'cleanup';
if (!(($isCleanup && in_array($method, ['GET', 'POST'], true)) || ($action === '' && $method === 'DELETE'))) {
    funbikeJsonResponse(405, ['message' => 'Méthode non autorisée.']);
}
if ($method === 'GET') funbikeRequireAdmin();
$body = $method === 'GET' ? $_GET : funbikeReadJsonBody();
$categories = ['motos' => 'motorcycles', 'casques' => 'helmets', 'equipements' => 'riding-gear', 'pieces-detachees' => 'spare-parts'];
$category = $body['categoryId'] ?? null;
$id = $body['productId'] ?? null;
if (!is_string($category) || !isset($categories[$category]) || !is_string($id) || !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $id)) {
    funbikeJsonResponse(400, ['message' => 'Photo ou produit invalide.']);
}
$name = $categories[$category];
$base = dirname(__DIR__, 2);
$dataDir = $base . '/storage/data';
$jsonFile = $dataDir . '/products/' . $name . '.json';
$raw = @file_get_contents($jsonFile);
$data = $raw === false ? null : json_decode($raw, true);
if (!is_array($data) || !isset($data['products']) || !is_array($data['products'])) funbikeJsonResponse(500, ['message' => 'Données du produit indisponibles. Aucune modification effectuée.']);

function photoContainsReference($value, $url) {
    if (is_string($value)) {
        // Les URL absolues ou relatives, encodées ou de casse différente peuvent désigner le même fichier.
        $value = str_replace('\\', '/', rawurldecode(html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8')));
        return stripos($value, ltrim($url, '/')) !== false;
    }
    if (!is_array($value)) return false;
    foreach ($value as $key => $item) if ((is_string($key) && photoContainsReference($key, $url)) || photoContainsReference($item, $url)) return true;
    return false;
}
// Vérification et nettoyage des photos déjà retirées de la fiche.
if ($isCleanup) {
    $found = false;
    foreach ($data['products'] as $product) if (($product['id'] ?? null) === $id) { $found = true; break; }
    if (!$found) funbikeJsonResponse(404, ['message' => 'Produit introuvable.']);
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
            foreach ($datasets as $dataset) if (photoContainsReference($dataset, $url)) { $used = true; break; }
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
}

// Retrait d'une seule photo enregistrée ; le client ne choisit jamais un chemin libre à effacer.
$url = $body['url'] ?? null;
$imageId = $body['imageId'] ?? null; // Facultatif pour les anciennes versions du front.
if (!is_string($url) || $url === '' || strlen($url) > 4096 || ($imageId !== null && (!is_string($imageId) || $imageId === ''))) {
    funbikeJsonResponse(400, ['message' => 'Photo ou produit invalide.']);
}
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
        $productDataPath = realpath($jsonFile);
        if ($productDataPath === false) throw new RuntimeException();
        $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dataDir, FilesystemIterator::SKIP_DOTS));
        foreach ($files as $file) {
            if ($file->isLink()) throw new RuntimeException();
            if (!$file->isFile() || strtolower($file->getExtension()) !== 'json') continue;
            $filePath = $file->getRealPath();
            if ($filePath === false) throw new RuntimeException();
            // L'itérateur utilise des séparateurs natifs (\ sous Windows),
            // tandis que $jsonFile peut mélanger / et \. Comparer les chemins réels.
            $sameFile = PHP_OS_FAMILY === 'Windows' ? strcasecmp($filePath, $productDataPath) === 0 : $filePath === $productDataPath;
            if ($sameFile) $decoded = $data;
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

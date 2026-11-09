<?php
// Textes et liens publics de l'accueil. Les données réelles sont créées au
// premier enregistrement et ne doivent jamais être remplacées au déploiement.
require_once __DIR__ . '/_lib/auth.php';
require_once __DIR__ . '/_lib/sherco-banner.php';
funbikeBootstrapApi();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
funbikeProtectWriteMethods($method);
if (!in_array($method, ['GET', 'PUT'], true)) funbikeJsonResponse(405, ['error' => 'Méthode non autorisée.']);

$defaultFile = __DIR__ . '/_lib/homepage-defaults.json';
$file = dirname(__DIR__) . '/storage/data/homepage.json';
function homepageRead($file) {
    $raw = @file_get_contents($file);
    $value = $raw === false ? null : json_decode($raw, true);
    if (!is_array($value) || !isset($value['content'], $value['links'], $value['exclusiveBrands']) || !is_array($value['content']) || !is_array($value['links']) || !is_array($value['exclusiveBrands'])) {
        funbikeJsonResponse(500, ['error' => 'Contenu de l’accueil indisponible ou invalide. Restaurez une sauvegarde.']);
    }
    return $value;
}
function homepageRevision($data) {
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) funbikeJsonResponse(500, ['error' => 'Contenu de l’accueil invalide.']);
    return hash('sha256', $json);
}
function homepageText($value, $max, $label) {
    if (!is_string($value) || trim($value) === '' || strlen($value) > $max || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f]/', $value)) {
        funbikeJsonResponse(400, ['error' => 'Champ invalide : ' . $label . '.']);
    }
    return trim($value);
}
function homepageBrandId($value, $required = false) {
    if (!is_string($value) || ($required && $value === '') || ($value !== '' && !preg_match('/^[a-z0-9][a-z0-9_-]{0,99}$/', $value))) {
        funbikeJsonResponse(400, ['error' => 'Marque invalide.']);
    }
    return $value;
}
function homepageValidate($input, $defaults) {
    if (!is_array($input) || !isset($input['content'], $input['links'], $input['exclusiveBrands']) || !is_array($input['content']) || !is_array($input['links']) || !is_array($input['exclusiveBrands'])) funbikeJsonResponse(400, ['error' => 'Contenu incomplet.']);
    $clean = ['content' => [], 'links' => [], 'exclusiveBrands' => []];
    foreach ($defaults['content'] as $section => $fields) {
        if (!isset($input['content'][$section]) || !is_array($input['content'][$section])) funbikeJsonResponse(400, ['error' => 'Section manquante : ' . $section]);
        foreach ($fields as $key => $example) {
            $value = $input['content'][$section][$key] ?? null;
            if (is_array($example)) {
                if (!is_array($value) || count($value) < 1 || count($value) > 10) funbikeJsonResponse(400, ['error' => 'Ajoutez entre 1 et 10 usages.']);
                $clean['content'][$section][$key] = array_values(array_map(function ($v) { return homepageText($v, 200, 'usage'); }, $value));
            } else {
                $clean['content'][$section][$key] = homepageText($value, $key === 'description' || $key === 'descriptionSansMarques' ? 2000 : 500, $section . ' / ' . $key);
            }
        }
    }
    if (count($input['links']) < 1 || count($input['links']) > 8) funbikeJsonResponse(400, ['error' => 'Ajoutez entre 1 et 8 liens.']);
    foreach ($input['links'] as $link) {
        if (!is_array($link) || !in_array($link['to'] ?? null, ['catalogue', 'motos', 'equipements', 'spares', 'revendeurs', 'contact'], true) || !in_array($link['icon'] ?? null, ['moto', 'helmet', 'parts', 'gear'], true)) funbikeJsonResponse(400, ['error' => 'Destination ou icône invalide.']);
        $brandId = homepageBrandId($link['brandId'] ?? null);
        if ($brandId !== '' && !in_array($link['to'], ['motos', 'equipements', 'spares'], true)) funbikeJsonResponse(400, ['error' => 'Ce lien ne peut pas filtrer par marque.']);
        $clean['links'][] = ['title' => homepageText($link['title'] ?? null, 400, 'titre du lien'), 'to' => $link['to'], 'brandId' => $brandId, 'icon' => $link['icon']];
    }
    if (count($input['exclusiveBrands']) > 6) funbikeJsonResponse(400, ['error' => 'Six marques officielles maximum.']);
    $seen = [];
    foreach ($input['exclusiveBrands'] as $brand) {
        if (!is_array($brand)) funbikeJsonResponse(400, ['error' => 'Marque officielle invalide.']);
        $id = homepageBrandId($brand['brandId'] ?? null, true);
        if (isset($seen[$id])) funbikeJsonResponse(400, ['error' => 'Une marque officielle ne peut apparaître deux fois.']);
        $seen[$id] = true;
        $clean['exclusiveBrands'][] = ['brandId' => $id, 'tagline' => homepageText($brand['tagline'] ?? null, 400, 'slogan de marque')];
    }
    return $clean;
}
$defaults = homepageRead($defaultFile);
$current = homepageRead(file_exists($file) ? $file : $defaultFile);
// Les nouveaux champs éditoriaux reçoivent leur valeur initiale, sans jamais
// remplacer les champs déjà enregistrés ni réécrire le fichier à la lecture.
foreach ($defaults['content'] as $section => $fields) {
    if (!array_key_exists($section, $current['content'])) $current['content'][$section] = [];
    if (!is_array($current['content'][$section])) funbikeJsonResponse(500, ['error' => 'Section de l’accueil invalide. Restaurez une sauvegarde.']);
    foreach ($fields as $key => $value) {
        if (!array_key_exists($key, $current['content'][$section])) $current['content'][$section][$key] = $value;
    }
}
$revision = homepageRevision($current);
if ($method === 'GET') {
    $banner = funbikeShercoBannerRead();
    funbikeJsonResponse(200, ['data' => $current, 'revision' => $revision, 'shercoBannerConfigured' => $banner !== null && !($banner['legacy'] ?? false), 'shercoBannerImage' => funbikeShercoBannerSelected($banner)]);
}
if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 65536) funbikeJsonResponse(413, ['error' => 'Contenu trop volumineux.']);
$raw = file_get_contents('php://input', false, null, 0, 65537);
if ($raw === false || strlen($raw) > 65536) funbikeJsonResponse(413, ['error' => 'Contenu trop volumineux.']);
if (!is_object(json_decode($raw))) funbikeJsonResponse(400, ['error' => 'Format JSON invalide.']);
$body = json_decode($raw, true);
if (!is_string($body['revision'] ?? null) || !hash_equals($revision, $body['revision'])) funbikeJsonResponse(409, ['error' => 'Le contenu a changé depuis votre ouverture. Rechargez-le avant de réenregistrer.']);
$clean = homepageValidate($body['data'] ?? null, $defaults);
$encoded = json_encode($clean, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($encoded === false || !funbikeAtomicWrite($file, $encoded)) funbikeJsonResponse(500, ['error' => 'Impossible d’enregistrer le contenu.']);
funbikeJsonResponse(200, ['data' => $clean, 'revision' => homepageRevision($clean), 'message' => 'Contenu de l’accueil enregistré.']);

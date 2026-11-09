<?php
// Bibliothèque locale du bandeau Sherco. Le catalogue est privé ; seuls les
// fichiers image sont publics. Toutes les opérations utilisent le verrou global.
function funbikeShercoBannerRead()
{
    $file = dirname(__DIR__, 2) . '/storage/data/sherco-banner.json';
    if (!file_exists($file)) return null; // Installation existante : ne rien écrire.
    $raw = @file_get_contents($file);
    $data = $raw === false ? null : json_decode($raw, true);
    if (!is_array($data) || !isset($data['images']) || !is_array($data['images']) || !array_key_exists('selected', $data) || (!is_null($data['selected']) && !is_string($data['selected']))) {
        funbikeJsonResponse(500, ['error' => 'Bibliothèque de la bannière indisponible ou invalide. Restaurez une sauvegarde.']);
    }
    $ids = [];
    foreach ($data['images'] as $image) {
        if (!is_array($image) || !is_string($image['id'] ?? null) || !preg_match('/^[a-f0-9]{32}$/D', $image['id']) || !is_string($image['url'] ?? null) || !preg_match('#^/server/uploads/homepage/sherco-[a-f0-9]{32}\.(jpg|png|webp)$#D', $image['url']) || strpos($image['url'], 'sherco-' . $image['id'] . '.') === false || isset($ids[$image['id']])) {
            funbikeJsonResponse(500, ['error' => 'Bibliothèque de la bannière invalide. Restaurez une sauvegarde.']);
        }
        $ids[$image['id']] = true;
    }
    if ($data['selected'] !== null && !isset($ids[$data['selected']])) funbikeJsonResponse(500, ['error' => 'Image sélectionnée introuvable. Restaurez une sauvegarde.']);
    if (isset($data['legacy']) && (!is_bool($data['legacy']) || ($data['legacy'] && $data['selected'] !== null))) funbikeJsonResponse(500, ['error' => 'Configuration de bannière invalide. Restaurez une sauvegarde.']);
    return $data;
}

function funbikeShercoBannerSelected($data)
{
    if ($data === null) return null;
    foreach ($data['images'] as $image) if ($image['id'] === $data['selected']) return $image['url'];
    return null;
}

function funbikeShercoBannerWrite($data)
{
    $encoded = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false || !funbikeAtomicWrite(dirname(__DIR__, 2) . '/storage/data/sherco-banner.json', $encoded)) {
        funbikeJsonResponse(500, ['error' => 'Impossible d’enregistrer la bibliothèque.']);
    }
}

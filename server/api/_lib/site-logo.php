<?php
// Le logo d'origine ne figure jamais parmi les fichiers supprimables.
const FUNBIKE_DEFAULT_SITE_LOGO = '/server/public/assets/company/logo-funbike-720-a3ab2dc4.png';
function funbikeSiteLogoRead() {
    $file = dirname(__DIR__, 2) . '/storage/data/site-logo.json';
    if (!file_exists($file)) return ['images' => [], 'selected' => null];
    $raw = @file_get_contents($file);
    $data = $raw === false ? null : json_decode($raw, true);
    if (!is_array($data) || !isset($data['images']) || !is_array($data['images']) || !array_key_exists('selected', $data) || ($data['selected'] !== null && !is_string($data['selected'])) || count($data['images']) > 40) return null;
    $ids = [];
    foreach ($data['images'] as $image) {
        if (!is_array($image) || !is_string($image['id'] ?? null) || !preg_match('/^[a-f0-9]{32}$/D', $image['id']) || !is_string($image['url'] ?? null) || !preg_match('#^/server/uploads/site-logo/logo-' . preg_quote($image['id'], '#') . '[.](jpg|png|webp)$#D', $image['url']) || isset($ids[$image['id']]) || (array_key_exists('name', $image) && (!is_string($image['name']) || trim($image['name']) === '' || strlen($image['name']) > 240 || preg_match('/[\x00-\x1f\x7f]/', $image['name'])))) return null;
        $ids[$image['id']] = true;
    }
    if ($data['selected'] !== null && !isset($ids[$data['selected']])) return null;
    return ['images' => array_values($data['images']), 'selected' => $data['selected']];
}
function funbikeSiteLogoSelected($data) {
    if (!is_array($data)) return FUNBIKE_DEFAULT_SITE_LOGO;
    foreach ($data['images'] as $image) if ($image['id'] === $data['selected']) return $image['url'];
    return FUNBIKE_DEFAULT_SITE_LOGO;
}
function funbikeSiteLogoRevision($data) { return hash('sha256', json_encode($data, JSON_UNESCAPED_SLASHES)); }
function funbikeSiteLogoWrite($data) {
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    return $json !== false && funbikeAtomicWrite(dirname(__DIR__, 2) . '/storage/data/site-logo.json', $json);
}

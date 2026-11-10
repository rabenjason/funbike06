<?php
// Réglage indépendant du contenu, des produits et de la préférence jour/nuit.
function funbikeSiteThemeRead() {
    $file = dirname(__DIR__, 2) . '/storage/data/site-theme.json';
    if (!file_exists($file)) return ['theme' => 'funbike'];
    $raw = @file_get_contents($file);
    $data = $raw === false ? null : json_decode($raw, true);
    if (!is_array($data) || !in_array($data['theme'] ?? null, ['funbike', 'tvs'], true)) return null;
    return ['theme' => $data['theme']];
}
function funbikeSiteThemeRevision($data) {
    return hash('sha256', json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

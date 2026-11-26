<?php
// Réglages d’apparence du site, indépendants des choix personnels des visiteurs.
function funbikeSiteThemeRead() {
    $file = dirname(__DIR__, 2) . '/storage/data/site-theme.json';
    if (!file_exists($file)) return ['theme' => 'funbike', 'defaultMode' => 'dark'];
    $raw = @file_get_contents($file);
    $data = $raw === false ? null : json_decode($raw, true);
    if (!is_array($data) || !in_array($data['theme'] ?? null, ['funbike', 'tvs'], true)) return null;
    if (array_key_exists('defaultMode', $data) && !in_array($data['defaultMode'], ['light', 'dark'], true)) return null;
    return ['theme' => $data['theme'], 'defaultMode' => $data['defaultMode'] ?? 'dark'];
}
function funbikeSiteThemeRevision($data) {
    return hash('sha256', json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

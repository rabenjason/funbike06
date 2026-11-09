<?php
// Préférence globale indépendante des campagnes et du catalogue.
function funbikePromotionDisplayRead() {
    $file = dirname(__DIR__, 2) . '/storage/data/promotions-display.json';
    if (!file_exists($file)) return ['preferredCategory' => 'motos'];
    $raw = @file_get_contents($file);
    $data = $raw === false ? null : json_decode($raw, true);
    if (!is_array($data) || !in_array($data['preferredCategory'] ?? null, ['motos', 'equipements', 'pieces'], true)) return null;
    return ['preferredCategory' => $data['preferredCategory']];
}
function funbikePromotionDisplayRevision($data) {
    return hash('sha256', json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

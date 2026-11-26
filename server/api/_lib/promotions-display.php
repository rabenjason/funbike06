<?php
// Préférence globale indépendante des campagnes et du catalogue.
function funbikeHomePromotionTextValid($text) {
    return is_string($text) && trim($text) !== '' && strlen($text) <= 400 && preg_match('//u', $text) === 1 && preg_match('/[\x00-\x1f\x7f]/', $text) === 0 && preg_match_all('/./us', $text) <= 100;
}
function funbikePromotionDisplayRead() {
    $file = dirname(__DIR__, 2) . '/storage/data/promotions-display.json';
    if (!file_exists($file)) return ['preferredCategory' => 'motos', 'showCardDescription' => false, 'originalPriceColor' => '', 'homeSignEnabled' => true, 'homeSignText' => 'Promotions disponibles !'];
    $raw = @file_get_contents($file);
    $data = $raw === false ? null : json_decode($raw, true);
    if (!is_array($data) || !in_array($data['preferredCategory'] ?? null, ['tous', 'motos', 'equipements', 'pieces'], true)) return null;
    if (array_key_exists('showCardDescription', $data) && !is_bool($data['showCardDescription'])) return null;
    if (array_key_exists('originalPriceColor', $data) && (!is_string($data['originalPriceColor']) || !preg_match('/^(?:|#[0-9a-fA-F]{6})$/D', $data['originalPriceColor']))) return null;
    if (array_key_exists('homeSignEnabled', $data) && !is_bool($data['homeSignEnabled'])) return null;
    if (array_key_exists('homeSignText', $data) && !funbikeHomePromotionTextValid($data['homeSignText'])) return null;
    return ['preferredCategory' => $data['preferredCategory'], 'showCardDescription' => $data['showCardDescription'] ?? false, 'originalPriceColor' => $data['originalPriceColor'] ?? '', 'homeSignEnabled' => $data['homeSignEnabled'] ?? true, 'homeSignText' => $data['homeSignText'] ?? 'Promotions disponibles !'];
}
function funbikePromotionDisplayRevision($data) {
    return hash('sha256', json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

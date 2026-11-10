<?php
// Fichier distinct : aucune modification du catalogue ni du contenu de l'accueil.
function funbikeChatbotRead() {
    $file = dirname(__DIR__, 2) . '/storage/data/chatbot-settings.json';
    if (!file_exists($file)) return ['enabled' => true];
    $raw = @file_get_contents($file);
    $data = $raw === false ? null : json_decode($raw, true);
    if (!is_array($data) || !array_key_exists('enabled', $data) || !is_bool($data['enabled'])) return null;
    return ['enabled' => $data['enabled']];
}
function funbikeChatbotRevision($data) {
    return hash('sha256', json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

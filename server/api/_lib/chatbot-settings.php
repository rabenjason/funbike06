<?php
// Réglage indépendant du catalogue et du contenu de l'accueil.
function funbikeChatbotValidName($name) {
    return is_string($name) && $name !== '' && trim($name) === $name && strlen($name) <= 160
        && !preg_match('/[\x00-\x1f\x7f<>*]/', $name)
        && preg_match('//u', $name) && preg_match_all('/./us', $name) <= 40;
}
function funbikeChatbotValidLogo($url) {
    return $url === null || (is_string($url) && preg_match('#^/server/uploads/chatbot/logo-[a-f0-9]{32}\.(jpg|png|webp)$#D', $url));
}
function funbikeChatbotRead() {
    $file = dirname(__DIR__, 2) . '/storage/data/chatbot-settings.json';
    if (!file_exists($file)) return ['enabled' => true, 'name' => 'Piston', 'logo' => null];
    $raw = @file_get_contents($file);
    $data = $raw === false ? null : json_decode($raw, true);
    if (!is_array($data) || !array_key_exists('enabled', $data) || !is_bool($data['enabled'])) return null;
    $name = array_key_exists('name', $data) ? $data['name'] : 'Piston';
    $logo = array_key_exists('logo', $data) ? $data['logo'] : null;
    if (!funbikeChatbotValidName($name) || !funbikeChatbotValidLogo($logo)) return null;
    return ['enabled' => $data['enabled'], 'name' => $name, 'logo' => $logo];
}
function funbikeChatbotRevision($data) {
    return hash('sha256', json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

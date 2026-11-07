<?php
/** Limitation par adresse du client ; ne jamais stocker le nom ni le mot de passe. */
function funbikeLoginAttempt($success = null)
{
    $dir = dirname(__DIR__, 2) . '/storage/private';
    if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) {
        funbikeJsonResponse(503, ['code' => 'AUTH_STORAGE_ERROR', 'message' => 'Service de connexion indisponible.']);
    }
    $address = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $path = $dir . '/login-' . hash('sha256', $address) . '.json';
    $handle = fopen($path, 'c+');
    if (!$handle || !flock($handle, LOCK_EX)) funbikeJsonResponse(503, ['code' => 'AUTH_STORAGE_ERROR', 'message' => 'Service de connexion indisponible.']);
    $now = time();
    $state = json_decode(stream_get_contents($handle), true);
    if (!is_array($state) || ($state['since'] ?? 0) < $now - 900) $state = ['since' => $now, 'attempts' => 0];
    if ($success === null && $state['attempts'] >= 5) {
        flock($handle, LOCK_UN); fclose($handle);
        funbikeJsonResponse(429, ['code' => 'TOO_MANY_ATTEMPTS', 'message' => 'Trop de tentatives. Réessayez dans quelques minutes.']);
    }
    // Reserve the attempt under the lock before verifying the password, including concurrent requests.
    if ($success === null) $state['attempts']++;
    if ($success === true) $state = ['since' => $now, 'attempts' => 0];
    rewind($handle); ftruncate($handle, 0); fwrite($handle, json_encode($state)); fflush($handle);
    flock($handle, LOCK_UN); fclose($handle);
}

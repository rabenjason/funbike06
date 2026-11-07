<?php
// Point d'entrée en lecture seule utilisé par Vite en développement.
// Seuls ces deux flux publics sont disponibles ; aucune page privée ni écriture.
$feed = $_GET['feed'] ?? '';
$paths = ['robots' => '/robots.txt', 'sitemap' => '/sitemap.xml'];
if (!is_string($feed) || !isset($paths[$feed])) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=UTF-8');
    exit('Flux introuvable.');
}
$_SERVER['REQUEST_URI'] = $paths[$feed];
unset($_GET['admin']);
require dirname(__DIR__) . '/seo.php';

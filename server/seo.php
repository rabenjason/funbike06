<?php
// Pages publiques SEO : lecture seule du même catalogue que l'API.
// Le site doit être installé à la racine du domaine et index.html doit être le build Vite.
require_once __DIR__ . '/api/_lib/http.php';
require_once __DIR__ . '/api/_lib/catalog.php';

header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if (!in_array($method, ['GET', 'HEAD'], true)) { http_response_code(405); header('Allow: GET, HEAD'); exit; }
$origin = rtrim((string) (getenv('FUNBIKE_SITE_ORIGIN') ?: 'https://funbike.mg'), '/');
$parts = parse_url($origin);
if (!$parts || !in_array($parts['scheme'] ?? '', ['http', 'https'], true) || empty($parts['host']) || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment']) || !empty($parts['path']) || !filter_var($origin, FILTER_VALIDATE_URL)) {
    http_response_code(500); exit('Configuration FUNBIKE_SITE_ORIGIN invalide.');
}
function seoEsc($value) { return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8'); }
function seoPath($product) {
    $prefix = ($product['categoryId'] ?? '') === 'motos' ? 'motos' : (($product['categoryId'] ?? '') === 'pieces-detachees' ? 'pieces-detachees' : (($product['categoryId'] ?? '') === 'casques' ? 'casques' : 'equipements'));
    return '/' . $prefix . '/' . rawurlencode((string) ($product['id'] ?? ''));
}
function seoImage($product, $origin) {
    $images = isset($product['images']) && is_array($product['images']) ? $product['images'] : [];
    usort($images, function ($a, $b) { return (int) ($a['position'] ?? 0) <=> (int) ($b['position'] ?? 0); });
    $selected = null;
    foreach ($images as $image) if (is_array($image) && !empty($image['isMain'])) { $selected = $image; break; }
    if (!$selected && isset($images[0]) && is_array($images[0])) $selected = $images[0];
    $url = (string) ($selected['url'] ?? '');
    $decoded = rawurldecode($url);
    if (strpos($url, '/server/uploads/') === 0 && !preg_match('/[\x00-\x20"<>?#\\\\]/', $decoded) && !preg_match('#(?:^|/)\.{1,2}(?:/|$)#', $decoded)) return $origin . $url;
    return '';
}
function seoText($value) { return trim((string) preg_replace('/\s+/u', ' ', strip_tags((string) $value))); }
function seoProducts() {
    funbikeCatalogLock(false);
    $all = [];
    foreach (['motorcycles', 'helmets', 'riding-gear', 'spare-parts'] as $file) {
        foreach (funbikePublicProducts(funbikeCatalogRecords('products/' . $file . '.json', 'products')) as $p) {
            if (is_string($p['id'] ?? null) && preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/D', $p['id'])) $all[] = $p;
        }
    }
    return $all;
}
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$path = rtrim($path, '/') ?: '/';
$pages = [
    '/' => ['Funbike Madagascar — Motos, pièces et équipements', 'Découvrez les motos, équipements et pièces détachées de Funbike à Madagascar.', 'Motos, pièces et équipements à Madagascar'],
    '/catalogue' => ['Catalogue motos, pièces et équipements | Funbike Madagascar', 'Découvrez le catalogue de motos, pièces et équipements Funbike.', 'Tout le catalogue'],
    '/motos' => ['Motos à Madagascar | Funbike', 'Découvrez les motos du catalogue Funbike à Madagascar.', 'Nos motos'],
    '/equipements' => ['Casques et équipements moto | Funbike Madagascar', 'Découvrez les casques et équipements moto du catalogue Funbike.', 'Casques et équipements'],
    '/pieces-detachees' => ['Pièces détachées moto | Funbike Madagascar', 'Découvrez les pièces détachées moto du catalogue Funbike.', 'Pièces détachées'],
    '/revendeurs' => ['Nos revendeurs | Funbike Madagascar', 'Retrouvez les revendeurs et points de vente Funbike.', 'Nos revendeurs'],
    '/contact' => ['Contact | Funbike Madagascar', 'Contactez l’équipe Funbike pour vos questions sur les motos, pièces et équipements.', 'Contacter Funbike'],
];
if ($path === '/admin' || isset($_GET['admin'])) {
    header('X-Robots-Tag: noindex, nofollow');
    $file = dirname(__DIR__) . '/index.html';
    if (!is_file($file)) { http_response_code(503); exit('Build du site indisponible.'); }
    header('Content-Type: text/html; charset=UTF-8'); readfile($file); exit;
}
if ($path === '/robots.txt') {
    header('Content-Type: text/plain; charset=UTF-8');
    echo "User-agent: *\nDisallow: /server/api/\nDisallow: /server/storage/\nDisallow: /server/scripts/\nDisallow: /server/seo.php\nSitemap: " . $origin . "/sitemap.xml\n"; exit;
}
$all = seoProducts();
if ($path === '/sitemap.xml') {
    header('Content-Type: application/xml; charset=UTF-8');
    echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n";
    foreach (array_keys($pages) as $url) echo '<url><loc>' . seoEsc($origin . $url) . "</loc></url>\n";
    foreach ($all as $p) echo '<url><loc>' . seoEsc($origin . seoPath($p)) . "</loc></url>\n";
    echo '</urlset>'; exit;
}
// Correspondances explicites uniquement, établies après audit des anciennes URL.
$redirects = json_decode((string) @file_get_contents(__DIR__ . '/storage/data/seo-redirects.json'), true);
if (is_array($redirects) && isset($redirects[$path]) && is_string($redirects[$path])) {
    $target = $redirects[$path];
    $valid = isset($pages[$target]);
    foreach ($all as $p) if (seoPath($p) === $target) $valid = true;
    if ($valid && $target !== $path) { header('Location: ' . $origin . $target, true, 301); exit; }
}
$product = null;
foreach ($all as $p) if (seoPath($p) === $path) { $product = $p; break; }
if (!isset($pages[$path]) && !$product) {
    http_response_code(404); header('X-Robots-Tag: noindex');
    header('Content-Type: text/html; charset=UTF-8');
    echo '<!doctype html><html lang="fr"><meta charset="utf-8"><title>Page introuvable | Funbike</title><h1>Page introuvable</h1><a href="/">Retour à l’accueil</a></html>'; exit;
}
$title = $product ? seoText($product['name'] ?? 'Produit') . ' | Funbike Madagascar' : $pages[$path][0];
$description = $product ? seoText($product['description'] ?? '') : $pages[$path][1];
if ($description === '') $description = 'Découvrez ' . seoText($product['name'] ?? 'ce produit') . ' chez Funbike Madagascar.';
$image = $product ? seoImage($product, $origin) : '';
$canonical = $origin . $path;
$heading = $product ? seoText($product['name'] ?? '') : $pages[$path][2];
$meta = '<meta name="description" content="' . seoEsc($description) . '">' . "\n";
$meta .= '<link rel="canonical" href="' . seoEsc($canonical) . '">' . "\n";
foreach (['og:type' => $product ? 'product' : 'website', 'og:title' => $title, 'og:description' => $description, 'og:url' => $canonical, 'og:image' => $image] as $name => $value) {
    if ($value !== '') $meta .= '<meta property="' . $name . '" content="' . seoEsc($value) . '">' . "\n";
}
$meta .= '<meta name="twitter:card" content="' . ($image ? 'summary_large_image' : 'summary') . '">' . "\n";
if ($product) {
    $schema = ['@context' => 'https://schema.org', '@type' => 'Product', 'name' => seoText($product['name']), 'description' => $description, 'url' => $canonical];
    if ($image) $schema['image'] = $image;
    foreach (funbikeCatalogRecords('brands.json', 'brands') as $brand) if (($brand['id'] ?? null) === ($product['brandId'] ?? null) && !empty($brand['name'])) { $schema['brand'] = ['@type' => 'Brand', 'name' => seoText($brand['name'])]; break; }
    $json = json_encode($schema, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
    if ($json !== false) $meta .= '<script type="application/ld+json" data-funbike-product>' . $json . '</script>' . "\n";
}
$body = '<main><nav aria-label="Navigation">';
foreach ($pages as $url => $page) $body .= '<a href="' . seoEsc($url) . '">' . seoEsc($page[2]) . '</a> ';
$body .= '</nav><h1>' . seoEsc($heading) . '</h1><p>' . seoEsc($description) . '</p>';
if ($product) {
    if ($image) $body .= '<img src="' . seoEsc($image) . '" alt="' . seoEsc($heading) . '">';
    if (isset($product['specifications']) && is_array($product['specifications'])) {
        $body .= '<ul>';
        foreach ($product['specifications'] as $spec) if (is_array($spec) && isset($spec['key'], $spec['value'])) $body .= '<li>' . seoEsc($spec['key']) . ' : ' . seoEsc($spec['value']) . '</li>';
        $body .= '</ul>';
    }
} elseif (in_array($path, ['/catalogue', '/motos', '/equipements', '/pieces-detachees'], true)) {
    $body .= '<ul>';
    foreach ($all as $p) {
        $url = seoPath($p);
        if ($path !== '/catalogue' && strpos($url, $path . '/') !== 0 && !($path === '/equipements' && strpos($url, '/casques/') === 0)) continue;
        $body .= '<li><a href="' . seoEsc($url) . '">' . seoEsc($p['name'] ?? '') . '</a></li>';
    }
    $body .= '</ul>';
}
$body .= '</main>';
$file = dirname(__DIR__) . '/index.html';
$html = @file_get_contents($file);
if ($html === false || strpos($html, '<div id="root"></div>') === false) { http_response_code(503); exit('Build du site indisponible ou invalide.'); }
$html = preg_replace_callback('/<title>.*?<\/title>/s', function () use ($title) { return '<title>' . seoEsc($title) . '</title>'; }, $html, 1);
$html = preg_replace('/\s*<meta\s+name="description"[^>]*>/i', '', $html, 1);
$html = str_replace('</head>', $meta . '</head>', $html);
$html = str_replace('<div id="root"></div>', '<div id="seo-fallback">' . $body . '</div><div id="root"></div>', $html);
header('Content-Type: text/html; charset=UTF-8');
echo $html;

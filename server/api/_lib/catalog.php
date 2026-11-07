<?php
// Règles communes de cohérence du catalogue. Tous les accès passent sous le verrou global.
function funbikeCatalogLock($write = false)
{
    static $lock = null;
    if ($lock !== null) return;
    $directory = dirname(__DIR__, 2) . '/storage/private';
    if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
        funbikeJsonResponse(500, ['error' => 'Stockage privé indisponible.']);
    }
    $lock = fopen($directory . '/catalog.lock', 'c');
    if (!$lock || !flock($lock, $write ? LOCK_EX : LOCK_SH)) {
        funbikeJsonResponse(500, ['error' => 'Verrouillage du catalogue impossible.']);
    }
    register_shutdown_function(function () use ($lock) { flock($lock, LOCK_UN); fclose($lock); });
}

function funbikeCatalogRecords($file, $key)
{
    $path = dirname(__DIR__, 2) . '/storage/data/' . $file;
    $data = json_decode((string) @file_get_contents($path), true);
    if (!is_array($data) || !isset($data[$key]) || !is_array($data[$key])) {
        funbikeJsonResponse(500, ['error' => 'Données du catalogue indisponibles.']);
    }
    return $data[$key];
}

function funbikeFindRecord($records, $id)
{
    foreach ($records as $record) if (($record['id'] ?? null) === $id) return $record;
    return null;
}

function funbikeValidateProduct($product, $categoryId)
{
    if (!isset($product['name']) || !is_string($product['name']) || trim($product['name']) === '')
        funbikeJsonResponse(400, ['error' => 'Le nom du produit est obligatoire.']);
    if (($product['categoryId'] ?? null) !== $categoryId || !funbikeFindRecord(funbikeCatalogRecords('categories.json', 'categories'), $categoryId))
        funbikeJsonResponse(400, ['error' => 'Catégorie du produit invalide.']);
    $brandId = $product['brandId'] ?? null;
    if (!is_string($brandId) || !funbikeFindRecord(funbikeCatalogRecords('brands.json', 'brands'), $brandId))
        funbikeJsonResponse(400, ['error' => 'Choisissez une marque existante.']);
    $typeId = $product['productTypeId'] ?? null;
    $type = is_string($typeId) ? funbikeFindRecord(funbikeCatalogRecords('product-types.json', 'productTypes'), $typeId) : null;
    if (!$type || ($type['categoryId'] ?? null) !== $categoryId)
        funbikeJsonResponse(400, ['error' => 'Choisissez un type correspondant à la catégorie.']);
    if ($categoryId === 'motos') {
        $family = funbikeFindRecord(funbikeCatalogRecords('families.json', 'families'), $type['familyId'] ?? null);
        if (!$family || ($family['categoryId'] ?? null) !== $categoryId)
            funbikeJsonResponse(400, ['error' => 'Le type de moto doit appartenir à une famille valide.']);
    }
    if (!in_array($product['status'] ?? null, ['DRAFT', 'PUBLISHED', 'ARCHIVED'], true))
        funbikeJsonResponse(400, ['error' => 'Statut du produit invalide.']);
    if (!empty($product['modelId'])) {
        $model = funbikeFindRecord(funbikeCatalogRecords('models.json', 'models'), $product['modelId']);
        if (!$model || ($model['brandId'] ?? null) !== $brandId)
            funbikeJsonResponse(400, ['error' => 'Le modèle doit appartenir à la marque choisie.']);
    }
    if (isset($product['compatibleBrandIds'])) {
        if (!is_array($product['compatibleBrandIds'])) funbikeJsonResponse(400, ['error' => 'Compatibilités invalides.']);
        $brands = funbikeCatalogRecords('brands.json', 'brands');
        foreach ($product['compatibleBrandIds'] as $compatible) if (!is_string($compatible) || !funbikeFindRecord($brands, $compatible))
            funbikeJsonResponse(400, ['error' => 'Une marque compatible est introuvable.']);
    }
    foreach (['images', 'specifications'] as $field)
        if (isset($product[$field]) && !is_array($product[$field])) funbikeJsonResponse(400, ['error' => 'Champ ' . $field . ' invalide.']);
}

// Les anciennes marques sont publiées tant qu'elles ne sont pas explicitement dépubliées.
function funbikePublishedBrandIds()
{
    $ids = [];
    foreach (funbikeCatalogRecords('brands.json', 'brands') as $brand) {
        $published = $brand['isPublished'] ?? true;
        if (is_string($published)) $published = strtolower(trim($published));
        if (isset($brand['id']) && !in_array($published, [false, 0, '0', 'false', ''], true)) $ids[$brand['id']] = true;
    }
    return $ids;
}

function funbikePublicProducts($products)
{
    $brands = funbikePublishedBrandIds();
    $visible = [];
    foreach ($products as $product) {
        if (!is_array($product) || ($product['status'] ?? null) !== 'PUBLISHED' || !isset($brands[$product['brandId'] ?? ''])) continue;
        if (isset($product['compatibleBrandIds']) && is_array($product['compatibleBrandIds'])) {
            $product['compatibleBrandIds'] = array_values(array_filter($product['compatibleBrandIds'], function ($id) use ($brands) { return is_string($id) && isset($brands[$id]); }));
        }
        $visible[] = $product;
    }
    return $visible;
}

function funbikeVisibleProducts($products)
{
    if (($_GET['includeDrafts'] ?? '') === '1') {
        funbikeRequireAdmin();
        return $products;
    }
    return funbikePublicProducts($products);
}

function funbikePreventReferencedDeletion($kind, $id)
{
    $targets = [
        'category' => [['families.json', 'families', 'categoryId'], ['product-types.json', 'productTypes', 'categoryId']],
        'family' => [['product-types.json', 'productTypes', 'familyId']],
        'brand' => [['models.json', 'models', 'brandId']],
        'type' => [],
        'model' => []
    ];
    foreach ($targets[$kind] ?? [] as $spec) {
        foreach (funbikeCatalogRecords($spec[0], $spec[1]) as $item) {
            if (($item[$spec[2]] ?? null) === $id) funbikeJsonResponse(409, ['error' => 'Impossible de supprimer : cet élément est encore utilisé.']);
        }
    }
    foreach (['motorcycles', 'helmets', 'riding-gear', 'spare-parts'] as $file) {
        foreach (funbikeCatalogRecords('products/' . $file . '.json', 'products') as $item) {
            $used = ($kind === 'category' && ($item['categoryId'] ?? null) === $id)
                || ($kind === 'type' && ($item['productTypeId'] ?? null) === $id)
                || ($kind === 'model' && ($item['modelId'] ?? null) === $id)
                || ($kind === 'brand' && (($item['brandId'] ?? null) === $id || in_array($id, $item['compatibleBrandIds'] ?? [], true)));
            if ($used) funbikeJsonResponse(409, ['error' => 'Impossible de supprimer : cet élément est encore utilisé par un produit.']);
        }
    }
}

/** Remplacement atomique sous verrou global, sans tronquer le JSON existant. */
function funbikeAtomicWrite($file, $json)
{
    $temp = tempnam(dirname($file), '.catalog-');
    if ($temp === false) return false;
    if (file_put_contents($temp, $json, LOCK_EX) !== strlen($json) || !rename($temp, $file)) {
        @unlink($temp);
        return false;
    }
    return true;
}

function funbikeUniqueProductId($baseId)
{
    $ids = [];
    foreach (['motorcycles', 'helmets', 'riding-gear', 'spare-parts'] as $file) {
        foreach (funbikeCatalogRecords('products/' . $file . '.json', 'products') as $item) $ids[] = $item['id'] ?? '';
    }
    $id = $baseId; $n = 2;
    while (in_array($id, $ids, true)) $id = $baseId . '-' . $n++;
    return $id;
}

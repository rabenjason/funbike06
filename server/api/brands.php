<?php
// server/api/brands.php

// 1. HTTP, CORS et authentification partagés
require_once __DIR__ . "/_lib/auth.php";
funbikeBootstrapApi();

// 2. Chemins
$storageDir = dirname(__DIR__) . '/storage/data';
$uploadsDir = dirname(__DIR__) . '/uploads/brands';
$jsonFile = $storageDir . '/brands.json';

// 3. Fonction utilitaire pour générer un ID (slug)
function generateSlug($string) {
    $string = strtolower($string);
    $string = preg_replace('/[^a-z0-9\s-]/', '', $string);
    $string = preg_replace('/[\s-]+/', '-', $string);
    return trim($string, '-');
}

// 4. Astuce PHP : Supporter PUT avec des fichiers via _method=PUT en POST
$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'POST' && isset($_POST['_method'])) {
    $method = strtoupper($_POST['_method']);
}

funbikeProtectWriteMethods($method);

// 5. Chargement et normalisation des données existantes
// Accepte les booléens JSON et les valeurs envoyées par un FormData.
function normalizeBrandBoolean($value) {
    if (is_bool($value)) {
        return $value;
    }

    if ($value === 1 || $value === "1") {
        return true;
    }

    if ($value === 0 || $value === "0") {
        return false;
    }

    if (is_string($value)) {
        $value = strtolower(trim($value));

        if (in_array($value, ["true", "on"], true)) {
            return true;
        }

        if (in_array($value, ["false", ""], true)) {
            return false;
        }
    }

    return null;
}

function cleanBrands($brands) {
    $result = [];

    foreach ($brands as $brand) {
        if (!is_array($brand) || !isset($brand['id'], $brand['name'])) {
            continue;
        }

        $isEquipmentBrand = normalizeBrandBoolean($brand['isEquipmentBrand'] ?? false);

        $result[] = [
            "id" => (string) $brand['id'],
            "name" => (string) $brand['name'],
            "logo" => (string) ($brand['logo'] ?? ""),
            "isEquipmentBrand" => $isEquipmentBrand === null ? false : $isEquipmentBrand
        ];
    }

    return $result;
}

function loadData($jsonFile) {
    if (!file_exists($jsonFile)) {
        funbikeJsonResponse(500, ["error" => "Données de marques introuvables ou invalides. Restaurez une sauvegarde."]);
    }

    $data = json_decode(file_get_contents($jsonFile), true);

    if (!is_array($data) || !isset($data['brands']) || !is_array($data['brands'])) {
        funbikeJsonResponse(500, ["error" => "Données de marques introuvables ou invalides. Restaurez une sauvegarde."]);
    }

    return ["brands" => cleanBrands($data['brands'])];
}

function saveData($jsonFile, $data) {
    $data = ["brands" => cleanBrands($data['brands'])];

    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return $json !== false && funbikeAtomicWrite($jsonFile, $json);
}

// ==========================================
// ROUTES
// ==========================================

if ($method === 'GET') {
    $data = loadData($jsonFile);
    http_response_code(200);
    echo json_encode($data);
    exit;
}

if ($method === 'POST') {
    // --- CRÉER UNE NOUVELLE MARQUE ---
    if (empty($_POST['name'])) {
        http_response_code(400);
        echo json_encode(["error" => "Le nom de la marque est requis."]);
        exit;
    }

    $name = trim($_POST['name']);
    $id = generateSlug($name);
    $isEquipmentBrand = false;

    if (array_key_exists('isEquipmentBrand', $_POST)) {
        $isEquipmentBrand = normalizeBrandBoolean($_POST['isEquipmentBrand']);

        if ($isEquipmentBrand === null) {
            http_response_code(400);
            echo json_encode(["error" => "isEquipmentBrand doit être true, false, 1 ou 0."]);
            exit;
        }
    }

    if (!isset($_FILES['logo']) || $_FILES['logo']['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(["error" => "Le logo est requis."]);
        exit;
    }

    $file = $_FILES['logo'];
    $fileExt = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($fileExt, ['jpg', 'jpeg', 'png', 'webp']) || (int) ($file['size'] ?? 0) > 8 * 1024 * 1024 || !in_array(mime_content_type($file['tmp_name']), ['image/jpeg', 'image/png', 'image/webp'], true)) {
        http_response_code(400);
        echo json_encode(["error" => "Format de fichier non autorisé (PNG, JPG, WEBP)."]);
        exit;
    }

    if ($id === '') { http_response_code(400); echo json_encode(["error" => "Nom invalide."]); exit; }
    $data = loadData($jsonFile);
    foreach ($data['brands'] as $brand) {
        if ($brand['id'] === $id) { http_response_code(409); echo json_encode(["error" => "Cette marque existe déjà."]); exit; }
    }
    $brandDir = $uploadsDir . '/' . $id;
    if (!is_dir($brandDir)) {
        mkdir($brandDir, 0755, true);
    }

    $destination = $brandDir . '/logo.' . $fileExt;
    if (!move_uploaded_file($file['tmp_name'], $destination)) {
        http_response_code(500);
        echo json_encode(["error" => "Échec de l'enregistrement du logo."]);
        exit;
    }

    $newBrand = [
        "id" => $id,
        "name" => $name,
        "logo" => "/server/uploads/brands/$id/logo.$fileExt",
        "isEquipmentBrand" => $isEquipmentBrand
    ];
    $data['brands'][] = $newBrand;
    if (!saveData($jsonFile, $data)) { http_response_code(500); echo json_encode(["error" => "Impossible de sauvegarder les marques."]); exit; }

    http_response_code(201);
    echo json_encode(["message" => "Marque ajoutée.", "brand" => $newBrand]);
    exit;
}

if ($method === 'PUT') {
    // --- METTRE À JOUR UNE MARQUE ---
    $id = $_GET['id'] ?? $_POST['id'] ?? null;
    if (!$id) {
        http_response_code(400);
        echo json_encode(["error" => "L'ID de la marque est requis pour la mise à jour."]);
        exit;
    }

    $data = loadData($jsonFile);
    $brandIndex = -1;
    foreach ($data['brands'] as $index => $brand) {
        if ($brand['id'] === $id) {
            $brandIndex = $index;
            break;
        }
    }

    if ($brandIndex === -1) {
        http_response_code(404);
        echo json_encode(["error" => "Marque introuvable."]);
        exit;
    }

    // Mise à jour du nom
    if (!empty($_POST['name'])) {
        $data['brands'][$brandIndex]['name'] = trim($_POST['name']);
    }

    // Mise à jour du type de marque sans exiger un nouveau logo.
    if (array_key_exists('isEquipmentBrand', $_POST)) {
        $isEquipmentBrand = normalizeBrandBoolean($_POST['isEquipmentBrand']);

        if ($isEquipmentBrand === null) {
            http_response_code(400);
            echo json_encode(["error" => "isEquipmentBrand doit être true, false, 1 ou 0."]);
            exit;
        }

        $data['brands'][$brandIndex]['isEquipmentBrand'] = $isEquipmentBrand;
    }

    // Une erreur de transfert ne doit jamais être traitée comme une absence de logo.
    if (isset($_FILES['logo']) && !in_array($_FILES['logo']['error'], [UPLOAD_ERR_OK, UPLOAD_ERR_NO_FILE], true)) {
        $uploadError = $_FILES['logo']['error'];
        http_response_code(in_array($uploadError, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) ? 413 : 400);
        echo json_encode(["error" => "Impossible de transférer le logo. Vérifiez la taille autorisée par le serveur et réessayez."]);
        exit;
    }

    $newLogoFile = null;
    // Mise à jour du logo (si un nouveau fichier est fourni)
    if (isset($_FILES['logo']) && $_FILES['logo']['error'] === UPLOAD_ERR_OK) {
        $file = $_FILES['logo'];
        $fileExt = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!in_array($fileExt, ['jpg', 'jpeg', 'png', 'webp']) || (int) ($file['size'] ?? 0) > 8 * 1024 * 1024 || !in_array(mime_content_type($file['tmp_name']), ['image/jpeg', 'image/png', 'image/webp'], true)) {
            http_response_code(400);
            echo json_encode(["error" => "Format de fichier non autorisé."]);
            exit;
        }

        $brandDir = $uploadsDir . '/' . $id;
        if (!is_dir($brandDir)) {
            mkdir($brandDir, 0755, true);
        }

        $fileName = 'logo-' . bin2hex(random_bytes(8)) . '.' . $fileExt;
        $destination = $brandDir . '/' . $fileName;
        if (move_uploaded_file($file['tmp_name'], $destination)) {
            $newLogoFile = $destination;
            $data['brands'][$brandIndex]['logo'] = "/server/uploads/brands/$id/$fileName";
        } else {
            http_response_code(500);
            echo json_encode(["error" => "Échec de la mise à jour du logo."]);
            exit;
        }
    }

    if (!saveData($jsonFile, $data)) {
        // Le JSON pointe encore sur l'ancien logo : seul le nouveau fichier peut être retiré.
        if ($newLogoFile !== null) @unlink($newLogoFile);
        http_response_code(500); echo json_encode(["error" => "Impossible de sauvegarder les marques."]); exit;
    }
    // Ne pas effacer les anciens logos : d'autres pages ou sauvegardes peuvent encore les utiliser.
    http_response_code(200);
    echo json_encode(["message" => "Marque mise à jour.", "brand" => $data['brands'][$brandIndex]]);
    exit;
}

if ($method === 'DELETE') {
    // --- SUPPRIMER UNE MARQUE ---
    $id = $_GET['id'] ?? null;
    if (!empty($id)) funbikePreventReferencedDeletion("brand", $id);
    if (!$id) {
        http_response_code(400);
        echo json_encode(["error" => "L'ID de la marque est requis pour la suppression."]);
        exit;
    }

    $data = loadData($jsonFile);
    $brandIndex = -1;
    foreach ($data['brands'] as $index => $brand) {
        if ($brand['id'] === $id) {
            $brandIndex = $index;
            break;
        }
    }

    if ($brandIndex === -1) {
        http_response_code(404);
        echo json_encode(["error" => "Marque introuvable."]);
        exit;
    }

    // Retirer du tableau et réindexer
    unset($data['brands'][$brandIndex]);
    $data['brands'] = array_values($data['brands']);
    
    if (!saveData($jsonFile, $data)) { http_response_code(500); echo json_encode(["error" => "Impossible de sauvegarder les marques."]); exit; }
    // Ne supprimer les fichiers qu'après l'enregistrement du JSON.
    $brandDir = $uploadsDir . '/' . basename($id);
    if (is_dir($brandDir)) {
        $files = array_diff(scandir($brandDir), ['.', '..']);
        foreach ($files as $file) @unlink($brandDir . '/' . $file);
        @rmdir($brandDir);
    }
    http_response_code(200);
    echo json_encode(["message" => "Marque supprimée avec succès."]);
    exit;
}

http_response_code(405);
echo json_encode(["error" => "Méthode non autorisée."]);
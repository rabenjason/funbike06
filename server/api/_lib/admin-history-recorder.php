<?php
// Observateur limité aux fichiers publics éditables. Il ne lit jamais les
// messages, comptes, mots de passe, corps HTTP ou journaux de fréquentation.
require_once __DIR__ . '/admin-history.php';

function funbikeHistoryBegin($user, $method)
{
    $scripts = ['motorcycles.php', 'helmets.php', 'riding-gear.php', 'spare-parts.php', 'photo.php', 'homepage-content.php', 'homepage-selections.php', 'site-logo.php', 'sherco-banner.php', 'promotions.php', 'promotions-display.php', 'dealers.php', 'contacts.php', 'brands.php', 'categories.php', 'families.php', 'models.php', 'product-types.php', 'site-theme.php', 'chatbot-settings.php', 'chatbot-logos.php', 'whatsapp-settings.php'];
    if (in_array($method, ['GET', 'OPTIONS'], true) || !in_array(basename($_SERVER['SCRIPT_FILENAME'] ?? ''), $scripts, true)) return;
    // L'écriture doit au minimum être possible avant toute modification.
    try {
        $h = funbikeHistoryOpen(true);
        try {
            fseek($h, 0, SEEK_END);
            if (ftell($h) > 0) { fseek($h, -1, SEEK_END); if (fread($h, 1) !== "\n") throw new RuntimeException('Journal incomplet.'); }
        } finally { funbikeHistoryClose($h); }
    }
    catch (Throwable $e) { error_log('FUNBIKE historique : ' . $e->getMessage()); funbikeJsonResponse(503, ['error' => 'Historique indisponible : aucune modification effectuée. Vérifiez le stockage privé.']); }
    // Garder la réponse en tampon jusqu'à la fin du journal : une erreur de
    // journalisation après modification doit avertir l'administrateur.
    ob_start();
    $subjectId = $_GET['id'] ?? ($_GET['key'] ?? '');
    if (!is_string($subjectId) || !preg_match('/^[a-zA-Z0-9_-]{1,100}$/D', $subjectId)) $subjectId = '';
    $GLOBALS['funbikeHistoryState'] = ['user' => $user, 'files' => [], 'notes' => [], 'request' => basename($_SERVER['SCRIPT_FILENAME']) . ($subjectId !== '' ? ' (' . $subjectId . ')' : '')];
    // Enregistré avant le verrou du catalogue : les comparaisons et le journal
    // sont terminés avant qu'une autre modification puisse commencer.
    register_shutdown_function('funbikeHistoryFinish');
}

function funbikeHistoryBeforeWrite($file)
{
    if (!isset($GLOBALS['funbikeHistoryState'])) return null;
    $prefix = dirname(__DIR__, 2) . '/storage/data/';
    if (strpos($file, $prefix) !== 0) return null;
    $name = substr($file, strlen($prefix));
    $allowed = ['products/motorcycles.json', 'products/helmets.json', 'products/riding-gear.json', 'products/spare-parts.json', 'promotions.json', 'dealers.json', 'contacts.json', 'homepage.json', 'site-logo.json', 'sherco-banner.json', 'brands.json', 'categories.json', 'families.json', 'models.json', 'product-types.json', 'site-theme.json', 'promotions-display.json', 'chatbot-settings.json'];
    if (!in_array($name, $allowed, true)) return null;
    if (isset($GLOBALS['funbikeHistoryState']['files'][$name])) return null;
    if (file_exists($file)) {
        $raw = @file_get_contents($file);
        if ($raw === false || !is_array(json_decode($raw, true))) throw new RuntimeException('État initial illisible : modification refusée.');
        $before = json_decode($raw, true);
    } else {
        $defaults = [
            'promotions.json' => ['campaigns' => []], 'site-logo.json' => ['images' => [], 'selected' => null],
            'sherco-banner.json' => ['images' => [], 'selected' => null], 'site-theme.json' => ['theme' => 'funbike'],
            'promotions-display.json' => ['preferredCategory' => 'motos'], 'chatbot-settings.json' => ['enabled' => true, 'name' => 'Piston', 'logo' => null]
        ];
        $before = $name === 'homepage.json' ? json_decode((string) @file_get_contents(__DIR__ . '/homepage-defaults.json'), true) : ($defaults[$name] ?? []);
    }
    if (!is_array($before)) throw new RuntimeException('État initial indisponible : modification refusée.');
    return ['name' => $name, 'path' => $file, 'before' => $before];
}

function funbikeHistoryAfterWrite($capture)
{
    if ($capture !== null && isset($GLOBALS['funbikeHistoryState'])) $GLOBALS['funbikeHistoryState']['files'][$capture['name']] = $capture;
}

function funbikeHistoryNote($type, $subject, $result, $fields = [])
{
    if (isset($GLOBALS['funbikeHistoryState'])) $GLOBALS['funbikeHistoryState']['notes'][] = [$type, $subject, $fields, $result];
}

function funbikeHistoryFields($old, $new, $prefix = '', $depth = 0)
{
    if (!is_array($old) || !is_array($new) || $depth >= 2 || array_keys($old) === range(0, count($old) - 1) || array_keys($new) === range(0, count($new) - 1)) return $old === $new ? [] : [$prefix];
    $fields = [];
    foreach (array_unique(array_merge(array_keys($old), array_keys($new))) as $key) {
        if (in_array($key, ['createdAt', 'updatedAt'], true) || preg_match('/password|passwd|secret|token|mot.?de.?passe/i', (string)$key)) continue;
        $path = $prefix === '' ? (string)$key : $prefix . '.' . $key;
        if (!array_key_exists($key, $old) || !array_key_exists($key, $new)) $fields[] = $path;
        else $fields = array_merge($fields, funbikeHistoryFields($old[$key], $new[$key], $path, $depth + 1));
    }
    return $fields;
}

function funbikeHistoryRecordList($user, $old, $new, $kind, $idKey, $status)
{
    $before = []; $after = [];
    foreach ($old as $row) if (is_array($row) && is_string($row[$idKey] ?? null)) $before[$row[$idKey]] = $row;
    foreach ($new as $row) if (is_array($row) && is_string($row[$idKey] ?? null)) $after[$row[$idKey]] = $row;
    foreach (array_unique(array_merge(array_keys($before), array_keys($after))) as $id) {
        $a = $before[$id] ?? null; $b = $after[$id] ?? null;
        $fields = $a !== null && $b !== null ? funbikeHistoryFields($a, $b) : [];
        if ($a !== null && $b !== null && !$fields) continue;
        $verb = $a === null ? 'Ajout' : ($b === null ? 'Suppression' : 'Modification');
        if ($kind === 'Produit' && $a !== null && $b !== null && ($a['status'] ?? null) !== ($b['status'] ?? null)) {
            if (($b['status'] ?? '') === 'PUBLISHED') $verb = 'Publication';
            elseif (($b['status'] ?? '') === 'ARCHIVED') $verb = 'Archivage';
        }
        if ($kind === 'Promotion' && $a !== null && $b !== null && ($a['enabled'] ?? null) !== ($b['enabled'] ?? null)) $verb = !empty($b['enabled']) ? 'Activation' : 'Désactivation';
        $item = $b ?? $a; $name = is_string($item['name'] ?? null) ? $item['name'] : $id;
        $subject = $kind . ' : ' . $name . ' (' . $id . ')';
        $result = $status >= 400 ? 'Modification enregistrée malgré une erreur HTTP ' . $status . ' : résultat partiel, à vérifier.' : 'Modification enregistrée.';
        if ($kind === 'Produit' && $b === null) $result .= ' Suppression des fichiers : résultat non vérifié.';
        funbikeHistoryAppend($user, $verb . ' — ' . $kind, $subject, $fields, $result);
        if ($kind === 'Produit' && $b !== null) {
            $oldUrls = []; $newUrls = [];
            foreach (($a['images'] ?? []) as $image) if (is_array($image) && is_string($image['url'] ?? null)) $oldUrls[] = $image['url'];
            foreach (($b['images'] ?? []) as $image) if (is_array($image) && is_string($image['url'] ?? null)) $newUrls[] = $image['url'];
            foreach (array_diff($oldUrls, $newUrls) as $url) funbikeHistoryAppend($user, 'Retrait de référence — photo produit', $subject, [], 'Référence retirée : ' . basename(parse_url($url, PHP_URL_PATH) ?: '') . '. Suppression physique non déduite.');
            foreach (array_diff($newUrls, $oldUrls) as $url) funbikeHistoryAppend($user, 'Ajout de référence — photo produit', $subject, [], 'Référence ajoutée : ' . basename(parse_url($url, PHP_URL_PATH) ?: '') . '.');
        }
        if ($kind === 'Marque' && $a !== null && $b !== null && ($a['logo'] ?? null) !== ($b['logo'] ?? null)) funbikeHistoryAppend($user, 'Changement — logo de marque', $subject, ['logo'], 'Référence du logo modifiée ; le sort des anciens fichiers dépend de l’opération.');
    }
}

function funbikeHistoryFinish()
{
    if (!isset($GLOBALS['funbikeHistoryState'])) return;
    $state = $GLOBALS['funbikeHistoryState']; unset($GLOBALS['funbikeHistoryState']);
    $status = http_response_code(); if (!is_int($status)) $status = 200;
    try {
        foreach ($state['files'] as $name => $capture) {
            $after = json_decode((string) @file_get_contents($capture['path']), true); $before = $capture['before'];
            if (!is_array($after) || !is_array($before)) throw new RuntimeException('Impossible de relire les modifications.');
            if (strpos($name, 'products/') === 0) funbikeHistoryRecordList($state['user'], $before['products'] ?? [], $after['products'] ?? [], 'Produit', 'id', $status);
            elseif ($name === 'promotions.json') funbikeHistoryRecordList($state['user'], $before['campaigns'] ?? [], $after['campaigns'] ?? [], 'Promotion', 'id', $status);
            elseif ($name === 'dealers.json') funbikeHistoryRecordList($state['user'], $before['dealers'] ?? [], $after['dealers'] ?? [], 'Revendeur', 'key', $status);
            elseif (in_array($name, ['brands.json', 'categories.json', 'families.json', 'models.json', 'product-types.json'], true)) {
                $names = ['brands.json' => ['brands','Marque'], 'categories.json' => ['categories','Catégorie'], 'families.json' => ['families','Famille'], 'models.json' => ['models','Modèle'], 'product-types.json' => ['productTypes','Type de produit']];
                [$key, $kind] = $names[$name]; funbikeHistoryRecordList($state['user'], $before[$key] ?? [], $after[$key] ?? [], $kind, 'id', $status);
            } else {
                $fields = funbikeHistoryFields($before, $after);
                if (!$fields) continue;
                $labels = ['contacts.json' => 'Coordonnées', 'homepage.json' => 'Contenu de l’accueil', 'site-logo.json' => 'Bibliothèque des logos du site', 'sherco-banner.json' => 'Bibliothèque des photos de bannière', 'site-theme.json' => 'Thème du site', 'promotions-display.json' => 'Affichage des promotions', 'chatbot-settings.json' => 'Réglages de Piston'];
                funbikeHistoryAppend($state['user'], 'Modification — ' . $labels[$name], $labels[$name], $fields, $status >= 400 ? 'Modification enregistrée malgré une erreur HTTP ' . $status . ' : résultat partiel, à vérifier.' : 'Modification enregistrée.');
            }
        }
        foreach ($state['notes'] as $note) funbikeHistoryAppend($state['user'], $note[0], $note[1], $note[2], $note[3] . ($status >= 400 ? ' La requête a terminé avec une erreur HTTP ' . $status . '.' : ''));
        if ($status >= 400) funbikeHistoryAppend($state['user'], 'Échec — opération administration', $state['request'], [], 'Requête refusée ou échouée (HTTP ' . $status . '). Vérifiez les autres entrées pour les éventuels changements partiels.');
    } catch (Throwable $e) {
        error_log('FUNBIKE historique : événement non enregistré : ' . $e->getMessage());
        if (!headers_sent() && ob_get_level() > 0) {
            ob_clean(); http_response_code(500);
            echo json_encode(['error' => 'La modification a pu être effectuée, mais son historique n’a pas pu être enregistré. Vérifiez les données et le stockage avant de recommencer.'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
    }
}

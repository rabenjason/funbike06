<?php
// Journal privé append-only. Ce module ne reçoit jamais de corps de requête brut.
// Les appels doivent être faits explicitement après vérification du résultat réel.
function funbikeHistoryFile()
{
    return dirname(__DIR__, 2) . '/storage/private/admin-history.jsonl';
}

function funbikeHistoryOpen($write)
{
    $dir = dirname(funbikeHistoryFile());
    if (is_link($dir) || (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir))) throw new RuntimeException('Stockage privé indisponible.');
    $file = funbikeHistoryFile();
    if (is_link($file) || (file_exists($file) && !is_file($file))) throw new RuntimeException('Journal invalide.');
    if (!$write && !file_exists($file)) return null;
    $handle = @fopen($file, $write ? 'c+b' : 'r+b');
    if (!$handle || !flock($handle, $write ? LOCK_EX : LOCK_SH)) {
        if ($handle) fclose($handle);
        throw new RuntimeException('Journal indisponible.');
    }
    if ($write) @chmod($file, 0600);
    return $handle;
}

function funbikeHistoryClose($handle)
{
    if ($handle) { flock($handle, LOCK_UN); fclose($handle); }
}

// Données limitées : noms de champs uniquement, jamais leurs valeurs, mot de
// passe, contenu de message, corps HTTP ou réponse entière.
function funbikeHistoryAppend($user, $type, $subject, $fields = [], $result = '')
{
    if (!is_array($user) || !is_string($user['username'] ?? null) || !is_string($type) || !is_string($subject) || !is_array($fields) || !is_string($result)) throw new InvalidArgumentException('Entrée de journal invalide.');
    foreach ($fields as $field) if (!is_string($field)) throw new InvalidArgumentException('Champ invalide.');
    $entry = [
        'time' => (new DateTimeImmutable('now', new DateTimeZone('Indian/Antananarivo')))->format('Y-m-d\TH:i:sP'),
        'account' => $user['username'], 'type' => $type, 'subject' => $subject,
        'fields' => array_values($fields), 'result' => $result
    ];
    $line = json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($line === false || strlen($line) > 16384) throw new RuntimeException('Entrée de journal trop grande ou invalide.');
    $h = funbikeHistoryOpen(true);
    try {
        // Ne jamais ajouter derrière une ligne incomplète : elle exigerait une
        // intervention et ne doit pas être masquée par un nouvel événement.
        fseek($h, 0, SEEK_END); $size = ftell($h);
        if ($size > 0) { fseek($h, -1, SEEK_END); if (fread($h, 1) !== "\n") throw new RuntimeException('Journal incomplet.'); }
        fseek($h, 0, SEEK_END);
        $line .= "\n";
        if (fwrite($h, $line) !== strlen($line) || !fflush($h)) throw new RuntimeException('Écriture du journal incomplète.');
    } finally { funbikeHistoryClose($h); }
}

function funbikeHistoryRead($filters, $page)
{
    $h = funbikeHistoryOpen(false);
    if (!$h) return ['entries' => [], 'total' => 0, 'page' => $page, 'pages' => 0, 'accounts' => [], 'types' => []];
    $entries = []; $accounts = []; $types = [];
    try {
        while (($line = fgets($h, 16387)) !== false) {
            if (substr($line, -1) !== "\n") throw new RuntimeException('Journal incomplet.');
            $entry = json_decode($line, true);
            if (!is_array($entry) || !is_string($entry['time'] ?? null) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+03:00$/D', $entry['time']) || !is_string($entry['account'] ?? null) || !is_string($entry['type'] ?? null) || !is_string($entry['subject'] ?? null) || !is_array($entry['fields'] ?? null) || !is_string($entry['result'] ?? null)) throw new RuntimeException('Journal endommagé.');
            foreach ($entry['fields'] as $field) if (!is_string($field)) throw new RuntimeException('Journal endommagé.');
            $accounts[$entry['account']] = true; $types[$entry['type']] = true;
            $date = substr($entry['time'], 0, 10);
            if (($filters['account'] !== '' && $entry['account'] !== $filters['account']) || ($filters['type'] !== '' && $entry['type'] !== $filters['type']) || ($filters['from'] !== '' && $date < $filters['from']) || ($filters['to'] !== '' && $date > $filters['to'])) continue;
            if ($filters['q'] !== '' && stripos($entry['subject'], $filters['q']) === false) continue;
            $entries[] = $entry;
        }
        if (!feof($h)) throw new RuntimeException('Lecture du journal impossible.');
    } finally { funbikeHistoryClose($h); }
    // Date décroissante, puis ordre d'écriture décroissant à la même seconde.
    $entries = array_reverse($entries);
    foreach ($entries as $index => &$entry) $entry['_order'] = $index;
    unset($entry);
    usort($entries, function ($a, $b) { $byTime = strcmp($b['time'], $a['time']); return $byTime !== 0 ? $byTime : $a['_order'] <=> $b['_order']; });
    foreach ($entries as &$entry) unset($entry['_order']);
    unset($entry);
    $accounts = array_keys($accounts); $types = array_keys($types); sort($accounts); sort($types);
    $total = count($entries);
    return ['entries' => array_slice($entries, ($page - 1) * 20, 20), 'total' => $total, 'page' => $page, 'pages' => (int)ceil($total / 20), 'accounts' => $accounts, 'types' => $types];
}

<?php
// Shared helpers for subscribe.php and check-match.php.

require __DIR__ . '/vendor/autoload.php';

function pushConfig(): array {
    static $config = null;
    if ($config === null) {
        $config = require __DIR__ . '/config.php';
    }
    return $config;
}

function dataPath(string $name): string {
    return pushConfig()['dataDir'] . '/' . $name;
}

function readJsonFile(string $path, $default) {
    if (!is_file($path)) return $default;
    $raw = @file_get_contents($path);
    if ($raw === false || $raw === '') return $default;
    $decoded = json_decode($raw, true);
    return $decoded === null ? $default : $decoded;
}

// Atomic-ish write: write to a temp file then rename, so a script that dies
// mid-write (or a concurrent cron overlap) never leaves a half-written file
// that the next run would fail to parse.
function writeJsonFile(string $path, $data): void {
    $dir = dirname($path);
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $tmp = $path . '.tmp.' . getmypid();
    file_put_contents($tmp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    rename($tmp, $path);
}

// GET a URL and decode JSON, or null on any failure — callers should treat
// null as "skip this run, try again next time" rather than an error to
// surface loudly (SportScore's own Cloudflare front intermittently sheds
// requests from browsers and scripts alike; cron retries every minute).
function fetchJsonUrl(string $url): ?array {
    $ctx = stream_context_create([
        'http' => [
            'timeout' => 15,
            'ignore_errors' => true,
            'header' => "Accept: application/json\r\n",
        ],
    ]);
    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false) return null;
    $status = 0;
    foreach ($http_response_header ?? [] as $h) {
        if (preg_match('#^HTTP/\S+\s+(\d+)#', $h, $m)) $status = (int) $m[1];
    }
    if ($status !== 200) return null;
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : null;
}

function jsonResponse(int $status, array $body): void {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($body);
}

// ---- Our-player Latin-name resolution ----
//
// Mirrors src/components/Fixtures.tsx's findBySquadLatinName()/
// resolveOurPlayerName() exactly — kept in sync by hand. Used by
// check-match.php's match-facts log so it's readable without a second
// cross-reference pass; not used for push text (kept in the player's own
// SportScore Latin spelling there, to stay unambiguous at a glance).

function normalizeLatin(string $s): string {
    $s = strtolower($s);
    $s = preg_replace('/[·.\-]/', ' ', $s);
    $s = preg_replace('/\s+/', ' ', $s);
    return trim($s);
}

function findBySquadLatinName(string $latinName, array $squad): ?array {
    $wanted = normalizeLatin($latinName);
    if ($wanted === '') return null;
    foreach ($squad as $p) {
        if (!empty($p['nameLatin']) && normalizeLatin($p['nameLatin']) === $wanted) return $p;
    }
    $parts = explode(' ', $wanted);
    $wantedLast = end($parts);
    if ($wantedLast === false || strlen($wantedLast) <= 2) return null;
    foreach ($squad as $p) {
        if (empty($p['nameLatin'])) continue;
        $pParts = explode(' ', normalizeLatin($p['nameLatin']));
        if (end($pParts) === $wantedLast) return $p;
    }
    return null;
}

function resolveOurPlayerName(string $latinName): string {
    static $squad = null;
    if ($squad === null) {
        $squad = readJsonFile(__DIR__ . '/../data/squad.json', ['players' => []])['players'] ?? [];
    }
    $found = findBySquadLatinName($latinName, $squad);
    return $found['name'] ?? $latinName;
}

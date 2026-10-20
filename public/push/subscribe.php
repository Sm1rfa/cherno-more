<?php
// Browser calls this after PushManager.subscribe()/unsubscribe() to tell the
// server which endpoints to push to. Same-origin only (the PWA and this
// script are served from the same host), so no CORS headers needed.

require __DIR__ . '/common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(405, ['error' => 'POST only']);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true);
$action = $body['action'] ?? 'subscribe';
$sub = $body['subscription'] ?? null;

$endpoint = $sub['endpoint'] ?? null;
if (!is_string($endpoint) || $endpoint === '') {
    jsonResponse(400, ['error' => 'missing subscription.endpoint']);
    exit;
}

$path = dataPath('subscriptions.json');
$subscriptions = readJsonFile($path, []);

if ($action === 'unsubscribe') {
    unset($subscriptions[$endpoint]);
} else {
    $p256dh = $sub['keys']['p256dh'] ?? null;
    $auth = $sub['keys']['auth'] ?? null;
    if (!is_string($p256dh) || !is_string($auth)) {
        jsonResponse(400, ['error' => 'missing subscription.keys']);
        exit;
    }
    $subscriptions[$endpoint] = [
        'endpoint' => $endpoint,
        'keys' => ['p256dh' => $p256dh, 'auth' => $auth],
        'addedAt' => date('c'),
    ];
}

writeJsonFile($path, $subscriptions);
jsonResponse(200, ['ok' => true, 'count' => count($subscriptions)]);

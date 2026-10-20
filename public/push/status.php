<?php
// Open this in a browser once, after deploying, to get the exact absolute
// path for the cron job's "Command" field and confirm the server can
// actually run everything check-match.php needs. Safe to delete afterwards
// — it's just diagnostics, no secrets.

require __DIR__ . '/common.php';

$checkMatchPath = __DIR__ . DIRECTORY_SEPARATOR . 'check-match.php';
$dataDir = pushConfig()['dataDir'];

function ok(bool $cond): string {
    return $cond ? '✅' : '❌';
}

$autoloadOk = is_file(__DIR__ . '/vendor/autoload.php');
$opensslOk = extension_loaded('openssl');
$dataWritable = is_dir($dataDir) && is_writable($dataDir);
$subsPath = dataPath('subscriptions.json');
$subsCount = is_file($subsPath) ? count(readJsonFile($subsPath, [])) : 0;

header('Content-Type: text/html; charset=utf-8');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>push/ status</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
  code, pre { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 0.95em; }
  pre { padding: 12px; overflow-x: auto; }
  li { margin: 4px 0; }
</style>
</head>
<body>
  <h1>push/ status</h1>

  <h2>Cron command</h2>
  <p>Absolute path to <code>check-match.php</code> on this server:</p>
  <pre><?= htmlspecialchars(realpath($checkMatchPath) ?: $checkMatchPath) ?></pre>
  <p>Full cron command (adjust the PHP binary path to whatever your host's cron UI suggests, e.g. <code>/usr/local/bin/php</code>):</p>
  <pre>/usr/local/bin/php <?= htmlspecialchars(realpath($checkMatchPath) ?: $checkMatchPath) ?></pre>
  <p>Schedule: <strong>Once Per Minute</strong> (<code>* * * * *</code>) — the script self-gates and does nothing outside an actual match window, so it's safe to leave running all the time.</p>

  <h2>Environment checks</h2>
  <ul>
    <li><?= ok(true) ?> PHP version: <?= PHP_VERSION ?></li>
    <li><?= ok($autoloadOk) ?> Composer autoload present (vendor/autoload.php)</li>
    <li><?= ok($opensslOk) ?> OpenSSL extension loaded (needed to sign/encrypt pushes)</li>
    <li><?= ok($dataWritable) ?> data/ directory writable (<code><?= htmlspecialchars($dataDir) ?></code>)</li>
  </ul>

  <h2>State</h2>
  <ul>
    <li>Current push subscriptions: <?= $subsCount ?></li>
  </ul>

  <p><em>Delete this file once you've confirmed the path and checks above — it has no secrets in it, but no need to leave it public either.</em></p>
</body>
</html>

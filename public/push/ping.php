<?php
// Zero-dependency sanity check — no require, no vendor/autoload, nothing
// that can fail the way status.php's dependencies might. If this also shows
// nothing, the problem is PHP execution or .htaccess itself, not the app
// code. Delete once push/ is confirmed working.
header('Content-Type: text/plain; charset=utf-8');
echo "pong\n";
echo "PHP version: " . phpversion() . "\n";
echo "This file: " . __FILE__ . "\n";
echo "This dir: " . __DIR__ . "\n";

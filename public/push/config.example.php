<?php
// Copy to config.php and fill in. config.php is gitignored because it holds
// the VAPID private key — generate a keypair once via
// Minishlink\WebPush\VAPID::createVapidKeys().

return [
    'vapid' => [
        'subject' => 'https://chernomore.sbonchev.eu',
        'publicKey' => 'your_vapid_public_key_here',
        'privateKey' => 'your_vapid_private_key_here',
    ],
    'sportscore' => [
        'baseUrl' => 'https://sportscore.com',
        'teamSlug' => 'cherno-more-varna',
        // Optional: competitions that get live pushes. Defaults to league +
        // Bulgarian Cup + Bulgarian Pro Cup (DEFAULT_COMPETITIONS in
        // check-match.php); an older single 'competition' key still works.
        // 'competitions' => ['Bulgarian First League', 'Bulgarian Cup', 'BP Cup'],
    ],
    'dataDir' => __DIR__ . '/data',
    // Same window as src/hooks/useLiveMatch.ts on the frontend — kept in
    // sync deliberately, see docs/api-reference.md.
    'preKickoffWindowSec' => 10 * 60,
    'maxWindowSec' => 3 * 60 * 60,
];

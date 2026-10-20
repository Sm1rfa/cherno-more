<?php
// Cron entry point for the News tab — run every 30 minutes. Server-side
// twin of scripts/fetch-news.mjs (same feeds, same filtering, same output
// shape — keep the two in sync by hand): fetches the RSS feeds and rewrites
// ../data/news.json in place, so news stays fresh without rebuilding or
// redeploying. The browser can't fetch the feeds itself (no CORS headers).
//
// Lives in push/ only to share its .htaccess protection and common.php;
// it has nothing to do with push notifications.
//
// If a feed fails, that source's items from the previous news.json are
// kept, so a temporarily-down site never empties the tab. Silent on
// success so cron doesn't email on every run.

require __DIR__ . '/common.php';

const NEWS_PATH = __DIR__ . '/../data/news.json';

function decodeEntities(string $s): string {
    $s = preg_replace('/&#8222;|&#8220;|&quot;/', '"', $s);
    $s = preg_replace('/&#8216;|&#8217;|&#39;|&apos;/', "'", $s);
    $s = preg_replace('/&#8211;|&#8212;/', '-', $s);
    $s = str_replace(['&hellip;', '&lt;', '&gt;', '&amp;'], ['...', '<', '>', '&'], $s);
    return trim($s);
}

function extractTag(string $tag, string $block): string {
    if (!preg_match('#<' . $tag . '[^>]*>([\s\S]*?)</' . $tag . '>#u', $block, $m)) return '';
    $inner = preg_replace(['/^<!\[CDATA\[/', '/\]\]>$/'], '', $m[1]);
    return decodeEntities($inner);
}

function imageFromContentEncoded(string $block): ?string {
    if (!preg_match('#<content:encoded>([\s\S]*?)</content:encoded>#u', $block, $enc)) return null;
    return preg_match('/<img[^>]*src="([^"]*)"/', $enc[1], $img) ? $img[1] : null;
}

function imageFromEnclosure(string $block): ?string {
    return preg_match('/<enclosure url="([^"]*)"/', $block, $m) ? $m[1] : null;
}

$feeds = [
    [
        'url' => 'https://chernomorepfc.bg/feed/',
        'source' => 'chernomorepfc.bg',
        'image' => 'imageFromContentEncoded',
        'keep' => fn(array $item) => true,
    ],
    [
        'url' => 'https://www.varna24.bg/rss.php?cat=3',
        'source' => 'varna24.bg',
        'image' => 'imageFromEnclosure',
        'keep' => fn(array $item) => mb_stripos($item['title'] . ' ' . $item['description'], 'черно море') !== false,
    ],
];

function fetchText(string $url): ?string {
    $ctx = stream_context_create([
        'http' => [
            'timeout' => 20,
            'ignore_errors' => true,
            'header' => "User-Agent: Mozilla/5.0 (compatible; ChernoMorePWA/1.0; +https://chernomore.sbonchev.eu)\r\n",
        ],
    ]);
    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false) return null;
    $status = 0;
    foreach ($http_response_header ?? [] as $h) {
        if (preg_match('#^HTTP/\S+\s+(\d+)#', $h, $m)) $status = (int) $m[1];
    }
    return $status === 200 ? $raw : null;
}

$previous = readJsonFile(NEWS_PATH, []);
$items = [];
$failed = 0;

foreach ($feeds as $feed) {
    $xml = fetchText($feed['url']);
    if ($xml === null) {
        $failed++;
        echo "fetch failed: {$feed['url']} — keeping previous items\n";
        foreach ($previous as $old) {
            if (($old['source'] ?? null) === $feed['source']) $items[] = $old;
        }
        continue;
    }
    foreach (array_slice(explode('<item>', $xml), 1) as $chunk) {
        $block = explode('</item>', $chunk)[0];
        $item = [
            'title' => extractTag('title', $block),
            'link' => extractTag('link', $block),
            'description' => extractTag('description', $block),
            'pubDate' => extractTag('pubDate', $block),
        ];
        $image = $feed['image']($block);
        if ($image !== null) $item['image'] = $image;
        $item['source'] = $feed['source'];
        if ($feed['keep']($item)) $items[] = $item;
    }
}

if ($failed === count($feeds)) exit(1); // nothing new at all — leave news.json untouched

usort($items, fn($a, $b) => strtotime($b['pubDate']) <=> strtotime($a['pubDate']));

// Same format as scripts/fetch-news.mjs, atomically replaced (see writeJsonFile in common.php).
$tmp = NEWS_PATH . '.tmp.' . getmypid();
file_put_contents($tmp, json_encode($items, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
rename($tmp, NEWS_PATH);

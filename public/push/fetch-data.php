<?php
// Refreshes the static data files — data/standings.json, data/fixtures.json
// and data/squad.json — from bulgarian-football.com (official BFU match
// reports). Same files you'd otherwise edit by hand; live match data still
// comes from SportScore and is not touched here.
//
//   php public/push/fetch-data.php            locally: updates public/data/
//   php push/fetch-data.php --quiet           on the server (optional cron)
//
// Options: --force   refresh the squad even if it was refreshed today
//          --dry-run print what would change, write nothing
//          --quiet   print only errors (for cron, so it doesn't email)
//
// What is updated:
//   standings.json  the whole table (Cherno More written as "Черно море")
//   fixtures.json   date, time, opponent and score per round. Existing
//                   "events" are kept as they are; a known score is never
//                   erased; rounds missing from the file are added.
//   squad.json      at most once a day: goals, assists, yellowCards,
//                   redCards (league only) and shirt numbers (latest lineup),
//                   all counted from the league match reports. Players who
//                   appear in a matchday squad but not in squad.json are
//                   added (birth year/nationality/position from their player
//                   page when the site has one).
//                   Hand-maintained fields — name, nameLatin, captain,
//                   heightCm, weightKg, photo, loanedTo, position of existing
//                   players, coaches — are never changed. Players missing on
//                   bulgarian-football.com are only reported, never removed.
//
// Self-contained on purpose (no vendor/ or config.php needed). Writes a file
// only when its content changed, keeping the one-object-per-line layout.

const BF = 'https://bulgarian-football.com';
const LEAGUE_URL = BF . '/parva-liga.html';
const OUR_BF = 'Черно море (Варна)';
const OUR_APP = 'Черно море';
const DATA_DIR = __DIR__ . '/../data';
const STATE_PATH = __DIR__ . '/data/fetch-data-state.json';
const SQUAD_INTERVAL_SEC = 20 * 3600;
const REQUEST_DELAY_US = 1000000;

// bulgarian-football.com spelling => squad.json spelling. Keep in sync with
// scripts/build-history.mjs's NAME_FIXES.
const NAME_FIXES = [
    'Лусиано Скуадроне' => 'Лучано Скуадроне',
    'Идрис Бунас' => 'Идрис Бунаас',
];

const MONTHS = ['януари' => 1, 'февруари' => 2, 'март' => 3, 'април' => 4, 'май' => 5, 'юни' => 6,
    'юли' => 7, 'август' => 8, 'септември' => 9, 'октомври' => 10, 'ноември' => 11, 'декември' => 12];

// Country names as bulgarian-football.com writes them => the English names
// src/utils/nationality.ts knows. Only used for newly added players.
const COUNTRIES = [
    'България' => 'Bulgaria', 'Бразилия' => 'Brazil', 'Португалия' => 'Portugal', 'Испания' => 'Spain',
    'Аржентина' => 'Argentina', 'Франция' => 'France', 'Нидерландия' => 'Netherlands', 'Холандия' => 'Netherlands',
    'Сърбия' => 'Serbia', 'Хърватия' => 'Croatia', 'Северна Македония' => 'North Macedonia', 'Гърция' => 'Greece',
    'Турция' => 'Turkey', 'Румъния' => 'Romania', 'Нигерия' => 'Nigeria', 'Гана' => 'Ghana', 'Камерун' => 'Cameroon',
    "Кот д'Ивоар" => 'Ivory Coast', 'Сенегал' => 'Senegal', 'Мали' => 'Mali', 'Мароко' => 'Morocco',
    'Алжир' => 'Algeria', 'Тунис' => 'Tunisia', 'Египет' => 'Egypt', 'ДР Конго' => 'DR Congo', 'Конго' => 'Congo',
    'Кабо Верде' => 'Cape Verde', 'Гвинея' => 'Guinea', 'Гвинея-Бисау' => 'Guinea-Bissau', 'Гамбия' => 'Gambia',
    'Того' => 'Togo', 'Бенин' => 'Benin', 'Буркина Фасо' => 'Burkina Faso', 'ЮАР' => 'South Africa',
    'Замбия' => 'Zambia', 'Колумбия' => 'Colombia', 'Венецуела' => 'Venezuela', 'Уругвай' => 'Uruguay',
    'Парагвай' => 'Paraguay', 'Чили' => 'Chile', 'Еквадор' => 'Ecuador', 'Перу' => 'Peru', 'Боливия' => 'Bolivia',
    'Украйна' => 'Ukraine', 'Русия' => 'Russia', 'Молдова' => 'Moldova', 'Унгария' => 'Hungary', 'Полша' => 'Poland',
    'Чехия' => 'Czech Republic', 'Словакия' => 'Slovakia', 'Словения' => 'Slovenia',
    'Босна и Херцеговина' => 'Bosnia and Herzegovina', 'Черна гора' => 'Montenegro', 'Албания' => 'Albania',
    'Косово' => 'Kosovo', 'Италия' => 'Italy', 'Германия' => 'Germany', 'Белгия' => 'Belgium', 'Австрия' => 'Austria',
    'Швейцария' => 'Switzerland', 'Англия' => 'England', 'Ирландия' => 'Ireland', 'Швеция' => 'Sweden',
    'Норвегия' => 'Norway', 'Дания' => 'Denmark', 'Финландия' => 'Finland', 'Исландия' => 'Iceland',
    'САЩ' => 'USA', 'Канада' => 'Canada', 'Мексико' => 'Mexico', 'Ямайка' => 'Jamaica', 'Япония' => 'Japan',
    'Южна Корея' => 'South Korea', 'Китай' => 'China', 'Австралия' => 'Australia', 'Израел' => 'Israel',
    'Грузия' => 'Georgia', 'Армения' => 'Armenia', 'Азербайджан' => 'Azerbaijan', 'Кипър' => 'Cyprus',
];

$args = array_slice($argv ?? [], 1);
$force = in_array('--force', $args, true);
$dryRun = in_array('--dry-run', $args, true);
$quiet = in_array('--quiet', $args, true);

function say(string $msg): void {
    global $quiet;
    if (!$quiet) echo $msg, "\n";
}

function fail(string $msg): void {
    fwrite(STDERR, "fetch-data: $msg\n");
}

// ------------------------------------------------------------------ HTTP / HTML

function fetchHtml(string $url): ?string {
    static $last = 0.0;
    $wait = REQUEST_DELAY_US - (int) ((microtime(true) - $last) * 1e6);
    if ($wait > 0) usleep($wait);
    $last = microtime(true);
    $ctx = stream_context_create([
        'http' => [
            'timeout' => 30,
            'ignore_errors' => true,
            'header' => "User-Agent: Mozilla/5.0 (compatible; ChernoMorePWA/1.0; +https://chernomore.sbonchev.eu)\r\n"
                . "Accept-Language: bg,en;q=0.8\r\n",
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

function loadDom(string $html): DOMXPath {
    $doc = new DOMDocument();
    libxml_use_internal_errors(true);
    $doc->loadHTML('<?xml encoding="UTF-8">' . $html, LIBXML_NOWARNING | LIBXML_NOERROR);
    libxml_clear_errors();
    return new DOMXPath($doc);
}

function textOf(?DOMNode $n): string {
    return $n ? trim(preg_replace('/\s+/u', ' ', $n->textContent)) : '';
}

function htmlToText(string $html): string {
    return html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

function romanToInt(string $r): int {
    $map = ['I' => 1, 'V' => 5, 'X' => 10, 'L' => 50, 'C' => 100];
    $n = 0;
    for ($i = 0; $i < strlen($r); $i++) {
        $v = $map[$r[$i]];
        $next = $i + 1 < strlen($r) ? $map[$r[$i + 1]] : 0;
        $n += $v < $next ? -$v : $v;
    }
    return $n;
}

function appTeam(string $bfName): string {
    return $bfName === OUR_BF ? OUR_APP : $bfName;
}

function fixName(string $name): string {
    return NAME_FIXES[$name] ?? $name;
}

// ------------------------------------------------------------------ JSON files

function readJson(string $path): ?array {
    if (!is_file($path)) return null;
    $data = json_decode((string) file_get_contents($path), true);
    return is_array($data) ? $data : null;
}

function jsonValue($v): string {
    return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function flatObject(array $obj): string {
    $parts = [];
    foreach ($obj as $k => $v) $parts[] = jsonValue($k) . ': ' . jsonValue($v);
    return '{ ' . implode(', ', $parts) . ' }';
}

/** Same layout as the hand-edited files: one object per line, events nested. */
function encodeDataFile(array $data, string $listKey, ?string $extraKey = null): string {
    $out = "{\n  \"updatedAt\": " . jsonValue($data['updatedAt']) . ",\n  \"$listKey\": [\n";
    $lines = [];
    foreach ($data[$listKey] as $item) {
        $events = $item['events'] ?? null;
        unset($item['events']);
        if (is_array($events) && $events) {
            $line = '    ' . substr(flatObject($item), 0, -2) . ",\n      \"events\": [\n";
            $line .= implode(",\n", array_map(fn($e) => '        ' . flatObject($e), $events));
            $line .= "\n      ] }";
        } else {
            $line = '    ' . flatObject($item);
        }
        $lines[] = $line;
    }
    $out .= implode(",\n", $lines) . "\n  ]";
    if ($extraKey !== null && array_key_exists($extraKey, $data)) {
        $out .= ",\n  \"$extraKey\": [\n"
            . implode(",\n", array_map(fn($o) => '    ' . flatObject($o), $data[$extraKey]))
            . "\n  ]";
    }
    return $out . "\n}\n";
}

/** Write when the content (ignoring updatedAt) changed. Returns true if written. */
function saveIfChanged(string $name, array $new, ?array $old, string $listKey, ?string $extraKey = null): bool {
    global $dryRun;
    $strip = function (?array $d) { if ($d) unset($d['updatedAt']); return $d; };
    if ($old !== null && $strip($old) == $strip($new)) {
        say("  $name: no changes");
        return false;
    }
    $new['updatedAt'] = date('Y-m-d');
    if ($dryRun) {
        say("  $name: would be updated (dry run)");
        return false;
    }
    $path = DATA_DIR . "/$name";
    $tmp = $path . '.tmp.' . getmypid();
    file_put_contents($tmp, encodeDataFile($new, $listKey, $extraKey));
    rename($tmp, $path);
    say("  $name: updated");
    return true;
}

// ------------------------------------------------------------------ league page

/**
 * Parses the league page's main text block into standings rows and our
 * fixtures. Each line keeps the URL of its "stats" link (match report).
 */
function parseLeague(string $html): array {
    $xp = loadDom($html);
    $pre = null;
    foreach ($xp->query('//pre') as $p) {
        if (mb_strpos($p->textContent, 'Класиране') !== false) { $pre = $p; break; }
    }
    if (!$pre) throw new RuntimeException('league page: standings block not found');

    $standings = [];
    $candidates = [];
    $round = null; $date = null; $time = null;
    foreach (explode("\n", $pre->ownerDocument->saveHTML($pre)) as $rawLine) {
        $line = rtrim(htmlToText($rawLine));
        $statsUrl = preg_match('#<a[^>]+href="([^"]+)"[^>]*>\s*stats\s*</a>#u', $rawLine, $m) ? $m[1] : null;

        // " 1. Левски (София)    10  9  1  0  23:4  28" — first table only.
        if (preg_match('/^\s*(\d+)\.\s+(.+?)\s{2,}(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+):(\d+)\s+(\d+)\b/u', $line, $m)) {
            if ((int) $m[1] === 1 && $standings) continue; // a later table (home/away) — ignore
            if (count($standings) < 20 && (int) $m[1] === count($standings) + 1) {
                $standings[] = ['rank' => (int) $m[1], 'team' => appTeam(trim($m[2])), 'played' => (int) $m[3],
                    'win' => (int) $m[4], 'draw' => (int) $m[5], 'lose' => (int) $m[6],
                    'goalsFor' => (int) $m[7], 'goalsAgainst' => (int) $m[8], 'points' => (int) $m[9]];
            }
            continue;
        }
        if (preg_match('/^\s+([IVXLC]+) кръг/u', $line, $m)) {
            $round = romanToInt($m[1]);
            continue;
        }
        // "23 октомври 2026 г., петък, 19:00 ч / XII кръг:" (time and round optional)
        if (preg_match('/^(\d{1,2}) (\S+) (\d{4}) г\.(.*)$/u', $line, $m) && isset(MONTHS[$m[2]])) {
            $date = sprintf('%04d-%02d-%02d', $m[3], MONTHS[$m[2]], $m[1]);
            $time = preg_match('/(\d{1,2}):(\d{2}) ч/u', $m[4], $t) ? sprintf('%02d:%s', $t[1], $t[2]) : null;
            if (preg_match('/\/\s*([IVXLC]+) кръг/u', $m[4], $r)) $round = romanToInt($r[1]);
            continue;
        }
        // "Черно море (Варна) - Левски (София)      0:2 (0:1) ..."
        if ($round && preg_match('/^(\S.*?\)) - (\S.*?\))\s+(.*)$/u', $line, $m)) {
            [$home, $away, $rest] = [trim($m[1]), trim($m[2]), trim($m[3])];
            if ($home !== OUR_BF && $away !== OUR_BF) continue;
            $entry = ['round' => $round, 'date' => $date, 'time' => $time, 'home' => appTeam($home),
                'away' => appTeam($away), 'homeGoals' => null, 'awayGoals' => null, 'stats' => $statsUrl];
            if (preg_match('/^(\d+):(\d+)/', $rest, $s)) {
                $entry['homeGoals'] = (int) $s[1];
                $entry['awayGoals'] = (int) $s[2];
                $entry['kind'] = 'result';
            } elseif (preg_match('/^(отложен|изтеглен)/u', $rest)) {
                $entry['kind'] = 'placeholder'; // the real (re)scheduled entry is listed elsewhere
                $entry['time'] = null;
            } else {
                $entry['kind'] = 'scheduled';
            }
            $candidates["$round|$home|$away"][] = $entry;
        }
    }

    // Per match: a result wins, then the last scheduled entry, then a placeholder.
    $fixtures = [];
    foreach ($candidates as $list) {
        $pick = null;
        foreach (['result', 'scheduled', 'placeholder'] as $kind) {
            foreach ($list as $e) if ($e['kind'] === $kind) $pick = $e;
            if ($pick) break;
        }
        $fixtures[] = $pick;
    }
    usort($fixtures, fn($a, $b) => $a['round'] <=> $b['round']);
    return [$standings, $fixtures];
}

function mergeFixtures(array $parsed, ?array $old): array {
    $matches = $old['matches'] ?? [];
    $byRound = [];
    foreach ($matches as $i => $m) $byRound[$m['round']] = $i;
    foreach ($parsed as $p) {
        $fields = ['date' => $p['date'], 'time' => $p['time'], 'home' => $p['home'], 'away' => $p['away']];
        if ($p['homeGoals'] !== null) {
            $fields['homeGoals'] = $p['homeGoals'];
            $fields['awayGoals'] = $p['awayGoals'];
        }
        if (isset($byRound[$p['round']])) {
            $i = $byRound[$p['round']];
            foreach ($fields as $k => $v) $matches[$i][$k] = $v;
        } else {
            $matches[] = ['round' => $p['round']] + $fields + ['homeGoals' => null, 'awayGoals' => null];
        }
    }
    usort($matches, fn($a, $b) => $a['round'] <=> $b['round']);
    return ['updatedAt' => $old['updatedAt'] ?? null, 'matches' => array_values($matches)];
}

// ------------------------------------------------------------------ squad

/** Birth year, nationality and position from a player page (only for new players). */
function parsePlayerPage(string $html): array {
    $xp = loadDom($html);
    $details = [];
    foreach ($xp->query("//div[contains(@class,'details')]/div") as $block) {
        $label = textOf($xp->query(".//div[contains(@class,'label')]", $block)->item(0));
        $value = $xp->query(".//div[contains(@class,'value')]", $block)->item(0);
        if ($label === '' || !$value) continue;
        $flags = [];
        foreach ($xp->query(".//span[contains(@class,'flag')]/@title", $value) as $t) $flags[] = $t->value;
        $details[$label] = ['text' => textOf($value), 'flags' => $flags];
    }
    $dob = $details['ДАТА НА РАЖДАНЕ']['text'] ?? '';
    return [
        'nationality' => $details['НАЦИОНАЛНОСТ']['flags'][0] ?? null,
        'birthYear' => preg_match('/\d{2}\.\d{2}\.(\d{4})/', $dob, $m) ? (int) $m[1] : null,
        'position' => $details['ПОЗИЦИЯ']['text'] ?? '',
    ];
}

function positionGroup(string $bfPosition): string {
    $p = mb_strtolower($bfPosition);
    if (str_contains($p, 'вратар')) return 'вратар';
    if (str_contains($p, 'полузащитник')) return 'полузащитник';
    if (str_contains($p, 'защитник')) return 'защитник';
    return 'нападател';
}

/**
 * One match report, our side only: who was in the matchday squad (shirt
 * number, position from its lineup group, player-page link if the site
 * has one) and the goals, assists and cards. Returns null if unreadable.
 */
function parseMatchReport(string $html, string $anchor, bool $weAreHome): ?array {
    $xp = loadDom($html);
    $heading = $xp->query("//*[self::h2 or self::h3 or self::h4][@id='$anchor' or .//*[@id='$anchor'] or .//a[@name='$anchor']]")->item(0);
    if (!$heading) return null;
    $pre = $heading->nextSibling;
    while ($pre && !($pre instanceof DOMElement && $pre->nodeName === 'pre')) $pre = $pre->nextSibling;
    if (!$pre) return null;
    $preHtml = $pre->ownerDocument->saveHTML($pre);
    $links = [];
    if (preg_match_all('#<a[^>]+href="([^"]*/players/[^"]+)"[^>]*>([^<]+)</a>#u', $preHtml, $mm, PREG_SET_ORDER)) {
        foreach ($mm as $m) $links[fixName(trim(htmlToText($m[2])))] = $m[1];
    }
    $text = htmlToText($preHtml);

    // Team abbreviations from "схеми: чмо: 31 - 50, ... / лев: 1 - ..." (home first).
    preg_match_all('/^\s*(?:схеми:)?\s*(\S+):\s*\d+\s+-/mu', $text, $ab);
    $ourAbbr = $ab[1][$weAreHome ? 0 : 1] ?? 'чмо';

    // Lineups: [home block, away block], each ending at "треньор:".
    $players = [];
    $afterCaptains = preg_split('/капитани:[^\n]*\n/u', $text, 2)[1] ?? '';
    $blocks = preg_split('/треньор:[^\n]*/u', $afterCaptains);
    $ours = $blocks[$weAreHome ? 0 : 1] ?? '';
    $ours = preg_replace('/^\s*[^:\n]+:/u', '', $ours, 1);            // drop "Ч.море:"
    // Starters and reserves are each listed in position groups separated by
    // " - ": goalkeeper - defenders - (midfield groups) - forwards.
    foreach (preg_split('/резерви:/u', str_replace("\n", ' ', $ours)) as $section) {
        $groups = preg_split('/\s-\s/u', $section);
        foreach ($groups as $g => $group) {
            $pos = $g === 0 ? 'вратар'
                : ($g === 1 ? 'защитник' : ($g === count($groups) - 1 && $g > 2 ? 'нападател' : 'полузащитник'));
            foreach (explode(',', $group) as $tok) {
                if (!preg_match('/^\s*(\d+)\.\s*(.+?)\s*((?:\((?:вр|к)\)\s*)*)\.?\s*$/u', $tok, $m)) continue;
                $name = fixName(trim($m[2]));
                $players[$name] = ['number' => (int) $m[1], 'href' => $links[$name] ?? null,
                    'position' => str_contains($m[3], 'вр') ? 'вратар' : $pos];
            }
        }
    }
    if (count($players) < 11) return null;

    $stats = [];
    $add = function (string $name, string $key) use (&$stats) {
        // "81.Кристиан Томов (вр) чмо" in event lines: drop goalkeeper/captain markers.
        $name = fixName(trim(preg_replace('/\s*\((?:вр|к)\)/u', '', $name)));
        $stats[$name][$key] = ($stats[$name][$key] ?? 0) + 1;
    };
    $events = explode('събития:', $text, 2)[1] ?? '';
    $prevHome = 0;
    foreach (explode("\n", $events) as $line) {
        // Goal: "0-2 - 62 - 7.Рейналдо Саторно (десен/игра/21.Алдаир Невес/подаване)"
        if (preg_match('/^\s*(\d+)[-:](\d+)\s*-\s*\S+\s*-\s*(?:\d+\.)?\s*([^(]+?)\s*(?:ДУЗПА.*)?(\(.*\))?\s*$/u', $line, $m)) {
            $homeScored = (int) $m[1] > $prevHome;
            $prevHome = (int) $m[1];
            $detail = $m[4] ?? '';
            if ($homeScored !== $weAreHome || mb_stripos($detail . $m[3], 'автогол') !== false) continue;
            $add($m[3], 'goals');
            if (preg_match('/(?:\(|\/|асистенция на\s*)(\d+)\.\s*([^\/)]+)/u', $detail, $am)) $add($am[2], 'assists');
            continue;
        }
        // Card: " жк - 60 - 5.Лусиано Скуадроне чмо (спиране на опасна атака)"
        // ("81.Кристиан Томов (вр) чмо (забавяне)": the team is the last word before the reason.)
        if (preg_match('/^\s*(жк|2жк|чк)\s*-\s*\S+\s*-\s*(?:\d+\.)?\s*(.+?)\s+([^\s()]+)\s*(?:\([^()]*\))?\s*$/u', $line, $m)
            && mb_strtolower($m[3]) === mb_strtolower($ourAbbr)) {
            $add($m[2], $m[1] === 'жк' ? 'yellowCards' : 'redCards');
        }
    }
    return ['players' => $players, 'stats' => $stats];
}

/** Key for matching names across spellings: lower-case, letters only, no doubled letters. */
function nameKey(string $name): string {
    $k = mb_strtolower(fixName($name));
    $k = preg_replace('/[^\p{L} ]/u', '', $k);
    return preg_replace('/(\p{L})\1+/u', '$1', $k);
}

/**
 * Sets the season stats on a squad.json player (zeros omitted, like the
 * hand-written file), in a fixed order and before "loanedTo".
 */
function withStats(array $player, array $stats): array {
    $keys = ['goals', 'assists', 'yellowCards', 'redCards'];
    $loanedTo = $player['loanedTo'] ?? null;
    foreach (array_merge($keys, ['loanedTo']) as $k) unset($player[$k]);
    foreach ($keys as $k) if (($stats[$k] ?? 0) > 0) $player[$k] = $stats[$k];
    if ($loanedTo !== null) $player['loanedTo'] = $loanedTo;
    return $player;
}

function refreshSquad(array $fixtures, ?array $old): ?array {
    if (!$old) { fail('squad.json missing or unreadable — skipped'); return null; }

    // Every played league match's report, oldest first (the latest lineup's
    // shirt number wins). One unreadable report => no squad update at all,
    // rather than writing incomplete season totals.
    $seen = []; $totals = []; $pages = [];
    foreach ($fixtures as $f) {
        if ($f['homeGoals'] === null) continue;
        if (!$f['stats']) { fail("round {$f['round']}: no match report link — squad skipped"); return null; }
        [$url, $anchor] = array_pad(explode('#', $f['stats'], 2), 2, '');
        $pages[$url] ??= fetchHtml($url);
        $r = $pages[$url] === null ? null : parseMatchReport($pages[$url], $anchor, $f['home'] === OUR_APP);
        if (!$r) { fail("round {$f['round']}: match report unreadable ({$f['stats']}) — squad skipped"); return null; }
        foreach ($r['players'] as $name => $p) $seen[nameKey($name)] = ['name' => $name] + $p;
        foreach ($r['stats'] as $name => $s) {
            foreach ($s as $k => $v) $totals[nameKey($name)][$k] = ($totals[nameKey($name)][$k] ?? 0) + $v;
        }
    }

    $squad = $old;
    $index = [];
    foreach ($squad['players'] as $i => $p) $index[nameKey($p['name'])] = $i;
    foreach ($seen as $key => $p) {
        $stats = $totals[$key] ?? [];
        if (isset($index[$key])) {
            $i = $index[$key];
            $oldNumber = $squad['players'][$i]['number'] ?? null;
            if ($oldNumber !== $p['number']) {
                say("  squad: {$p['name']} number " . ($oldNumber ?? '–') . " → {$p['number']} (latest lineup)");
            }
            $squad['players'][$i]['number'] = $p['number'];
            $squad['players'][$i] = withStats($squad['players'][$i], $stats);
            continue;
        }
        // In a matchday squad but not in squad.json: add, with whatever the
        // player page (if bulgarian-football.com has one) tells us.
        $info = ['nationality' => null, 'birthYear' => null, 'position' => ''];
        if ($p['href'] && ($html = fetchHtml($p['href'])) !== null) $info = parsePlayerPage($html);
        $player = ['id' => max(array_column($squad['players'], 'id')) + 1, 'name' => $p['name'],
            'number' => $p['number'], 'position' => $info['position'] !== '' ? positionGroup($info['position']) : $p['position']];
        if ($info['birthYear']) $player['birthYear'] = $info['birthYear'];
        if ($info['nationality']) $player['nationality'] = COUNTRIES[$info['nationality']] ?? $info['nationality'];
        $squad['players'][] = withStats($player, $stats);
        $index[$key] = count($squad['players']) - 1;
        say("  squad: added {$p['name']} (#{$p['number']}, {$player['position']}) — check position/nationality");
    }
    foreach ($squad['players'] as $p) {
        if (!isset($seen[nameKey($p['name'])]) && empty($p['loanedTo'])) {
            say("  squad: {$p['name']} not in any matchday squad this season (left unchanged)");
        }
    }
    return $squad;
}

// ------------------------------------------------------------------ main

try {
    $html = fetchHtml(LEAGUE_URL);
    if ($html === null) throw new RuntimeException('league page unavailable');
    [$standings, $fixtures] = parseLeague($html);
    if (count($standings) < 10) throw new RuntimeException('standings look incomplete (' . count($standings) . ' rows)');
    if (count($fixtures) < 10) throw new RuntimeException('fixtures look incomplete (' . count($fixtures) . ' matches)');
    say('bulgarian-football.com: ' . count($standings) . ' teams, ' . count($fixtures) . ' Cherno More matches');

    $oldStandings = readJson(DATA_DIR . '/standings.json');
    saveIfChanged('standings.json', ['updatedAt' => $oldStandings['updatedAt'] ?? null, 'rows' => $standings],
        $oldStandings, 'rows');

    $oldFixtures = readJson(DATA_DIR . '/fixtures.json');
    saveIfChanged('fixtures.json', mergeFixtures($fixtures, $oldFixtures), $oldFixtures, 'matches');

    $state = readJson(STATE_PATH) ?? [];
    if ($force || time() - ($state['squadRefreshedAt'] ?? 0) >= SQUAD_INTERVAL_SEC) {
        $oldSquad = readJson(DATA_DIR . '/squad.json');
        $squad = refreshSquad($fixtures, $oldSquad);
        if ($squad) {
            saveIfChanged('squad.json', $squad, $oldSquad, 'players', 'coaches');
            if (!$dryRun) {
                if (!is_dir(dirname(STATE_PATH))) mkdir(dirname(STATE_PATH), 0755, true);
                file_put_contents(STATE_PATH, json_encode(['squadRefreshedAt' => time()]));
            }
        }
    } else {
        say('  squad.json: refreshed less than ' . (SQUAD_INTERVAL_SEC / 3600) . 'h ago — skipped (use --force)');
    }
} catch (Throwable $e) {
    fail($e->getMessage() . ' — nothing written for the remaining files');
    exit(1);
}

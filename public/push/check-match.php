<?php
// Cron entry point — call this every minute, forever (e.g. "Once Per
// Minute" in cPanel-style cron UIs). It self-gates: on the ~1430 out of
// 1440 daily runs where no match is imminent, it does one local JSON file
// read and exits — no SportScore request at all. Only inside the actual
// live window (10 min before kickoff to ~3h after, mirroring
// src/hooks/useLiveMatch.ts on the frontend) does it poll SportScore and
// possibly send pushes. Deliberately silent on the idle path so cron
// doesn't email you on every run — only meaningful events or real errors
// print anything.

require __DIR__ . '/common.php';

use Minishlink\WebPush\WebPush;
use Minishlink\WebPush\Subscription;

const OUR_TEAM_NAME = 'Cherno More Varna';
// Incident types worth waking someone's phone up for — subs are too noisy.
const PUSHABLE_INCIDENT_TYPES = ['Goal', 'Yellow card', 'Red card'];
// SportScore competitions whose matches get live pushes (friendlies don't).
// Same list as COMPETITION_LABELS in src/api/providers/sportscore.ts.
// config.php can override it with sportscore.competitions; an older
// config.php's single sportscore.competition is added to the list.
const DEFAULT_COMPETITIONS = ['Bulgarian First League', 'Bulgarian Cup', 'BP Cup'];

function pushCompetitions(array $config): array {
    $list = $config['sportscore']['competitions'] ?? DEFAULT_COMPETITIONS;
    if (isset($config['sportscore']['competition'])) $list[] = $config['sportscore']['competition'];
    $list = array_values(array_unique($list));
    sort($list);
    return $list;
}

function todaysFixture(array $config): ?array {
    $path = dataPath('today-fixture.json');
    $today = gmdate('Y-m-d');
    $cached = readJsonFile($path, null);
    $competitions = pushCompetitions($config);

    // The cache also records which competitions it was computed for, so a
    // changed list (e.g. cups added) takes effect the same day.
    if ($cached !== null && ($cached['computedDate'] ?? null) === $today
        && ($cached['competitions'] ?? null) === $competitions) {
        return $cached['fixture']; // may be null: "checked today, nothing found"
    }

    // limit=50, matching src/api/providers/sportscore.ts: SportScore returns
    // this list in reverse-chronological order starting from the far future,
    // so a small limit can miss the very next match entirely (confirmed —
    // limit=10 returned only 2026-12 through 2027-04 fixtures, skipping
    // today's match altogether).
    $url = $config['sportscore']['baseUrl']
        . '/api/v1/team/?sport=football&slug=' . $config['sportscore']['teamSlug'] . '&limit=50';
    $data = fetchJsonUrl($url);
    if ($data === null) {
        // Couldn't refresh — reuse yesterday's cached fixture if we have one
        // (better than nothing), else give up for this run.
        return $cached['fixture'] ?? null;
    }

    $nowTs = time();
    $candidate = null;
    foreach (($data['matches'] ?? []) as $m) {
        if (!in_array($m['competition'] ?? null, $competitions, true)) continue;
        $kickoff = strtotime($m['time'] ?? '');
        if ($kickoff === false) continue;
        // Keep matches from 4h ago (in case of a restart mid-match) onward.
        if ($kickoff < $nowTs - 4 * 3600) continue;
        if ($candidate === null || $kickoff < strtotime($candidate['time'])) {
            $candidate = $m;
        }
    }

    if ($candidate === null) {
        $fixture = null;
    } else {
        // Same slug choice as matchSlug() in src/api/providers/sportscore.ts:
        // SportScore's own url first ("/football/match/<slug>/<id>/").
        $urlParts = explode('/', $candidate['url'] ?? '');
        $slug = $candidate['slug'] ?? ($urlParts[3] ?? '');
        if ($slug === '') $slug = slugify($candidate['home']) . '-vs-' . slugify($candidate['away']);
        $kickoff = strtotime($candidate['time']);
        $fixture = [
            'slug' => $slug,
            // A slug is shared by every meeting of the same two teams, so
            // state/log files are keyed by slug + date — otherwise the
            // second-half rematch would inherit the first one's state
            // (notifiedFinished, lastIncidentCount) and stay silent.
            'key' => $slug . '-' . gmdate('Ymd', $kickoff),
            'kickoff' => $kickoff,
            'home' => $candidate['home'],
            'away' => $candidate['away'],
        ];
    }

    writeJsonFile($path, ['computedDate' => $today, 'competitions' => $competitions, 'fixture' => $fixture]);
    return $fixture;
}

function slugify(string $name): string {
    $s = strtolower($name);
    $s = preg_replace('/[^a-z0-9]+/', '-', $s);
    return trim($s, '-');
}

function logMatchFacts(array $fixture, array $match, array $newIncidents): void {
    $path = dataPath('match-log/' . $fixture['key'] . '.json');
    $log = readJsonFile($path, [
        'date' => gmdate('Y-m-d', $fixture['kickoff']),
        'competition' => $match['competition'] ?? null,
        'home' => $match['home'] ?? null,
        'away' => $match['away'] ?? null,
        'events' => [],
    ]);

    $log['status'] = $match['status'] ?? null;
    $log['finalScore'] = ($match['home_score'] ?? null) . ':' . ($match['away_score'] ?? null);

    foreach ($newIncidents as $inc) {
        $event = [
            'time' => $inc['time'] ?? null,
            'type' => $inc['type'] ?? null,
            'side' => $inc['side'] ?? null,
        ];
        if (!empty($inc['is_sub'])) {
            $event['playerIn'] = $inc['player_in'] ?? null;
            $event['playerInResolved'] = resolveOurPlayerName($inc['player_in'] ?? '');
            $event['playerOut'] = $inc['player_out'] ?? null;
            $event['playerOutResolved'] = resolveOurPlayerName($inc['player_out'] ?? '');
        } else {
            $event['player'] = $inc['player'] ?? null;
            $event['playerResolved'] = resolveOurPlayerName($inc['player'] ?? '');
        }
        if (!empty($inc['is_goal'])) {
            $event['score'] = ($inc['home_score'] ?? '?') . ':' . ($inc['away_score'] ?? '?');
        }
        $log['events'][] = $event;
    }

    writeJsonFile($path, $log);
}

function sendPushToAll(array $config, string $title, string $body, array $data = []): void {
    $subsPath = dataPath('subscriptions.json');
    $subscriptions = readJsonFile($subsPath, []);
    if (empty($subscriptions)) return;

    $webPush = new WebPush([
        'VAPID' => [
            'subject' => $config['vapid']['subject'],
            'publicKey' => $config['vapid']['publicKey'],
            'privateKey' => $config['vapid']['privateKey'],
        ],
    ]);

    $payload = json_encode(['title' => $title, 'body' => $body, 'data' => $data], JSON_UNESCAPED_UNICODE);

    foreach ($subscriptions as $endpoint => $sub) {
        $webPush->queueNotification(Subscription::create($sub), $payload);
    }

    $deadEndpoints = [];
    foreach ($webPush->flush() as $report) {
        if (!$report->isSuccess() && $report->isSubscriptionExpired()) {
            $deadEndpoints[] = $report->getEndpoint();
        }
    }

    if (!empty($deadEndpoints)) {
        foreach ($deadEndpoints as $endpoint) unset($subscriptions[$endpoint]);
        writeJsonFile($subsPath, $subscriptions);
    }
}

// ---- main ----

$config = pushConfig();

$fixture = todaysFixture($config);
if ($fixture === null) exit; // nothing scheduled soon — idle path, silent

$nowTs = time();
$windowStart = $fixture['kickoff'] - $config['preKickoffWindowSec'];
$windowEnd = $fixture['kickoff'] + $config['maxWindowSec'];
if ($nowTs < $windowStart || $nowTs > $windowEnd) exit; // outside live window — idle path, silent

// Cached before 'key' existed — recompute rather than wait for tomorrow's refresh.
$fixture['key'] = $fixture['key'] ?? ($fixture['slug'] . '-' . gmdate('Ymd', $fixture['kickoff']));

$detailUrl = $config['sportscore']['baseUrl'] . '/api/widget/match/?sport=football&slug=' . $fixture['slug'];
$detail = fetchJsonUrl($detailUrl);
if ($detail === null) exit; // transient fetch failure — try again next minute

$match = $detail['match'] ?? null;
if ($match === null) exit;

// The slug names the pairing, not the game: SportScore can answer with an
// earlier meeting of the same teams (confirmed for the 2026-10-11 Levski
// match, which resolved to the 2026-03-21 one). Same guard as
// fetchMatchDetail() in src/api/providers/sportscore.ts: on a kickoff
// mismatch, use the day's fixture list instead — right game, but only
// score/status, no incidents.
const SAME_MATCH_TOLERANCE_SEC = 12 * 3600;
$scoreOnly = false;
if (abs(strtotime($match['time'] ?? '') - $fixture['kickoff']) > SAME_MATCH_TOLERANCE_SEC) {
    $dayUrl = $config['sportscore']['baseUrl'] . '/api/v1/fixtures/?sport=football&date='
        . gmdate('Y-m-d', $fixture['kickoff']) . '&team=' . $config['sportscore']['teamSlug'];
    $day = fetchJsonUrl($dayUrl);
    if ($day === null) exit;
    $match = null;
    foreach (($day['matches'] ?? []) as $m) {
        if (abs(strtotime($m['time'] ?? '') - $fixture['kickoff']) <= SAME_MATCH_TOLERANCE_SEC) $match = $m;
    }
    if ($match === null) exit;
    $match['incidents'] = [];
    $scoreOnly = true;
}

$statePath = dataPath('match-state-' . $fixture['key'] . '.json');
$state = readJsonFile($statePath, ['lastStatus' => null, 'lastIncidentCount' => 0, 'notifiedFinished' => false]);
// Goals already announced, by either path below — so a switch between the
// score-only and full-detail paths mid-match never announces a goal twice.
$state['goalsPushed'] = $state['goalsPushed'] ?? 0;
$totalGoals = (int)($match['home_score'] ?? 0) + (int)($match['away_score'] ?? 0);

$weHome = strcasecmp($match['home'] ?? '', OUR_TEAM_NAME) === 0;
$ourName = $weHome ? ($match['home'] ?? 'Черно море') : ($match['away'] ?? 'Черно море');
$theirName = $weHome ? ($match['away'] ?? '') : ($match['home'] ?? '');

// Kickoff transition.
if ($state['lastStatus'] !== 'live' && ($match['status'] ?? null) === 'live') {
    sendPushToAll($config, 'Начало на мача', "$ourName – $theirName започва.");
    echo "kickoff push sent\n";
}

// New incidents since last check.
$incidents = $match['incidents'] ?? [];
$newIncidents = array_slice($incidents, $state['lastIncidentCount']);

if (!empty($newIncidents) || $state['lastStatus'] !== ($match['status'] ?? null)) {
    logMatchFacts($fixture, $match, $newIncidents);
}

foreach ($newIncidents as $inc) {
    $type = $inc['type'] ?? '';
    if (!in_array($type, PUSHABLE_INCIDENT_TYPES, true)) continue;

    $isUs = ($inc['side'] ?? null) === ($weHome ? 'home' : 'away');
    $who = $isUs ? $ourName : $theirName;

    if (!empty($inc['is_goal'])) {
        $goalNumber = (int)($inc['home_score'] ?? 0) + (int)($inc['away_score'] ?? 0);
        if ($goalNumber <= $state['goalsPushed']) continue; // already announced via the score-only path
        $state['goalsPushed'] = $goalNumber;
        $title = $isUs ? 'Гол за нас! ⚽' : 'Гол ⚽';
        $score = ($inc['home_score'] ?? '?') . ':' . ($inc['away_score'] ?? '?');
        $body = "{$inc['player']} ({$who}) — {$inc['time']}' — резултат {$score}";
    } else {
        $card = stripos($type, 'red') !== false ? '🟥' : '🟨';
        $title = "$card {$type}";
        $body = "{$inc['player']} ({$who}) — {$inc['time']}'";
    }
    sendPushToAll($config, $title, $body);
    echo "incident push sent: $type\n";
}

// Score-only path: no incidents, so a goal is just "the score went up".
if ($scoreOnly && $totalGoals > $state['goalsPushed']) {
    $score = ($match['home_score'] ?? '?') . ':' . ($match['away_score'] ?? '?');
    sendPushToAll($config, 'Гол ⚽', "{$match['home']} $score {$match['away']}");
    $state['goalsPushed'] = $totalGoals;
    echo "score-change push sent\n";
}

// Full-time.
if (($match['status'] ?? null) === 'finished' && !$state['notifiedFinished']) {
    $score = ($match['home_score'] ?? '?') . ':' . ($match['away_score'] ?? '?');
    sendPushToAll($config, 'Край на мача', "{$match['home']} $score {$match['away']}");
    $state['notifiedFinished'] = true;
    echo "final score push sent\n";
}

$state['lastStatus'] = $match['status'] ?? null;
// Score-only polls have no incidents — keep the real count for when the full detail comes back.
if (!$scoreOnly) $state['lastIncidentCount'] = count($incidents);
writeJsonFile($statePath, $state);

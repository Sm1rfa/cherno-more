#!/usr/bin/env node
// Reshapes the user's own local bg-ft-parser scraper output (full match
// history 2008/09-present, parsed from bulgarian-football.com by their own
// tool) into public/data/history/*.json — one file per season plus an
// index.json with all-time totals.
//
// Reads local files, not a URL — this isn't a fetch step, it's a one-time/
// rerunnable import of data the user already generated themselves.
//
// Deliberately drops each match's starting_xi/bench lineup listing: measured
// 36-43% of those entries across two seasons have bench text bled into the
// player name field (a real bug in the source scraper), too pervasive to
// filter around. The event timeline (goals/cards/subs) has none of that
// corruption (0/734 checked) and is what this script keeps. See
// docs/plans/2026-08-history-data-shaping.md.
//
// Usage: npm run build:history
// Override the source location with HISTORY_SOURCE_DIR if it ever moves.

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE_DIR = process.env.HISTORY_SOURCE_DIR
  ?? 'C:\\Storage\\dev\\python\\bg-ft-parser\\bg_football_parser\\output'
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'history')

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf-8'))
}

// Misspellings in the scraper's output, corrected on the way through so a
// rerun doesn't bring them back. Keep in sync with squad.json's spelling.
const NAME_FIXES = {
  'Лусиано Скуадроне': 'Лучано Скуадроне',
}

function fixName(name) {
  return name == null ? null : (NAME_FIXES[name] ?? name)
}

function isoDate(isoDatetime) {
  return isoDatetime ? isoDatetime.slice(0, 10) : null
}

// Goal events carry a running "home-away" score but no per-goal team flag —
// derive which side scored from whether the home or away number increased.
function makeGoalSideTracker() {
  let prevHome = 0
  return (scoreStr) => {
    const [home] = (scoreStr ?? '0-0').split('-').map(Number)
    const homeScored = home > prevHome
    prevHome = home
    return homeScored ? 'home' : 'away'
  }
}

function mapEvents(rawMatch) {
  const events = []
  const goalSide = makeGoalSideTracker()
  const usIsHome = rawMatch.cherno_more_is_home

  for (const e of rawMatch.events ?? []) {
    if (e.type === 'goal') {
      const side = goalSide(e.details.score)
      events.push({
        type: 'goal',
        minute: e.minute,
        scorer: fixName(e.details.scorer?.name),
        assist: fixName(e.details.assist?.name),
        isPenalty: Boolean(e.details.is_penalty),
        isOwnGoal: Boolean(e.details.is_own_goal),
        forUs: side === 'home' ? usIsHome : !usIsHome,
      })
    } else if (e.type === 'yellow_card' || e.type === 'red_card') {
      events.push({
        type: 'card',
        card: e.type === 'red_card' ? 'red' : 'yellow',
        minute: e.minute,
        player: fixName(e.details.player_name),
        forUs: Boolean(e.details.is_cherno_more),
      })
    } else if (e.type === 'substitution') {
      events.push({
        type: 'substitution',
        minute: e.minute,
        in: fixName(e.details.player_in?.name),
        out: fixName(e.details.player_out?.name),
        forUs: Boolean(e.details.is_cherno_more),
      })
    }
    // captain_change / added_time / var / other: not surfaced in the archive UI
  }
  return events
}

function mapMatch(rawMatch) {
  const usIsHome = rawMatch.cherno_more_is_home
  return {
    round: rawMatch.round_name,
    date: isoDate(rawMatch.iso_datetime),
    opponent: usIsHome ? rawMatch.away_team : rawMatch.home_team,
    isHome: usIsHome,
    score: rawMatch.score_display,
    venue: rawMatch.venue,
    city: rawMatch.city,
    referee: rawMatch.officials?.referee ?? null,
    attendance: rawMatch.attendance,
    weather: rawMatch.weather,
    events: mapEvents(rawMatch),
  }
}

function mapLeaderboard(list, statKey, outKey) {
  return (list ?? []).map((p) => ({ name: fixName(p.name), number: p.number, [outKey]: p[statKey] }))
}

async function buildSeason(slug) {
  const matchesPath = join(SOURCE_DIR, `cherno_more_matches_${slug}.json`)
  const statsPath = join(SOURCE_DIR, `cherno_more_stats_${slug}.json`)
  const [rawMatches, rawStats] = await Promise.all([readJson(matchesPath), readJson(statsPath)])

  const season = slug === 'current' ? 'current' : slug.replace('_', '-')
  const s = rawStats.season_summary

  const seasonData = {
    season,
    summary: {
      played: s.matches_played,
      wins: s.wins,
      draws: s.draws,
      losses: s.losses,
      goalsFor: s.goals_scored,
      goalsAgainst: s.goals_conceded,
      cleanSheets: s.clean_sheets,
      coaches: s.coaches,
    },
    topScorers: mapLeaderboard(rawStats.top_scorers, 'goals', 'goals'),
    topAssisters: mapLeaderboard(rawStats.top_assisters, 'assists', 'assists'),
    mostCarded: (rawStats.most_carded_players ?? []).map((p) => ({
      name: fixName(p.name), number: p.number, yellowCards: p.yellow_cards, redCards: p.red_cards,
    })),
    matches: rawMatches.map(mapMatch),
  }

  await writeFile(join(OUT_DIR, `${season}.json`), `${JSON.stringify(seasonData, null, 2)}\n`, 'utf-8')
  return { season, ...seasonData.summary }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const files = await readdir(SOURCE_DIR)
  const slugs = files
    .map((f) => f.match(/^cherno_more_matches_(.+)\.json$/)?.[1])
    .filter(Boolean)
    .sort() // 'current' sorts last among 4-digit years, which is what we want

  const seasons = []
  for (const slug of slugs) {
    console.log(`Building ${slug}...`)
    seasons.push(await buildSeason(slug))
  }

  const allTime = seasons.reduce(
    (acc, s) => ({
      played: acc.played + s.played,
      wins: acc.wins + s.wins,
      draws: acc.draws + s.draws,
      losses: acc.losses + s.losses,
      goalsFor: acc.goalsFor + s.goalsFor,
      goalsAgainst: acc.goalsAgainst + s.goalsAgainst,
    }),
    { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 },
  )

  const index = {
    seasons: seasons.map(({ season, played, wins, draws, losses }) => ({ season, played, wins, draws, losses })).reverse(),
    allTime,
  }
  await writeFile(join(OUT_DIR, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf-8')

  console.log(`Wrote ${seasons.length} season file(s) + index.json to ${OUT_DIR}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

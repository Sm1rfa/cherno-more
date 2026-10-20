# public/data — hand-edited content

Plain JSON, fetched by the app at runtime (`fetch('/data/whatever.json')`) — **not** bundled into the JS. Editing one of these and redeploying just that file is enough; no app rebuild needed. See `docs/api-reference.md` for the full picture (caching, fallback to goal.bg, etc.) — this file is just the quick "what do I type" reference.

Team names are plain strings — Cherno More is always written exactly `"Черно море"`, home or away, in both `fixtures.json` and `standings.json`. That exact string is how the app knows which side is "us."

## `squad.json`

```json
{
  "updatedAt": "2026-08-29",
  "players": [
    { "id": 1, "name": "...", "number": 81, "position": "вратар",
      "birthYear": 2002, "nationality": "Bulgaria",
      "nameLatin": "optional", "captain": true,
      "heightCm": 178, "weightKg": 72,
      "goals": 0, "assists": 0, "yellowCards": 0, "redCards": 0,
      "loanedTo": "optional — club name, if out on loan elsewhere" }
  ],
  "coaches": [
    { "id": 1, "name": "...", "role": "Старши треньор" }
  ]
}
```

`position` is one of `вратар` / `защитник` / `полузащитник` / `нападател`. Everything except `id`, `name`, `number`, `position` is optional — just omit a field if you don't have it. `nationality` is a country name in English (`"Bulgaria"`, `"Nigeria"`, ...) — it drives a flag emoji lookup in `src/utils/nationality.ts`; unlisted countries just show no flag. `nameLatin` is also used as a matching key for translating live match incidents/lineups (see `docs/api-reference.md`'s "Live match detail" section) — when set, it should match the spelling SportScore actually uses for that player, not necessarily the "prettiest" transliteration. `loanedTo` keeps a loaned-out player in the roster (dimmed, with a note) rather than deleting them — their season-to-date stats stay visible, and they're excluded from the squad-composition stats (Bulgarians/foreigners/average age) at the top of the tab.

## `fixtures.json`

```json
{
  "updatedAt": "2026-08-29",
  "matches": [
    { "round": 1, "date": "2026-07-19", "time": "19:30",
      "home": "Ботев (Враца)", "away": "Черно море",
      "homeGoals": 1, "awayGoals": 1 },
    { "round": 7, "date": "2026-08-30", "time": null,
      "home": "ЦСКА (София)", "away": "Черно море",
      "homeGoals": null, "awayGoals": null }
  ]
}
```

`time: null` means the kickoff time isn't announced yet (shows "Часът предстои" in the app). `homeGoals`/`awayGoals: null` means the match hasn't been played yet.

Played matches may also carry an optional `events` array — goals, cards and substitutions, in the same shape as the History tab's `HistoryEvent` (`src/types/history.ts`):

```json
{ "type": "goal", "minute": "70", "scorer": "Георги Лазаров", "assist": null, "isPenalty": false, "isOwnGoal": false, "forUs": true },
{ "type": "card", "card": "red", "minute": "87", "player": "Живко Атанасов", "forUs": true },
{ "type": "substitution", "minute": "82", "in": "Иван Тасев", "out": "Асен Дончев", "forUs": true }
```

Our players are always the exact `squad.json` name, so per-player tallies can be summed straight from these. Opponents' names are Cyrillic where the source had them, Latin otherwise. Rounds 1–6 came from `history/current.json` (includes assists); rounds 7+ from SportScore's `/api/widget/match/` incidents, which have **no assist, penalty or own-goal info** (those fields are `null`/`false`, not verified). Nothing in the app renders `events` yet — `manual.ts` ignores the field.

## `standings.json`

```json
{
  "updatedAt": "2026-08-29",
  "rows": [
    { "rank": 1, "team": "ФК ЦСКА 1948 (София)",
      "played": 7, "win": 5, "draw": 1, "lose": 1,
      "goalsFor": 15, "goalsAgainst": 7, "points": 16 }
  ]
}
```

## `news.json`

Generated, not hand-edited. On the live server a cron job (`push/fetch-news.php`, every 30 min) regenerates it from the club's and Varna24's RSS feeds; locally, `npm run fetch:news` does the same. Don't edit by hand; your changes would just get overwritten next run.

## Updating any of these

1. Edit the file (or re-paste an updated bulgarian-football.com page as a `.txt` and ask for it to be re-parsed).
2. Bump `updatedAt`.
3. Commit, push — your host rebuilds and redeploys. The rebuild itself is trivial (these files aren't compiled, just copied), and once goal.bg is wired up as the live source, updating these becomes optional — they're the fallback, not the only path.

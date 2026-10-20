# Черно море PWA

Unofficial fan app for PFC Cherno More Varna: fixtures, live match, standings, squad, history, news and push notifications. Built with React, Vite and Tailwind, installable as a PWA. Live at https://chernomore.sbonchev.eu.

Docs are in [`docs/`](docs/README.md). Start with [`docs/api-reference.md`](docs/api-reference.md) for how the data works, and [`public/data/README.md`](public/data/README.md) to hand-edit fixtures, standings or squad.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm run lint
```

Optional data refreshes, to run before a build when you want them:

```sh
npm run fetch:data      # refreshes public/data/standings.json, fixtures.json, squad.json from bulgarian-football.com
npm run fetch:news      # regenerates public/data/news.json locally (on the server, cron does this — see Deploy)
npm run build:history   # regenerates public/data/history/*.json from the local bg-ft-parser output
```

`fetch:data` runs `public/push/fetch-data.php`, so it needs PHP 8.2+ but no
Node or Composer. It prints what changed: rescheduled or finished matches,
shirt-number changes, new players to complete by hand (position/nationality),
and squad players who haven't been in a matchday squad. Hand-maintained
fields (`nameLatin`, `captain`, height/weight, `photo`, `loanedTo`, coaches)
are never touched; see the comment at the top of the script for the rules.
The squad part runs at most once per 20 hours. Add `-- --force` to run it
anyway, or `-- --dry-run` to preview without writing.

## Build

```sh
npm run build      # type-checks (tsc -b), then builds into dist/
npm run preview    # optional: serve dist/ locally to check it
```

`VITE_*` variables from `.env` are baked into the JS at build time, so change `.env` before building, not after. All of them are optional: without a goal.bg key, the app uses SportScore and falls back to `public/data/`. See `.env.example`.

`dist/` is the complete site: the app, the `data/` JSON files, and the PHP push backend in `push/`, with its dependencies already in `push/vendor/`. The server needs no Node or Composer, only Apache and PHP ≥ 8.2.

## Deploy

Upload the **contents** of `dist/` (not the `dist` folder itself) to the site's web root.

```
dist/
├── index.html, sw.js, registerSW.js, manifest.webmanifest   app shell
├── assets/                     JS/CSS, file names change every build
├── data/                       fixtures, standings, squad, news, history (JSON)
├── push/                       PHP Web Push backend + vendor/
│   ├── .htaccess               ⚠ hidden file, must be uploaded
│   └── data/.htaccess          ⚠ hidden file, must be uploaded
├── *.jpg, *.png, *.svg         icons
└── robots.txt, sitemap.xml
```

Things to watch:

- **Upload the `.htaccess` files.** Many FTP clients hide dotfiles by default. Without them, `push/config.php` (which holds the VAPID private key) and `push/data/` (the subscriber list) are readable by anyone.
- **Never delete or overwrite the server's `push/data/*.json`.** That folder holds `subscriptions.json` (everyone who turned notifications on) and per-match state, all created on the server. Your local `dist/push/data/` only contains `.htaccess`. So don't use an upload mode like "mirror" or "sync with delete" on `push/`, or every subscriber is lost.
- Old files in `assets/` can be deleted after an upload. Every build gives them new hashed names, and nothing references the old ones.

### What to upload for each kind of change

| What changed | Upload |
|---|---|
| Only JSON data (`fixtures.json`, `squad.json`, `standings.json`, `news.json`, history) | just those files into `data/`. No rebuild needed: you can upload straight from `public/data/`. |
| App code (`src/`, `index.html`, `vite.config.ts`) | rebuild, then upload `index.html`, `sw.js`, `registerSW.js`, `manifest.webmanifest` and `assets/` |
| Push backend (`public/push/*.php`) | the changed `.php` files into `push/` |
| Push dependencies (`public/push/composer.json`) | `push/vendor/` (5.6 MB). Otherwise it only needs uploading on the very first deploy. |
| Not sure | everything in `dist/`, following the push-data rule above |

Installed PWAs pick up a new app version automatically on their next visit (`registerType: 'autoUpdate'`). Data files are always fetched from the network first, so a JSON-only upload shows up right away too.

### First deploy only: cron jobs

Add these cron jobs in the hosting panel (the third is optional):

| Schedule | Command | What it does |
|---|---|---|
| every minute | `/path/to/php8.2-or-newer /home/<account>/<webroot>/push/check-match.php` | live-match push notifications. Exits immediately unless a Cherno More match is within its live window. |
| every 30 minutes (`*/30 * * * *`) | `/path/to/php8.2-or-newer /home/<account>/<webroot>/push/fetch-news.php` | refreshes `data/news.json` from the club's and Varna24's RSS feeds, so news needs no rebuild. |
| *optional*, every 3 hours (`0 */3 * * *`) | `/path/to/php8.2-or-newer /home/<account>/<webroot>/push/fetch-data.php --quiet` | refreshes `data/standings.json`, `data/fixtures.json` and (once a day) `data/squad.json` from bulgarian-football.com, so results, rescheduled matches and season stats need no upload. Silent unless something fails. Without it, run `npm run fetch:data` locally and upload those three files. |

Make sure the PHP binary is ≥ 8.2: the generic `php` on shared hosts is often older. To find the absolute path and PHP version, open `https://<site>/push/status.php` once. **Delete `push/status.php` and `push/ping.php` from the server afterwards**, since they're diagnostics only. PHP must be able to write to `push/data/` and `data/`.

If a feed is down, `fetch-news.php` keeps that source's previous items rather than emptying the tab. Uploading `dist/data/` overwrites `news.json` with whatever snapshot was in the build, which is harmless: the next cron run, within 30 minutes, brings it up to date.

Background on the push setup is in [`docs/plans/2026-08-live-match-and-push.md`](docs/plans/2026-08-live-match-and-push.md).

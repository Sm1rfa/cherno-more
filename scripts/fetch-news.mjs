#!/usr/bin/env node
// Fetches two public RSS feeds and merges them into a static JSON snapshot
// at public/data/news.json, newest first:
//  - https://chernomorepfc.bg/feed/  — official club feed, everything kept
//  - https://www.varna24.bg/rss.php?cat=3 — general Varna sports feed,
//    filtered down to items mentioning "черно море" (it covers all local
//    sports, not just this club)
//
// Not fetched client-side: neither feed sends CORS headers, so a browser
// fetch() would be blocked in production regardless — a periodic
// server-side snapshot is the right shape either way. It's written under
// public/, not src/, so replacing it doesn't require rebuilding the app —
// see public/data/README.md.
//
// Re-run whenever you want fresh news locally: `npm run fetch:news`. On the
// live server, public/push/fetch-news.php does the same job from cron —
// keep the two in sync (same feeds, filtering and output shape).

import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'news.json')

function decodeEntities(s) {
  return s
    .replace(/&#8222;|&#8220;|&quot;/g, '"')
    .replace(/&#8216;|&#8217;|&#39;|&apos;/g, "'")
    .replace(/&#8211;|&#8212;/g, '-')
    .replace(/&hellip;/g, '...')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
}

function extract(tag, block) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))
  if (!m) return ''
  const inner = m[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '')
  return decodeEntities(inner)
}

function imageFromContentEncoded(block) {
  const encoded = block.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/)
  if (!encoded) return undefined
  const img = encoded[1].match(/<img[^>]*src="([^"]*)"/)
  return img ? img[1] : undefined
}

function imageFromEnclosure(block) {
  const m = block.match(/<enclosure url="([^"]*)"/)
  return m ? m[1] : undefined
}

const FEEDS = [
  {
    url: 'https://chernomorepfc.bg/feed/',
    source: 'chernomorepfc.bg',
    image: imageFromContentEncoded,
    keep: () => true,
  },
  {
    url: 'https://www.varna24.bg/rss.php?cat=3',
    source: 'varna24.bg',
    image: imageFromEnclosure,
    keep: (item) => `${item.title} ${item.description}`.toLowerCase().includes('черно море'),
  },
]

async function fetchFeed({ url, source, image, keep }) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}: ${res.statusText}`)
  const xml = await res.text()
  const blocks = xml.split('<item>').slice(1).map((b) => b.split('</item>')[0])

  return blocks
    .map((block) => ({
      title: extract('title', block),
      link: extract('link', block),
      description: extract('description', block),
      pubDate: extract('pubDate', block),
      image: image(block),
      source,
    }))
    .filter(keep)
}

async function main() {
  const results = await Promise.all(FEEDS.map(fetchFeed))
  const items = results
    .flat()
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())

  await writeFile(OUT_PATH, `${JSON.stringify(items, null, 2)}\n`, 'utf-8')
  console.log(`Wrote ${items.length} news item(s) to ${OUT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

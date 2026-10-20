import { useEffect, useState } from 'react'

interface NewsItem {
  title: string
  link: string
  description: string
  pubDate: string
  image?: string
  source: string
}

function formatDate(pubDate: string) {
  const d = new Date(pubDate)
  if (Number.isNaN(d.getTime())) return pubDate
  return d.toLocaleDateString('bg-BG', { day: '2-digit', month: 'short', year: 'numeric' })
}

function NewsCard({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-[#1a3a1a] rounded-xl border border-[#2a5a2a] overflow-hidden hover:border-green-500 transition-colors"
    >
      {item.image && (
        <img src={item.image} alt="" className="w-full h-40 object-cover" loading="lazy" />
      )}
      <div className="p-3 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">{formatDate(item.pubDate)}</p>
          <p className="text-xs text-green-500">{item.source}</p>
        </div>
        <p className="text-white text-sm font-semibold leading-tight">{item.title}</p>
        <p className="text-gray-400 text-xs leading-snug line-clamp-3">{item.description}</p>
      </div>
    </a>
  )
}

export default function News() {
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/data/news.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
        return res.json() as Promise<NewsItem[]>
      })
      .then(setItems)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-4 space-y-3 pb-8">
      <span className="text-xs text-gray-500 uppercase tracking-widest">Новини</span>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 rounded-full border-4 border-green-500 border-t-transparent animate-spin" />
        </div>
      )}

      {error && (
        <div className="bg-red-900/40 border border-red-600 rounded-lg p-4 text-red-300 text-sm">
          <p className="font-semibold mb-1">Грешка при зареждане</p>
          <p className="font-mono text-xs break-all">{error}</p>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="text-center text-green-400 py-12 text-sm">
          Няма новини в момента. Обновете с <code className="bg-black/30 px-1 rounded">npm run fetch:news</code>.
        </p>
      )}

      <div className="space-y-3">
        {items.map((item) => <NewsCard key={item.link} item={item} />)}
      </div>
    </div>
  )
}

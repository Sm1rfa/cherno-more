import { useCallback, useEffect, useState } from 'react'
import type { Standing } from '../types/football'
import { fetchStandings, fetchStandingsMeta, TEAM_ID } from '../api/football'
import { teamNameBg } from '../utils/teamNames'

const CHERNO_MORE_ID = Number(TEAM_ID)

// SportScore gives a real zone color (row.color) — use it directly when
// present. goal.bg and the manual dataset don't, so fall back to a keyword
// guess from the human-readable `description` they do provide.
const ZONE_RULES: Array<{ pattern: RegExp; color: string }> = [
  { pattern: /champions|шампион|първа група|title play/i, color: '#2AD572' },
  { pattern: /europa|conference|плейоф|среден етап|втора група/i, color: '#7FAEFF' },
  { pattern: /relegation|изпад|отпадане|трета група/i, color: '#FFA72F' },
]

function zoneColor(row: Standing): string {
  if (row.color) return row.color
  if (!row.description) return 'transparent'
  return ZONE_RULES.find((r) => r.pattern.test(row.description!))?.color ?? '#4b5563'
}

// SportScore's zone names are English — translate the ones it actually
// sends so the legend stays consistent with the rest of the (Bulgarian) UI.
// Anything unrecognized (e.g. goal.bg's/manual's own Bulgarian text) passes through.
const ZONE_LABEL_BG: Record<string, string> = {
  'Title Play-offs': 'Плейоф за титлата',
  'UEFA ECL qualifying playoffs': 'Плейоф за Лига на конференциите',
  'Relegation Playoffs': 'Плейоф за оцеляване',
}

function zoneLabel(description: string): string {
  return ZONE_LABEL_BG[description] ?? description
}

export default function Standings() {
  const [rows, setRows] = useState<Standing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<{ updatedAt: string } | null>(null)

  const load = useCallback((force = false) => {
    setLoading(true)
    fetchStandings({ force })
      .then(setRows)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { fetchStandingsMeta().then(setMeta).catch(() => setMeta(null)) }, [])

  // Build zone legend (unique descriptions in order)
  const legend = [...new Map(
    rows.filter((r) => r.description).map((r) => [zoneLabel(r.description as string), zoneColor(r)]),
  ).entries()]

  return (
    <div className="p-4 pb-8 space-y-3">

      <div className="flex justify-end">
        <button
          onClick={() => load(true)}
          disabled={loading}
          title="Опресни (пропуска кеша)"
          className="text-xs text-green-400 hover:text-white disabled:opacity-50 px-1.5 py-0.5 rounded border border-[#2a5a2a]"
        >
          ↻
        </button>
      </div>

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

      {!loading && !error && rows.length > 0 && (
        <>
          {/* Zone legend */}
          {legend.length > 0 && (
            <div className="flex flex-wrap gap-3 text-xs text-gray-400 px-1">
              {legend.map(([label, color]) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                  {label}
                </span>
              ))}
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-[#2a5a2a] shadow-lg">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#0a1f0a] text-green-400 text-xs uppercase tracking-wider">
                  <th className="w-1 py-3" />
                  <th className="px-2 py-3 text-center w-7">#</th>
                  <th className="px-2 py-3 text-left">Отбор</th>
                  <th className="px-2 py-3 text-center" title="Мачове">М</th>
                  <th className="px-2 py-3 text-center text-green-400" title="Победи">П</th>
                  <th className="px-2 py-3 text-center text-yellow-400" title="Равни">Р</th>
                  <th className="px-2 py-3 text-center text-red-400" title="Загуби">З</th>
                  <th className="px-2 py-3 text-center hidden sm:table-cell" title="Голове">Г</th>
                  <th className="px-2 py-3 text-center" title="Голова разлика">ГР</th>
                  <th className="px-2 py-3 text-center font-bold text-white">Т</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const isUs = row.team.id === CHERNO_MORE_ID
                  const color = zoneColor(row)
                  return (
                    <tr
                      key={row.team.id}
                      className={`border-t transition-colors ${
                        isUs
                          ? 'bg-gradient-to-r from-[#1e6b1e] to-[#1a5c1a] border-green-600'
                          : i % 2 === 0
                          ? 'bg-[#0f2e0f] border-[#192e19]'
                          : 'bg-[#122012] border-[#192e19]'
                      }`}
                    >
                      {/* Qual color bar */}
                      <td className="w-1 py-0">
                        <div className="h-full w-1 min-h-[38px] rounded-sm" style={{ backgroundColor: color }} />
                      </td>

                      {/* Rank */}
                      <td className="px-2 py-2.5 text-center">
                        <span className={`text-xs font-bold ${isUs ? 'text-green-300' : 'text-gray-500'}`}>
                          {row.rank}
                        </span>
                      </td>

                      {/* Team name */}
                      <td className="px-2 py-2.5 max-w-[120px] sm:max-w-none">
                        <span className="flex items-center gap-1.5 min-w-0">
                          {row.team.logo && (
                            <img src={row.team.logo} alt="" className="h-4 w-4 flex-shrink-0 object-contain" loading="lazy" />
                          )}
                          <span className={`block truncate leading-tight ${
                            isUs
                              ? 'text-white font-black uppercase tracking-wider text-xs sm:text-sm'
                              : 'text-gray-200 text-xs sm:text-sm'
                          }`}>
                            {isUs ? 'ЧЕРНО МОРЕ ВАРНА' : teamNameBg(row.team.name)}
                          </span>
                        </span>
                      </td>

                      {/* Stats */}
                      <td className="px-2 py-2.5 text-center text-xs text-gray-300">{row.all.played}</td>
                      <td className="px-2 py-2.5 text-center text-xs text-green-400 font-medium">{row.all.win}</td>
                      <td className="px-2 py-2.5 text-center text-xs text-yellow-400">{row.all.draw}</td>
                      <td className="px-2 py-2.5 text-center text-xs text-red-400">{row.all.lose}</td>
                      <td className="px-2 py-2.5 text-center text-xs text-gray-400 hidden sm:table-cell">
                        {row.all.goals.for}-{row.all.goals.against}
                      </td>
                      <td className="px-2 py-2.5 text-center text-xs">
                        <span className={
                          row.goalsDiff > 0 ? 'text-green-400' :
                          row.goalsDiff < 0 ? 'text-red-400' : 'text-gray-400'
                        }>
                          {row.goalsDiff > 0 ? `+${row.goalsDiff}` : row.goalsDiff}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <span className={`font-black text-sm ${isUs ? 'text-green-300' : 'text-white'}`}>
                          {row.points}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {meta && (
        <p className="text-center text-xs text-gray-600 pt-2">
          Обновено {meta.updatedAt}
        </p>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { getCurrentSubscription, isPushSupported, subscribeToPush, unsubscribeFromPush } from '../push'

type Status = 'checking' | 'unsupported' | 'denied' | 'off' | 'on'

export default function NotificationToggle() {
  const [status, setStatus] = useState<Status>('checking')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isPushSupported()) {
      setStatus('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setStatus('denied')
      return
    }
    getCurrentSubscription()
      .then((sub) => setStatus(sub ? 'on' : 'off'))
      .catch(() => setStatus('off'))
  }, [])

  if (status === 'checking' || status === 'unsupported') return null

  async function toggle() {
    setBusy(true)
    setError(null)
    try {
      if (status === 'on') {
        await unsubscribeFromPush()
        setStatus('off')
      } else {
        await subscribeToPush()
        setStatus('on')
      }
    } catch (e) {
      setError((e as Error).message)
      if (Notification.permission === 'denied') setStatus('denied')
    } finally {
      setBusy(false)
    }
  }

  if (status === 'denied') {
    return (
      <p className="text-center text-[10px] text-gray-500 py-0.5 border-t border-black/20">
        Известията са блокирани от браузъра — разреши ги от настройките му, за да ги включиш.
      </p>
    )
  }

  return (
    <div className="text-center py-0.5 border-t border-black/20">
      <button
        onClick={toggle}
        disabled={busy}
        className="text-[10px] text-green-300/70 hover:text-green-200 disabled:opacity-50"
      >
        {status === 'on' ? '🔔 Известията са включени (изключи)' : '🔕 Включи известия за голове и резултати'}
      </button>
      {error && <p className="text-[10px] text-red-400 mt-0.5">{error}</p>}
    </div>
  )
}

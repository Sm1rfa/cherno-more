// Web Push subscribe/unsubscribe — talks to public/push/subscribe.php
// (same origin, so a plain relative fetch) and the VAPID public key from
// public/push/config.php (public by design — only the private key there is
// secret). Keep this in sync if the VAPID keypair is ever regenerated.

const VAPID_PUBLIC_KEY = 'BC94WZpMxkhm69OcRpQk-nujgBaZthsVrCwzQG4oV5c5pfTHc9dy2Vmt7RXZBID6cvlpQgNderFwt-0fRXwlZoQ'

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// PushManager.subscribe() wants the VAPID key as a Uint8Array, not the
// base64url string it's distributed as — standard boilerplate conversion.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

async function postSubscription(action: 'subscribe' | 'unsubscribe', subscription: PushSubscription): Promise<void> {
  const res = await fetch('/push/subscribe.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, subscription: subscription.toJSON() }),
  })
  if (!res.ok) throw new Error(`subscribe.php: HTTP ${res.status}`)
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

export async function subscribeToPush(): Promise<void> {
  if (!isPushSupported()) throw new Error('Push notifications not supported in this browser')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission denied')

  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }))

  await postSubscription('subscribe', subscription)
}

export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await getCurrentSubscription()
  if (!subscription) return
  await postSubscription('unsubscribe', subscription)
  await subscription.unsubscribe()
}

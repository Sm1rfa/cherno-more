import NotificationToggle from './NotificationToggle'

export default function Header() {
  return (
    <header className="bg-gradient-to-b from-[#0f2e0f] to-[#1a5c1a] text-white shadow-lg">
      <div className="flex items-center gap-4 px-4 py-3">
        <img
          src="/emblema-1.jpg"
          alt="Черно Море герб"
          className="h-14 w-14 rounded-full border-2 border-[#c9a227] object-cover shadow-md"
        />
        <div>
          <h1 className="text-xl font-bold tracking-wide leading-tight">ПФК Черно Море</h1>
          <p className="text-xs text-green-300 tracking-widest uppercase">Варна • 1913</p>
        </div>
      </div>
      {/* Required by SportScore's free-tier terms: a visible, dofollow link
          on every screen that renders their data (fixtures/standings). */}
      <a
        href="https://sportscore.com/"
        rel="dofollow noopener"
        target="_blank"
        className="block text-center text-[10px] text-green-300/70 hover:text-green-200 py-0.5 border-t border-black/20"
      >
        Данни за мачове: Powered by SportScore
      </a>
      <p className="text-center text-[10px] text-green-300/70 py-0.5 border-t border-black/20">
        Създадено от{' '}
        <a
          href="https://sbonchev.eu"
          target="_blank"
          rel="noopener"
          className="hover:text-green-200 underline"
        >
          Стоян Бончев
        </a>
      </p>
      <NotificationToggle />
    </header>
  )
}

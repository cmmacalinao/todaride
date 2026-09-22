import { useNavigate } from 'react-router-dom'
import { useRides } from '../context/RideContext'

// The three services a passenger switches between — tricycle rides, Food
// Order, and PaDeliver (goods) — as one strip that appears on every service
// screen, with the gold fill marking whichever one is open. The fill is the
// selection, nothing else: the same strip on another screen shows that
// screen's own tab lit.
// compact: the header-row size — three labels have to share the width left
// beside the hamburger on a phone, so the type comes down a step and the
// pills lose some height.
export function ServiceTabs({ active, tone = 'dark', compact = false }: { active: 'toda' | 'food' | 'padeliver'; tone?: 'dark' | 'light'; compact?: boolean }) {
  const navigate = useNavigate()
  const { vendorsEnabled } = useRides()
  // Without registered vendors there is nothing to switch to — Food Order
  // and PaDeliver's Store both browse vendor catalogs (see VendorMenuBooking).
  if (!vendorsEnabled) return null

  // A white strip on either background (2026-09-21) — the dark header's
  // see-through version read as part of the header rather than as buttons.
  const shell = tone === 'dark' ? 'border-white/60 bg-white shadow-sm' : 'border-slate-200 bg-white'
  const idle = 'text-navy-900 hover:bg-slate-100'
  // The same pictures as the start page's three tiles (RiderStartPage), so a
  // tab and the tile it stands for look like the same thing.
  const icon = (key: 'toda' | 'food' | 'padeliver') => {
    const box = compact ? 'h-4 w-5' : 'h-5 w-6'
    if (key === 'toda') return <img src="/tricycle-thumb.png" alt="" aria-hidden className={`${box} shrink-0 object-contain`} />
    if (key === 'food')
      return <img src="/food-photos/141-tapsilog.jpg" alt="" aria-hidden className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} shrink-0 rounded object-cover`} />
    return (
      <span aria-hidden className={`shrink-0 leading-none ${compact ? 'text-sm' : 'text-base'}`}>
        📦
      </span>
    )
  }
  const tab = (key: 'toda' | 'food' | 'padeliver', label: string, to: () => void) => {
    const isActive = key === active
    return (
      <button
        type="button"
        onClick={isActive ? undefined : to}
        aria-current={isActive ? 'page' : undefined}
        className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full text-center font-black uppercase transition ${compact ? 'px-1 py-1 text-[10px] tracking-tight' : 'px-2 py-1.5 text-[13px] tracking-wide'} ${
          isActive ? 'bg-gold-400 text-navy-900 shadow-sm' : idle
        }`}
      >
        {icon(key)}
        <span className="truncate">{label}</span>
      </button>
    )
  }

  return (
    <div className={`flex overflow-hidden rounded-full border p-0.5 ${shell}`}>
      {tab('toda', 'Book a Ride', () => navigate('/book', { state: { section: 'ride' } }))}
      {tab('food', 'Food Order', () => navigate('/book', { state: { section: 'food' } }))}
      {tab('padeliver', 'PaDeliver', () => navigate('/book', { state: { section: 'goods_store' } }))}
    </div>
  )
}

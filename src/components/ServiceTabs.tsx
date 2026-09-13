import { useNavigate } from 'react-router-dom'
import { useRides } from '../context/RideContext'

// The three services a passenger switches between — tricycle rides, Food
// Order, and PaDeliver (goods) — as one strip that appears on every service
// screen, with the gold fill marking whichever one is open. The fill is the
// selection, nothing else: the same strip on another screen shows that
// screen's own tab lit.
export function ServiceTabs({ active, tone = 'dark' }: { active: 'toda' | 'food' | 'padeliver'; tone?: 'dark' | 'light' }) {
  const navigate = useNavigate()
  const { vendorsEnabled } = useRides()
  // Without registered vendors there is nothing to switch to — Food Order
  // and PaDeliver's Store both browse vendor catalogs (see VendorMenuBooking).
  if (!vendorsEnabled) return null

  const shell = tone === 'dark' ? 'border-white/15 bg-white/5' : 'border-slate-200 bg-slate-100'
  const idle = tone === 'dark' ? 'text-white/80 hover:bg-white/10' : 'text-slate-700 hover:bg-white'
  const tab = (key: 'toda' | 'food' | 'padeliver', label: string, to: () => void) => {
    const isActive = key === active
    return (
      <button
        type="button"
        onClick={isActive ? undefined : to}
        aria-current={isActive ? 'page' : undefined}
        className={`flex-1 rounded-full py-1.5 text-center text-[13px] font-black uppercase tracking-wide transition ${
          isActive ? 'bg-gold-400 text-navy-900 shadow-sm' : idle
        }`}
      >
        {label}
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

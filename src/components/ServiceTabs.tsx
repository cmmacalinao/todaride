import { useNavigate } from 'react-router-dom'
import { useRides } from '../context/RideContext'

// The two services a passenger switches between — tricycle rides and Food
// Express — as one strip that appears on both screens, with the gold fill
// marking whichever one is open. The fill is the selection, nothing else:
// the same strip on the other screen shows the other tab lit.
export function ServiceTabs({ active, tone = 'dark' }: { active: 'toda' | 'food'; tone?: 'dark' | 'light' }) {
  const navigate = useNavigate()
  const { vendorsEnabled } = useRides()
  // Without Food Express there is nothing to switch to.
  if (!vendorsEnabled) return null

  const shell = tone === 'dark' ? 'border-white/15 bg-white/5' : 'border-slate-200 bg-slate-100'
  const idle = tone === 'dark' ? 'text-white/70 hover:bg-white/10' : 'text-slate-600 hover:bg-white'
  const brandIdle = tone === 'dark' ? 'text-gold-400' : 'text-brand-700'
  const tab = (key: 'toda' | 'food', label: string, to: () => void) => {
    const isActive = key === active
    return (
      <button
        type="button"
        onClick={isActive ? undefined : to}
        aria-current={isActive ? 'page' : undefined}
        className={`flex-1 rounded-full py-2.5 text-center text-sm font-extrabold uppercase tracking-wide transition ${
          isActive ? 'bg-gold-400 text-navy-900 shadow-sm' : idle
        }`}
      >
        <span className={`normal-case tracking-normal ${isActive ? 'text-blue-700' : brandIdle}`}>SafeRide</span> {label}
      </button>
    )
  }

  return (
    <div className={`flex overflow-hidden rounded-full border p-1 ${shell}`}>
      {tab('toda', 'TODA', () => navigate('/book/start'))}
      {tab('food', 'Food Express', () => navigate('/book', { state: { section: 'food' } }))}
    </div>
  )
}

import { useNavigate } from 'react-router-dom'

// PaDeliver's two sub-services, as the same one-line pill pattern
// ServiceTabs uses one level up — Store (browse a partner's priced catalog)
// and Book a Delivery (a plain courier request, nothing bought). Sits right
// under the main Book a Ride/Food Order/PaDeliver strip, only while PaDeliver
// itself is the selected tab there (see PassengerPage), so it reads as PaDeliver
// expanding into its own two doors rather than a fourth, unrelated tab.
export function PaDeliverSubTabs({ active }: { active: 'store' | 'delivery' }) {
  const navigate = useNavigate()
  const tab = (key: 'store' | 'delivery', label: string, section: string) => {
    const isActive = key === active
    return (
      <button
        type="button"
        onClick={isActive ? undefined : () => navigate('/book', { state: { section } })}
        aria-current={isActive ? 'page' : undefined}
        className={`flex-1 rounded-full py-1 text-center text-[11px] font-bold uppercase tracking-wide transition ${
          isActive ? 'bg-gold-400 text-navy-900 shadow-sm' : 'text-slate-600 hover:bg-white'
        }`}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="flex overflow-hidden rounded-full border border-slate-200 bg-slate-100 p-0.5">
      {tab('store', '🏬 Store', 'goods_store')}
      {tab('delivery', '🛺 Book a Delivery', 'goods_delivery')}
    </div>
  )
}

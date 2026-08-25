import { IncomePromotion } from '../components/IncomePromotion'
import { useAdminViewMode } from '../lib/adminViewMode'

export function IncomePromotionPage() {
  const { containerClass } = useAdminViewMode()

  return (
    <div className={`mx-auto ${containerClass} space-y-6 px-4 py-6`}>
      <IncomePromotion />
    </div>
  )
}

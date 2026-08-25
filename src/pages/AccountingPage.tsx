import { AdminAccounting } from '../components/AdminAccounting'
import { useAdminViewMode } from '../lib/adminViewMode'

export function AccountingPage() {
  const { containerClass } = useAdminViewMode()

  return (
    <div className={`mx-auto ${containerClass} space-y-6 px-4 py-6`}>
      <AdminAccounting />
    </div>
  )
}

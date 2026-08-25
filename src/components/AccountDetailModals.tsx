import { formatTripRoute } from '../lib/addressFormat'
import { useRides } from '../context/RideContext'
import { AccountDetailModal, DetailRow, DetailSection } from './AccountDetailModal'
import { StarRating } from './StarRating'
import { DRIVER_REPORT_REASON_LABELS } from '../mock/data'

function money(n: number): string {
  return `₱${n.toLocaleString()}`
}

function Empty({ text }: { text: string }) {
  return <p className="text-[11px] text-slate-400">{text}</p>
}

// ── Passenger ────────────────────────────────────────────────────────────
export function PassengerDetailModal({ passengerId, onClose }: { passengerId: string; onClose: () => void }) {
  const { passengers, parents, parentLinks, rides, alerts, driverReports, drivers } = useRides()
  const passenger = passengers.find((p) => p.id === passengerId)
  if (!passenger) return null

  const own = rides.filter((r) => r.passengerId === passenger.id)
  const completed = own.filter((r) => r.status === 'completed')
  const cancelled = own.filter((r) => r.status === 'cancelled')
  const spend = completed.reduce((s, r) => s + (r.payment?.amount ?? r.fareEstimate ?? 0), 0)
  const rideIds = new Set(own.map((r) => r.id))
  // Incidents come from two places and both belong in one list: an SOS the
  // passenger raised on a trip, and a formal report they filed on a driver.
  const sos = alerts.filter((a) => (a.rideId ? rideIds.has(a.rideId) : false))
  const filed = driverReports.filter((r) => r.passengerId === passenger.id)
  const link = parentLinks.find((l) => l.studentPassengerId === passenger.id)
  const guardian = link ? parents.find((p) => p.id === link.parentId) : null
  const favorite = drivers.find((d) => d.id === passenger.favoriteDriverId)

  return (
    <AccountDetailModal
      kind="passenger"
      accountId={passenger.id}
      accountName={passenger.name}
      subtitle={`${passenger.barangay}, ${passenger.city}`}
      onClose={onClose}
    >
      <DetailSection title="Profile">
        <DetailRow label="Age" value={String(passenger.age)} />
        <DetailRow label="Phone" value={passenger.phone} />
        <DetailRow label="Email" value={passenger.email ?? '—'} />
        <DetailRow
          label="Category"
          value={passenger.isStudent ? '🎓 Student' : passenger.isPwdSenior ? '♿ PWD / Senior' : 'Regular'}
        />
        <DetailRow label="Address" value={`${passenger.addressDetail || '—'}, ${passenger.barangay}`} />
        <DetailRow label="City / province" value={`${passenger.city}, ${passenger.province}`} />
        <DetailRow label="Guardian phone" value={passenger.guardianPhone ?? '—'} />
        <DetailRow label="Preferred driver" value={favorite?.name ?? '—'} />
        <DetailRow label="Payment on file" value={passenger.paymentDetail || '—'} />
        <DetailRow label="Saved places" value={String(passenger.savedLocations.length)} />
      </DetailSection>

      <DetailSection title="Trip record">
        <DetailRow label="Total bookings" value={String(own.length)} />
        <DetailRow label="Completed" value={String(completed.length)} />
        <DetailRow label="Cancelled" value={String(cancelled.length)} />
        <DetailRow label="Total spend" value={money(spend)} />
      </DetailSection>

      {guardian && (
        <DetailSection title="Linked parent">
          <DetailRow label="Guardian" value={guardian.name} />
          <DetailRow label="Relationship" value={link?.relationship ?? '—'} />
          <DetailRow label="Consent" value={link?.consentGiven ? '✓ recorded' : '⚠️ missing'} />
          <DetailRow label="Contact" value={guardian.phone} />
        </DetailSection>
      )}

      <DetailSection title={`Incident reports (${sos.length + filed.length})`}>
        {sos.length === 0 && filed.length === 0 ? (
          <Empty text="No incidents on record for this passenger." />
        ) : (
          <div className="space-y-1.5">
            {sos.map((a) => (
              <div key={a.id} className="rounded-md border border-danger-200 bg-danger-50 p-2 text-[11px]">
                <p className="font-semibold text-danger-900">
                  🆘 {a.type === 'sos' ? 'SOS raised' : 'Route deviation'} · {a.status}
                </p>
                {a.notes && <p className="text-danger-800">{a.notes}</p>}
                <p className="text-[10px] text-danger-700">{new Date(a.createdAt).toLocaleString()}</p>
              </div>
            ))}
            {filed.map((r) => (
              <div key={r.id} className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px]">
                <p className="font-semibold text-amber-900">
                  Report on {r.driverName} · {DRIVER_REPORT_REASON_LABELS[r.reason]}
                </p>
                {r.details && <p className="text-amber-800">{r.details}</p>}
                <p className="text-[10px] text-amber-700">
                  {new Date(r.createdAt).toLocaleString()} · {r.status}
                </p>
              </div>
            ))}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Trip history">
        {own.length === 0 ? (
          <Empty text="No trips yet." />
        ) : (
          <div className="space-y-1.5">
            {own.slice(0, 12).map((r) => (
              <div key={r.id} className="rounded-md bg-slate-50 p-2 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">{r.status.replace(/_/g, ' ')}</span>
                  <span className="text-slate-600">{money(r.payment?.amount ?? r.fareEstimate ?? 0)}</span>
                </div>
                <p className="truncate text-slate-700">
                  {formatTripRoute(r.pickup.label, r.dropoff.label)}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">{new Date(r.requestedAt).toLocaleString()}</span>
                  {typeof r.driverRating === 'number' && <StarRating value={r.driverRating} size="sm" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </DetailSection>
    </AccountDetailModal>
  )
}

// ── Driver ───────────────────────────────────────────────────────────────
export function DriverDetailModal({ driverId, onClose }: { driverId: string; onClose: () => void }) {
  const { drivers, rides, driverReports, todaOrganizations, alerts } = useRides()
  const driver = drivers.find((d) => d.id === driverId)
  if (!driver) return null

  const org = todaOrganizations.find((o) => o.id === driver.todaOrgId)
  const own = rides.filter((r) => r.driverId === driver.id)
  const completed = own.filter((r) => r.status === 'completed')
  const earnings = completed.reduce((s, r) => s + (r.payment?.driverPayout ?? 0), 0)
  const against = driverReports.filter((r) => r.driverId === driver.id)
  const ownSos = alerts.filter((a) => a.triggeredBy === driver.id || (a.rideId && own.some((r) => r.id === a.rideId)))
  const reviews = completed.filter((r) => r.driverReviewText)

  return (
    <AccountDetailModal
      kind="driver"
      accountId={driver.id}
      accountName={driver.name}
      subtitle={`${driver.plateNumber} · ${org?.name ?? 'Freelance'}`}
      onClose={onClose}
    >
      <DetailSection title="Profile">
        <DetailRow label="Plate / TRC no." value={driver.plateNumber} />
        <DetailRow label="License" value={`${driver.licenseNo} (exp. ${driver.licenseExpiry})`} />
        <DetailRow label="Phone" value={driver.phone} />
        <DetailRow label="Email" value={driver.email ?? '—'} />
        <DetailRow label="TODA" value={org?.name ?? 'Freelance — no TODA'} />
        <DetailRow label="Address" value={`${driver.barangay}, ${driver.city}, ${driver.province}`} />
        <DetailRow label="Verification" value={driver.verificationStatus} />
        <DetailRow label="Fleet access" value={driver.accessStatus} />
        <DetailRow label="Currently" value={driver.online ? '🟢 Online' : '⚪ Offline'} />
        <DetailRow label="Payout account" value={driver.paymentDetail || '—'} />
      </DetailSection>

      <DetailSection title="Performance">
        <DetailRow label="Rating" value={`★ ${driver.rating.toFixed(2)} (${driver.ratingCount})`} />
        <DetailRow label="Completed trips" value={String(completed.length)} />
        <DetailRow label="Total trips handled" value={String(own.length)} />
        <DetailRow label="Earnings" value={money(earnings)} />
        <DetailRow label="In terminal Pila" value={driver.queueJoinedAt ? 'Yes' : 'No'} />
      </DetailSection>

      <DetailSection title={`Incident reports (${against.length + ownSos.length})`}>
        {against.length === 0 && ownSos.length === 0 ? (
          <Empty text="No incidents on record for this driver." />
        ) : (
          <div className="space-y-1.5">
            {against.map((r) => (
              <div key={r.id} className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px]">
                <p className="font-semibold text-amber-900">{DRIVER_REPORT_REASON_LABELS[r.reason]}</p>
                <p className="text-amber-800">Reported by {r.passengerName}</p>
                {r.details && <p className="text-amber-800">{r.details}</p>}
                <p className="text-[10px] text-amber-700">
                  {new Date(r.createdAt).toLocaleString()} · {r.status}
                </p>
              </div>
            ))}
            {ownSos.map((a) => (
              <div key={a.id} className="rounded-md border border-danger-200 bg-danger-50 p-2 text-[11px]">
                <p className="font-semibold text-danger-900">🆘 {a.type} · {a.status}</p>
                {a.notes && <p className="text-danger-800">{a.notes}</p>}
                <p className="text-[10px] text-danger-700">{new Date(a.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </DetailSection>

      <DetailSection title={`Passenger ratings (${reviews.length})`}>
        {reviews.length === 0 ? (
          <Empty text="No written reviews yet." />
        ) : (
          <div className="space-y-1.5">
            {reviews.slice(0, 8).map((r) => (
              <div key={r.id} className="rounded-md bg-slate-50 p-2 text-[11px]">
                {typeof r.driverRating === 'number' && <StarRating value={r.driverRating} size="sm" />}
                <p className="text-slate-700">"{r.driverReviewText}"</p>
              </div>
            ))}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Trip history">
        {own.length === 0 ? (
          <Empty text="No trips yet." />
        ) : (
          <div className="space-y-1.5">
            {own.slice(0, 12).map((r) => (
              <div key={r.id} className="rounded-md bg-slate-50 p-2 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">{r.status.replace(/_/g, ' ')}</span>
                  <span className="text-slate-600">
                    {r.payment?.driverPayout ? money(r.payment.driverPayout) : '—'}
                  </span>
                </div>
                <p className="truncate text-slate-700">
                  {formatTripRoute(r.pickup.label, r.dropoff.label)}
                </p>
                <p className="text-[10px] text-slate-400">{new Date(r.requestedAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </DetailSection>
    </AccountDetailModal>
  )
}

// ── Parent ───────────────────────────────────────────────────────────────
export function ParentDetailModal({ parentId, onClose }: { parentId: string; onClose: () => void }) {
  const { parents, passengers, parentLinks, rides, alerts } = useRides()
  const parent = parents.find((p) => p.id === parentId)
  if (!parent) return null

  const links = parentLinks.filter((l) => l.parentId === parent.id)
  const studentIds = new Set(links.map((l) => l.studentPassengerId))
  const watched = rides.filter((r) => studentIds.has(r.passengerId))
  const completed = watched.filter((r) => r.status === 'completed')
  const watchedIds = new Set(watched.map((r) => r.id))
  const incidents = alerts.filter((a) => (a.rideId ? watchedIds.has(a.rideId) : false))

  return (
    <AccountDetailModal
      kind="parent"
      accountId={parent.id}
      accountName={parent.name}
      subtitle={`${parent.barangay}, ${parent.city}`}
      onClose={onClose}
    >
      <DetailSection title="Profile">
        <DetailRow label="Phone" value={parent.phone} />
        <DetailRow label="Email" value={parent.email ?? '—'} />
        <DetailRow label="Address" value={`${parent.addressDetail || '—'}, ${parent.barangay}`} />
        <DetailRow label="City / province" value={`${parent.city}, ${parent.province}`} />
        <DetailRow label="Emergency contact" value={parent.emergencyContact || '—'} />
        <DetailRow label="Payment on file" value={parent.paymentDetail || '—'} />
      </DetailSection>

      <DetailSection title={`Students watched (${links.length})`}>
        {links.length === 0 ? (
          <Empty text="This parent has no linked student yet." />
        ) : (
          <div className="space-y-1.5">
            {links.map((l) => {
              const student = passengers.find((p) => p.id === l.studentPassengerId)
              const trips = rides.filter((r) => r.passengerId === l.studentPassengerId)
              return (
                <div key={l.studentPassengerId} className="rounded-md bg-slate-50 p-2 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-700">{student?.name ?? 'Unknown student'}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        l.consentGiven ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {l.consentGiven ? '✓ consent' : 'no consent'}
                    </span>
                  </div>
                  <p className="text-slate-500">
                    {l.relationship} · {trips.filter((r) => r.status === 'completed').length} completed of{' '}
                    {trips.length} trip(s)
                    {l.proofOfAuthorityDataUrl ? ' · proof on file' : ' · no proof uploaded'}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Oversight record">
        <DetailRow label="Trips watched" value={String(watched.length)} />
        <DetailRow label="Completed" value={String(completed.length)} />
        <DetailRow label="Incidents on watched trips" value={String(incidents.length)} />
      </DetailSection>

      <DetailSection title={`Incident reports (${incidents.length})`}>
        {incidents.length === 0 ? (
          <Empty text="No incidents on this parent's watched trips." />
        ) : (
          <div className="space-y-1.5">
            {incidents.map((a) => (
              <div key={a.id} className="rounded-md border border-danger-200 bg-danger-50 p-2 text-[11px]">
                <p className="font-semibold text-danger-900">🆘 {a.type} · {a.status}</p>
                {a.notes && <p className="text-danger-800">{a.notes}</p>}
                <p className="text-[10px] text-danger-700">{new Date(a.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </DetailSection>
    </AccountDetailModal>
  )
}

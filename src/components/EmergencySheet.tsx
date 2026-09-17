import { useEffect, useState } from 'react'
import type { EmergencyContact, GeoCoords, Ride, SosAlert, SosEventKind } from '../types'
import { INCIDENT_STATUS_LABEL, isActiveAlert } from '../lib/safety'
import { formatAddressLine } from '../lib/addressFormat'

// The emergency screen, for a passenger or a driver. Four things and no
// more: send an SOS (after a short countdown that a stray thumb cannot
// beat), call 911, call the people on file, close. Once an SOS is out it
// shows who has been told and offers the false-alarm cancel.
//
// Every call button is the phone's own dialler — the app never places a
// call, it only writes down that the button was tapped.

interface EmergencySheetProps {
  role: 'passenger' | 'driver'
  ride: Ride | null
  actorName: string
  location: GeoCoords | null
  // People to call, in the order they should appear.
  contacts: EmergencyContact[]
  counterpart?: { label: string; phone: string } | null
  toda?: { name: string; phone: string } | null
  activeAlert: SosAlert | null
  countdownSeconds: number
  onSendSos: () => void
  onCancelSos: (alertId: string) => void
  onLogEvent: (alertId: string, kind: SosEventKind, summary: string) => void
  onClose: () => void
  onMoreNumbers?: () => void
  // Drawn in the page instead of as a modal (the Emergency tab).
  inline?: boolean
  // False in Phase 1 (see SafetySettings.sosAlertsEnabled): the sheet is the
  // call buttons only.
  sosEnabled?: boolean
  // Opened by an answer that already means "I need help" (the got-off and
  // off-route checks): the countdown starts at once, and can still be
  // cancelled — the same protection against a stray tap SEND SOS has.
  autoStartCountdown?: boolean
}

export function EmergencySheet({
  role,
  ride,
  actorName,
  location,
  contacts,
  counterpart = null,
  toda = null,
  activeAlert,
  countdownSeconds,
  onSendSos,
  onCancelSos,
  onLogEvent,
  onClose,
  onMoreNumbers,
  inline = false,
  sosEnabled = true,
  autoStartCountdown = false,
}: EmergencySheetProps) {
  // null: idle. A number: seconds left before the SOS goes out.
  const [countdown, setCountdown] = useState<number | null>(null)
  const alertLive = activeAlert && isActiveAlert(activeAlert) ? activeAlert : null

  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) {
      setCountdown(null)
      onSendSos()
      return
    }
    const id = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000)
    return () => clearTimeout(id)
    // onSendSos is stable enough per render; re-arming on it would restart the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown])

  function startSos() {
    if (countdownSeconds <= 0) {
      onSendSos()
      return
    }
    setCountdown(countdownSeconds)
  }

  useEffect(() => {
    if (sosEnabled && autoStartCountdown && !alertLive) startSos()
    // Once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function logCall(kind: SosEventKind, summary: string) {
    if (alertLive) onLogEvent(alertLive.id, kind, summary)
  }

  const delivered = (alertLive?.notifications ?? []).filter((n) => n.status === 'delivered')
  const told: string[] = []
  if (delivered.some((n) => n.recipientKind === 'admin')) told.push('TODARide Mobility Admin')
  if (delivered.some((n) => n.recipientKind === 'toda')) told.push('your TODA')
  if (delivered.some((n) => n.recipientKind === 'guardian')) told.push('your guardian')
  if (delivered.some((n) => n.recipientKind === 'counterpart')) told.push(role === 'passenger' ? 'your driver' : 'your passenger')
  const nearby = delivered.filter((n) => n.recipientKind === 'nearby_driver').length
  if (nearby > 0) told.push(`${nearby} nearby TODA driver${nearby === 1 ? '' : 's'}`)

  const tripLine = ride
    ? `${formatAddressLine(ride.pickup.label)} → ${formatAddressLine(ride.dropoff.label)}`
    : role === 'driver'
      ? 'No trip in progress'
      : 'Not on a trip'
  const locationLine = location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : 'Location not available'

  const body = (
    <div className={inline ? 'space-y-3' : 'flex max-h-[85vh] flex-col overflow-y-auto p-4'}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-extrabold text-danger-900">🆘 Emergency</p>
          <p className="truncate text-[11px] text-slate-600">{tripLine}</p>
          <p className="text-[11px] text-slate-500">📍 {locationLine}</p>
        </div>
        {!inline && (
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-lg px-2 py-1 text-lg leading-none text-slate-400 hover:bg-slate-100">
            ✕
          </button>
        )}
      </div>

      {alertLive ? (
        <div className="rounded-xl border-2 border-danger-600 bg-danger-50 p-3">
          <p className="animate-pulse text-sm font-extrabold text-danger-900">🚨 SOS sent · {INCIDENT_STATUS_LABEL[alertLive.status]}</p>
          <p className="mt-1 text-xs text-danger-800">
            {told.length > 0 ? `Notified: ${told.join(', ')}.` : 'Sending…'}
            {alertLive.status === 'acknowledged' && ' The safety desk has seen it.'}
            {alertLive.status === 'responding' && ' Help is being organised.'}
          </p>
          <p className="mt-1 text-[11px] text-danger-700">Stay where it is safe. Keep your phone on you.</p>
          {(alertLive.status === 'open' || alertLive.status === 'acknowledged') && (
            <button
              type="button"
              onClick={() => onCancelSos(alertLive.id)}
              className="mt-2 w-full rounded-lg border border-danger-300 bg-white py-2 text-xs font-semibold text-danger-800 hover:bg-danger-100"
            >
              ✕ False alarm — cancel this SOS
            </button>
          )}
        </div>
      ) : countdown !== null ? (
        <div className="rounded-xl border-2 border-danger-600 bg-danger-600 p-4 text-center text-white">
          <p className="text-xs font-semibold uppercase tracking-wide">Sending SOS in</p>
          <p className="text-5xl font-black leading-none">{countdown}</p>
          <button
            type="button"
            onClick={() => setCountdown(null)}
            className="mt-3 w-full rounded-lg bg-white py-2.5 text-sm font-bold text-danger-800 hover:bg-danger-50"
          >
            Cancel — don&apos;t send
          </button>
        </div>
      ) : !sosEnabled ? null : (
        <button
          type="button"
          onClick={startSos}
          className="w-full rounded-xl bg-danger-600 py-4 text-lg font-black text-white shadow-md hover:bg-danger-700"
        >
          🆘 SEND SOS
        </button>
      )}

      <p className="text-[11px] text-slate-500">
        {sosEnabled
          ? 'SOS tells TODARide Mobility and your TODA through the app. It does not call the police or an ambulance — for that, use the phone:'
          : 'Call for help straight from your phone:'}
      </p>

      {/* 911 and the people on file side by side — family is the call most
          people actually make first, so it sits right beside 911 rather
          than a scroll further down. */}
      <div className="grid grid-cols-2 gap-2">
        <a
          href="tel:911"
          onClick={() => logCall('call_911', `${actorName} tapped Call 911`)}
          className="flex items-center justify-center gap-2 rounded-xl border-2 border-danger-600 bg-white py-3 text-base font-extrabold text-danger-800 hover:bg-danger-50"
        >
          🚑 CALL 911
        </a>
        {contacts.map((c) => (
          <a
            key={c.id}
            href={`tel:${c.phone}`}
            onClick={() => logCall('call_contact', `${actorName} called ${c.name} (${c.relationship})`)}
            className="flex min-w-0 flex-col items-center justify-center rounded-xl border-2 border-brand-500 bg-white px-2 py-1.5 text-center text-sm font-bold text-brand-800 hover:bg-brand-50"
          >
            <span className="w-full truncate">📞 Call {c.name}</span>
            <span className="text-[10px] font-medium text-slate-500">{c.relationship}</span>
          </a>
        ))}
      </div>

      {(counterpart || toda) && (
        <div className="space-y-1.5">
          {counterpart && (
            <a
              href={`tel:${counterpart.phone}`}
              onClick={() => logCall(role === 'passenger' ? 'call_driver' : 'call_passenger', `${actorName} called ${counterpart.label}`)}
              className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <span className="truncate">📞 Call {counterpart.label}</span>
            </a>
          )}
          {toda && (
            <a
              href={`tel:${toda.phone}`}
              onClick={() => logCall('call_toda', `${actorName} called ${toda.name}`)}
              className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <span className="truncate">📞 Call {toda.name}</span>
              <span className="shrink-0 text-[11px] font-medium text-slate-500">TODA office</span>
            </a>
          )}
        </div>
      )}

      {role === 'passenger' && contacts.length === 0 && (
        <p className="text-[11px] text-slate-500">
          No emergency contact on file — add up to three under My Profile so they appear here as call buttons.
        </p>
      )}

      {/* The way out for a screen opened by mistake — a stray tap on Help, or
          "I need help" pressed on the got-off check by someone who is fine.
          Stops a countdown that has started, and says so in words a person
          checks before tapping, rather than a plain Cancel. An SOS already
          sent has its own cancel above. */}
      {!inline && !alertLive && (
        <button
          type="button"
          onClick={() => {
            setCountdown(null)
            onClose()
          }}
          className="w-full rounded-lg border-2 border-emerald-500 bg-emerald-50 py-2.5 text-sm font-bold text-emerald-800 hover:bg-emerald-100"
        >
          ✅ False alarm — I am safe
        </button>
      )}

      <div className="flex gap-2">
        {onMoreNumbers && (
          <button
            type="button"
            onClick={onMoreNumbers}
            className="flex-1 rounded-lg border border-slate-300 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            📞 More emergency numbers
          </button>
        )}
        {!inline && (
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {alertLive ? 'Back to the trip' : 'Cancel'}
          </button>
        )}
      </div>
    </div>
  )

  if (inline) return <section className="rounded-xl border-2 border-danger-300 bg-white p-3 shadow-sm">{body}</section>

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Emergency">
      <div className="w-full max-w-sm rounded-2xl border border-danger-200 bg-white shadow-2xl">{body}</div>
    </div>
  )
}

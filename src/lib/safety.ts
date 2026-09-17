// The Safety & Emergency Alert System, in pure functions.
//
// An SOS is one incident record (SosAlert) that lives forever. It moves
// through five states — triggered, acknowledged, responding, resolved, or
// triggered → cancelled — and everything that happens to it is written to
// its own event log with a time and a name. Who is told about it is decided
// here too, in planNotifications, and every recipient is written down with
// the channel used and whether it was delivered.
//
// Channels: "in_app" always delivers. "sms" sends a real text through
// Semaphore (see lib/sosSmsApi.ts and RideContext's delivery effect) once
// Super Admin turns the channel on and a contact has opted in — until then
// it is logged as skipped, same as before. Calls (911, hotlines, contacts)
// are never placed by the app — the phone's own dialler does that; when
// someone taps a call button the incident just records that they did.
import type {
  Driver,
  EmergencyContact,
  GeoCoords,
  ParentLink,
  Passenger,
  Ride,
  SafetySettings,
  SosAlert,
  SosAlertStatus,
  SosEvent,
  SosEventKind,
  SosNotification,
  SosSeverity,
  SosTriggerSource,
} from '../types'
import { haversineDistanceMeters } from './geo'

export const SAFETY_DEFAULTS: SafetySettings = {
  // Long enough to stop a stray thumb, short enough not to matter in a real
  // emergency. Zero would make SOS instant again.
  sosCountdownSeconds: 3,
  notifyTodaOn: { passengerSos: true, driverSos: true, possibleCrash: true },
  notifyGuardian: true,
  notifyCounterpart: true,
  nearbyDriversEnabled: true,
  nearbyRadiusMeters: 1500,
  nearbyMaxRecipients: 5,
  // Fresher than this and a driver's last fix still counts as "here".
  nearbyMaxFixAgeMinutes: 20,
  channels: { inApp: true, sms: false },
  crashDetectionEnabled: false,
  crashSensitivity: 'medium',
  crashTimeoutSeconds: 30,
}

// Fills in anything a stored settings object predates.
export function withSafetyDefaults(stored: Partial<SafetySettings> | null | undefined): SafetySettings {
  if (!stored) return SAFETY_DEFAULTS
  return {
    ...SAFETY_DEFAULTS,
    ...stored,
    notifyTodaOn: { ...SAFETY_DEFAULTS.notifyTodaOn, ...(stored.notifyTodaOn ?? {}) },
    channels: { ...SAFETY_DEFAULTS.channels, ...(stored.channels ?? {}) },
  }
}

export const INCIDENT_STATUS_LABEL: Record<SosAlertStatus, string> = {
  open: 'Triggered',
  acknowledged: 'Acknowledged',
  responding: 'Responding',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
}

export const ACTIVE_ALERT_STATUSES: SosAlertStatus[] = ['open', 'acknowledged', 'responding']

// Still somebody's problem right now — anything not resolved or cancelled.
export function isActiveAlert(alert: Pick<SosAlert, 'status'>): boolean {
  return ACTIVE_ALERT_STATUSES.includes(alert.status)
}

export const TRIGGER_SOURCE_LABEL: Record<SosTriggerSource, string> = {
  passenger: 'Passenger SOS',
  driver: 'Driver SOS',
  automatic_crash_detection: 'Possible crash (automatic)',
}

export function severityFor(source: SosTriggerSource, type: SosAlert['type']): SosSeverity {
  if (type === 'route_deviation') return 'medium'
  if (source === 'automatic_crash_detection') return 'critical'
  return 'high'
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

// The text an emergency contact actually receives. Short and factual — no
// diagnosis, no drama — since an automatic alert may still turn out to be
// nothing. Sent as-is through lib/sosSmsApi.ts by RideContext's delivery
// effect; nothing else touches the wording.
function sosSmsText(raisedBy: string, source: SosTriggerSource, location: GeoCoords | null): string {
  const who =
    source === 'automatic_crash_detection'
      ? `${raisedBy}'s phone detected a possible accident`
      : `${raisedBy} pressed the emergency SOS button in the TODARide Mobility app`
  const where = location ? ` Location: https://www.google.com/maps?q=${location.lat},${location.lng}` : ' Location not available.'
  return `TODARide Mobility EMERGENCY ALERT: ${who}.${where} This is an automated message — call them or 911 if you cannot reach them.`
}

export function makeEvent(kind: SosEventKind, summary: string, actorName: string, actorRole: SosEvent['actorRole'], at = new Date().toISOString()): SosEvent {
  return { id: newId('sosev'), at, kind, summary, actorName, actorRole }
}

// The emergency contacts a passenger has on file, oldest field first: the
// guardian number every passenger record already carried, then the list
// added with this system. De-duplicated by number.
export function passengerEmergencyContacts(p: Pick<Passenger, 'guardianPhone' | 'guardianName' | 'guardianRelationship' | 'emergencyContacts'>): EmergencyContact[] {
  const out: EmergencyContact[] = []
  const seen = new Set<string>()
  const push = (c: EmergencyContact) => {
    const key = c.phone.replace(/\D/g, '')
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(c)
  }
  if (p.guardianPhone) {
    push({ id: 'guardian', name: p.guardianName?.trim() || 'Emergency contact', phone: p.guardianPhone, relationship: p.guardianRelationship?.trim() || 'Guardian', smsEnabled: false })
  }
  for (const c of p.emergencyContacts ?? []) push(c)
  return out
}

// Verified drivers of a TODA, on duty, with a recent fix inside the radius.
// Closest first, capped. The person who raised the alert is never in it.
export function nearbyDrivers(
  drivers: Driver[],
  at: GeoCoords,
  settings: SafetySettings,
  excludeDriverId: string | null,
  now = Date.now(),
): { driver: Driver; meters: number }[] {
  if (!settings.nearbyDriversEnabled) return []
  const maxAge = settings.nearbyMaxFixAgeMinutes * 60 * 1000
  return drivers
    .filter(
      (d) =>
        d.id !== excludeDriverId &&
        d.online &&
        d.verificationStatus === 'approved' &&
        d.todaOrgId !== null &&
        d.lastKnownGps &&
        (!d.lastKnownGpsAt || now - new Date(d.lastKnownGpsAt).getTime() <= maxAge),
    )
    .map((d) => ({ driver: d, meters: Math.round(haversineDistanceMeters(at, d.lastKnownGps!)) }))
    .filter((x) => x.meters <= settings.nearbyRadiusMeters)
    .sort((a, b) => a.meters - b.meters)
    .slice(0, settings.nearbyMaxRecipients)
}

export interface IncidentContext {
  base: SosAlert
  source: SosTriggerSource
  ride: Ride | null
  passenger: Passenger | null
  driver: Driver | null
  drivers: Driver[]
  parentLinks: ParentLink[]
  settings: SafetySettings
  now?: string
}

// Turns the bare alert the reducers already build into the full incident:
// trip details copied onto it (a ride can change after the fact; the record
// must not), severity, the first event, and the notification plan with each
// recipient's outcome. Pure — the reducer stores what comes back.
export function buildIncident(ctx: IncidentContext): SosAlert {
  const { base, source, ride, passenger, driver, drivers, parentLinks, settings } = ctx
  const now = ctx.now ?? base.createdAt
  const raisedBy = source === 'driver' ? (driver?.name ?? 'Driver') : source === 'passenger' ? (passenger?.name ?? ride?.passengerName ?? 'Passenger') : 'Automatic detection'
  const actorRole: SosEvent['actorRole'] = source === 'driver' ? 'driver' : source === 'passenger' ? 'passenger' : 'system'
  const rideDriver = ride?.driverId ? drivers.find((d) => d.id === ride.driverId) ?? null : null
  const vehicle = (driver ?? rideDriver)?.plateNumber ?? null
  const todaOrgId = base.todaOrgId ?? (driver ?? rideDriver)?.todaOrgId ?? null
  const location = base.location ?? ride?.driverLiveGps ?? ride?.passengerLiveGps ?? null
  // The phone that raised the alert is the freshest fix for its own seat;
  // the other seat is whatever that phone last published on the ride.
  const passengerLocation = base.passengerLocation ?? (source === 'passenger' ? base.location : null) ?? ride?.passengerLiveGps ?? null
  const driverLocation = base.driverLocation ?? (source === 'driver' ? base.location : null) ?? ride?.driverLiveGps ?? null

  const events: SosEvent[] = [
    makeEvent('triggered', `${TRIGGER_SOURCE_LABEL[source]} — raised by ${raisedBy}`, raisedBy, actorRole, now),
  ]
  const notifications: SosNotification[] = []
  const note = (n: Omit<SosNotification, 'id' | 'at'>) => notifications.push({ id: newId('sosnt'), at: now, ...n })

  // Level 3: the safety desk, always.
  note({ recipientKind: 'admin', recipientId: 'admin', recipientName: 'TODARide Mobility Admin', channel: 'in_app', status: 'delivered' })

  // Level 4: the registered TODA, by rule.
  const todaRule = source === 'driver' ? settings.notifyTodaOn.driverSos : source === 'automatic_crash_detection' ? settings.notifyTodaOn.possibleCrash : settings.notifyTodaOn.passengerSos
  if (todaOrgId && todaRule) {
    note({ recipientKind: 'toda', recipientId: todaOrgId, recipientName: 'Registered TODA', channel: 'in_app', status: 'delivered' })
  } else if (todaOrgId) {
    note({ recipientKind: 'toda', recipientId: todaOrgId, recipientName: 'Registered TODA', channel: 'in_app', status: 'skipped', note: 'Notification rule off for this event' })
  }

  // Level 2: guardian accounts with consent see it in the app; contacts
  // without the app get an SMS drafted and queued as 'pending' once Super
  // Admin has the channel on and they've opted in. Nothing sends itself —
  // a person on the safety desk taps "Send SMS" per contact (see
  // SafetyIncidentCard), the same one-tap-only rule every call button here
  // already follows. See lib/sosSmsApi.ts for what that tap calls.
  if (passenger) {
    const linkedParents = parentLinks.filter((l) => l.studentPassengerId === passenger.id && l.consentGiven)
    for (const l of linkedParents) {
      note({ recipientKind: 'guardian', recipientId: l.parentId, recipientName: 'Guardian account', channel: 'in_app', status: settings.notifyGuardian ? 'delivered' : 'skipped', note: settings.notifyGuardian ? undefined : 'Guardian notification rule off' })
    }
    for (const c of passengerEmergencyContacts(passenger)) {
      const queued = settings.channels.sms && c.smsEnabled
      note({
        recipientKind: 'contact',
        recipientId: c.id,
        recipientName: `${c.name} (${c.relationship})`,
        channel: 'sms',
        status: queued ? 'pending' : 'skipped',
        note: settings.channels.sms ? (c.smsEnabled ? 'Queued — tap Send SMS to deliver' : 'SMS off for this contact') : 'SMS channel not enabled — call button shown instead',
        phone: queued ? c.phone : undefined,
        message: queued ? sosSmsText(raisedBy, source, location) : undefined,
      })
    }
  }

  // The other seat on the same trip.
  //
  // Never the driver when the passenger raised it. A passenger pressing SOS
  // in a tricycle may be pressing it about the person driving it, and telling
  // that driver is telling the one person who must not know — they could take
  // the phone, or drive somewhere else. The safety desk, the TODA and the
  // guardian are told; the driver is not. A possible crash detected on the
  // passenger's phone is different — it happened to both of them — so the
  // driver still hears about that.
  if (settings.notifyCounterpart && ride) {
    if (source === 'automatic_crash_detection' && ride.driverId) {
      note({ recipientKind: 'counterpart', recipientId: ride.driverId, recipientName: rideDriver?.name ?? 'Driver', channel: 'in_app', status: 'delivered' })
    } else if (source === 'driver' && ride.passengerId) {
      note({ recipientKind: 'counterpart', recipientId: ride.passengerId, recipientName: ride.passengerName, channel: 'in_app', status: 'delivered' })
    }
  }

  // Level 5: verified members close by, told only that someone needs help.
  const nearby = location ? nearbyDrivers(drivers, location, settings, driver?.id ?? rideDriver?.id ?? null) : []
  for (const n of nearby) {
    note({ recipientKind: 'nearby_driver', recipientId: n.driver.id, recipientName: `${n.driver.name} · ${n.meters} m away`, channel: 'in_app', status: 'delivered' })
  }

  const delivered = notifications.filter((n) => n.status === 'delivered')
  const summarise = (kind: SosNotification['recipientKind'], label: string) => {
    const hits = delivered.filter((n) => n.recipientKind === kind)
    if (hits.length) events.push(makeEvent('notified', `${label} notified (${hits.length})`, 'System', 'system', now))
  }
  summarise('admin', 'TODARide Mobility Admin')
  summarise('guardian', 'Guardian')
  summarise('toda', 'Registered TODA')
  summarise('counterpart', source === 'driver' ? 'Passenger on this trip' : 'Driver on this trip')
  summarise('nearby_driver', 'Nearby TODA members')

  return {
    ...base,
    triggerSource: source,
    severity: base.severity ?? severityFor(source, base.type),
    passengerId: base.passengerId ?? passenger?.id ?? ride?.passengerId ?? null,
    driverId: base.driverId ?? driver?.id ?? ride?.driverId ?? null,
    todaOrgId,
    vehiclePlate: vehicle,
    origin: ride?.pickup.label ?? null,
    destination: ride?.dropoff.label ?? null,
    tripStatus: ride?.status ?? null,
    location,
    passengerLocation,
    driverLocation,
    events,
    notifications,
    emergencyContactsNotified: delivered.some((n) => n.recipientKind === 'contact' || n.recipientKind === 'guardian'),
    todaNotified: delivered.some((n) => n.recipientKind === 'toda'),
    nearbyMembersNotified: delivered.filter((n) => n.recipientKind === 'nearby_driver').length,
    automaticDetection: source === 'automatic_crash_detection',
    possibleCrashDetected: source === 'automatic_crash_detection',
  }
}

// Which of the five states a change of status may move to. Anything else
// is ignored by the reducer rather than corrupting the record.
export function canTransition(from: SosAlertStatus, to: SosAlertStatus): boolean {
  switch (to) {
    case 'acknowledged':
      return from === 'open'
    case 'responding':
      return from === 'open' || from === 'acknowledged'
    case 'resolved':
      return from === 'open' || from === 'acknowledged' || from === 'responding'
    case 'cancelled':
      return from === 'open' || from === 'acknowledged'
    default:
      return false
  }
}

// Applies a status change with its timestamp, actor and event, or returns
// the alert unchanged when the move is not allowed.
export function transitionAlert(
  alert: SosAlert,
  to: SosAlertStatus,
  actorName: string,
  actorRole: SosEvent['actorRole'],
  notes?: string | null,
  now = new Date().toISOString(),
): SosAlert {
  if (!canTransition(alert.status, to)) return alert
  const stamped: Partial<SosAlert> = {}
  if (to === 'acknowledged') stamped.acknowledgedAt = now
  if (to === 'responding') stamped.respondingAt = now
  if (to === 'resolved') {
    stamped.resolvedAt = now
    stamped.resolvedBy = actorName
    if (notes?.trim()) stamped.resolutionNotes = notes.trim()
  }
  if (to === 'cancelled') stamped.cancelledAt = now
  const summary =
    to === 'acknowledged'
      ? `Acknowledged by ${actorName}`
      : to === 'responding'
        ? `Marked responding by ${actorName}`
        : to === 'resolved'
          ? `Resolved by ${actorName}${notes?.trim() ? ` — ${notes.trim()}` : ''}`
          : `Cancelled by ${actorName}${notes?.trim() ? ` — ${notes.trim()}` : ' (false alarm)'}`
  return {
    ...alert,
    ...stamped,
    status: to,
    events: [...(alert.events ?? []), makeEvent(to === 'open' ? 'triggered' : to, summary, actorName, actorRole, now)],
  }
}

// One more thing that happened on an incident — a note, a call button
// tapped, a 911 request — without changing its state.
export function appendEvent(alert: SosAlert, kind: SosEventKind, summary: string, actorName: string, actorRole: SosEvent['actorRole']): SosAlert {
  const ev = makeEvent(kind, summary, actorName, actorRole)
  const extra: Partial<SosAlert> = {}
  if (kind === 'call_911') extra.call911Requested = true
  if (kind === 'note') extra.adminNotes = [...(alert.adminNotes ?? []), { id: ev.id, at: ev.at, by: actorName, text: summary }]
  return { ...alert, ...extra, events: [...(alert.events ?? []), ev] }
}

// Records the outcome of a person tapping "Send SMS" on one queued contact
// notification — see RideContext's sendContactSms and lib/sosSmsApi.ts,
// which is what actually calls Semaphore before this runs. Pure: this only
// writes down what already happened, it never sends anything itself.
export function markNotificationDelivery(alert: SosAlert, notificationId: string, status: 'delivered' | 'failed', note: string | undefined, actorName: string): SosAlert {
  const target = (alert.notifications ?? []).find((n) => n.id === notificationId)
  const notifications = (alert.notifications ?? []).map((n) => (n.id === notificationId ? { ...n, status, note: note ?? n.note } : n))
  const events =
    status === 'delivered' && target
      ? [...(alert.events ?? []), makeEvent('notified', `SMS sent to ${target.recipientName} by ${actorName}`, actorName, 'admin')]
      : alert.events ?? []
  const emergencyContactsNotified = alert.emergencyContactsNotified || notifications.some((n) => n.status === 'delivered' && (n.recipientKind === 'contact' || n.recipientKind === 'guardian'))
  return { ...alert, notifications, events, emergencyContactsNotified }
}

// Time from raise to the first person acknowledging, and to resolution —
// what the safety reports are built on. Null while it has not happened.
export function responseSeconds(alert: SosAlert): number | null {
  if (!alert.acknowledgedAt) return null
  return Math.round((new Date(alert.acknowledgedAt).getTime() - new Date(alert.createdAt).getTime()) / 1000)
}
export function resolutionSeconds(alert: SosAlert): number | null {
  if (!alert.resolvedAt) return null
  return Math.round((new Date(alert.resolvedAt).getTime() - new Date(alert.createdAt).getTime()) / 1000)
}

// ---------------------------------------------------------------------------
// Safety reports (Admin insights). Aggregates only — never a passenger's
// name or an incident's own notes, so this is safe to show without the
// access the safety desk itself needs.

import type { CategoryDatum, DayDatum } from './insights'

export interface SafetyReportSummary {
  total: number
  passengerSos: number
  driverSos: number
  possibleCrashes: number
  confirmed: number
  cancelled: number
  avgResponseSeconds: number | null
  avgResolutionSeconds: number | null
}

export function safetyReportSummary(alerts: SosAlert[]): SafetyReportSummary {
  const responseTimes = alerts.map(responseSeconds).filter((n): n is number => n !== null)
  const resolutionTimes = alerts.map(resolutionSeconds).filter((n): n is number => n !== null)
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)
  return {
    total: alerts.length,
    passengerSos: alerts.filter((a) => a.type === 'sos' && a.triggeredByRole !== 'driver').length,
    driverSos: alerts.filter((a) => a.type === 'sos' && a.triggeredByRole === 'driver').length,
    possibleCrashes: alerts.filter((a) => a.type === 'possible_crash' || a.triggerSource === 'automatic_crash_detection').length,
    confirmed: alerts.filter((a) => a.status !== 'cancelled').length,
    cancelled: alerts.filter((a) => a.status === 'cancelled').length,
    avgResponseSeconds: avg(responseTimes),
    avgResolutionSeconds: avg(resolutionTimes),
  }
}

export function safetyTriggerBreakdown(alerts: SosAlert[]): CategoryDatum[] {
  return [
    { label: 'Passenger SOS', value: alerts.filter((a) => a.type === 'sos' && a.triggeredByRole !== 'driver').length },
    { label: 'Driver SOS', value: alerts.filter((a) => a.type === 'sos' && a.triggeredByRole === 'driver').length },
    { label: 'Possible crash', value: alerts.filter((a) => a.type === 'possible_crash' || a.triggerSource === 'automatic_crash_detection').length },
  ]
}

export function safetyOutcomeBreakdown(alerts: SosAlert[]): CategoryDatum[] {
  return [
    { label: 'Resolved', value: alerts.filter((a) => a.status === 'resolved').length },
    { label: 'Cancelled (false alarm)', value: alerts.filter((a) => a.status === 'cancelled').length },
    { label: 'Still active', value: alerts.filter((a) => isActiveAlert(a)).length },
  ]
}

// Top TODAs by incident count, everything else folded into "Other" so the
// chart stays readable with a large fleet.
export function safetyByTodaBreakdown(alerts: SosAlert[], todaNameById: Map<string, string>): CategoryDatum[] {
  const counts = new Map<string, number>()
  let none = 0
  for (const a of alerts) {
    if (!a.todaOrgId) {
      none += 1
      continue
    }
    counts.set(a.todaOrgId, (counts.get(a.todaOrgId) ?? 0) + 1)
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const top = ranked.slice(0, 6).map(([id, value]) => ({ label: todaNameById.get(id) ?? id, value }))
  const restTotal = ranked.slice(6).reduce((sum, [, v]) => sum + v, 0)
  if (restTotal > 0) top.push({ label: 'Other TODAs', value: restTotal })
  if (none > 0) top.push({ label: 'No TODA', value: none })
  return top
}

const DAY_MS = 24 * 60 * 60 * 1000
export function safetyByDayTrend(alerts: SosAlert[], days = 14, now: Date = new Date()): DayDatum[] {
  const buckets = new Map<string, number>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY_MS)
    buckets.set(d.toISOString().slice(0, 10), 0)
  }
  for (const a of alerts) {
    const key = new Date(a.createdAt).toISOString().slice(0, 10)
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }
  return Array.from(buckets.entries()).map(([key, value]) => ({
    key,
    label: new Date(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    value,
  }))
}

export function safetyNotificationDeliveryBreakdown(alerts: SosAlert[]): CategoryDatum[] {
  const counts = new Map<string, number>()
  for (const a of alerts) {
    for (const n of a.notifications ?? []) {
      counts.set(n.status, (counts.get(n.status) ?? 0) + 1)
    }
  }
  const label: Record<string, string> = { delivered: 'Delivered', pending: 'Pending', skipped: 'Skipped', failed: 'Failed' }
  return (['delivered', 'pending', 'skipped', 'failed'] as const).map((s) => ({ label: label[s], value: counts.get(s) ?? 0 }))
}

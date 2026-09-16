// The Safety & Emergency Alert System, in pure functions.
//
// An SOS is one incident record (SosAlert) that lives forever. It moves
// through five states — triggered, acknowledged, responding, resolved, or
// triggered → cancelled — and everything that happens to it is written to
// its own event log with a time and a name. Who is told about it is decided
// here too, in planNotifications, and every recipient is written down with
// the channel used and whether it was delivered.
//
// Channels: only "in_app" delivers today. "sms" is planned for and logged as
// skipped, so switching it on later is a sender function plus a setting, not
// a change to any of this. Calls (911, hotlines, contacts) are never placed
// by the app — the phone's own dialler does that; when someone taps a call
// button the incident just records that they did.
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

  const events: SosEvent[] = [
    makeEvent('triggered', `${TRIGGER_SOURCE_LABEL[source]} — raised by ${raisedBy}`, raisedBy, actorRole, now),
  ]
  const notifications: SosNotification[] = []
  const note = (n: Omit<SosNotification, 'id' | 'at'>) => notifications.push({ id: newId('sosnt'), at: now, ...n })

  // Level 3: the safety desk, always.
  note({ recipientKind: 'admin', recipientId: 'admin', recipientName: 'TodaSafeRide Admin', channel: 'in_app', status: 'delivered' })

  // Level 4: the registered TODA, by rule.
  const todaRule = source === 'driver' ? settings.notifyTodaOn.driverSos : source === 'automatic_crash_detection' ? settings.notifyTodaOn.possibleCrash : settings.notifyTodaOn.passengerSos
  if (todaOrgId && todaRule) {
    note({ recipientKind: 'toda', recipientId: todaOrgId, recipientName: 'Registered TODA', channel: 'in_app', status: 'delivered' })
  } else if (todaOrgId) {
    note({ recipientKind: 'toda', recipientId: todaOrgId, recipientName: 'Registered TODA', channel: 'in_app', status: 'skipped', note: 'Notification rule off for this event' })
  }

  // Level 2: guardian accounts with consent see it in the app; contacts
  // without the app would need SMS, which is logged as skipped until that
  // channel exists.
  if (passenger) {
    const linkedParents = parentLinks.filter((l) => l.studentPassengerId === passenger.id && l.consentGiven)
    for (const l of linkedParents) {
      note({ recipientKind: 'guardian', recipientId: l.parentId, recipientName: 'Guardian account', channel: 'in_app', status: settings.notifyGuardian ? 'delivered' : 'skipped', note: settings.notifyGuardian ? undefined : 'Guardian notification rule off' })
    }
    for (const c of passengerEmergencyContacts(passenger)) {
      note({
        recipientKind: 'contact',
        recipientId: c.id,
        recipientName: `${c.name} (${c.relationship})`,
        channel: 'sms',
        status: settings.channels.sms && c.smsEnabled ? 'pending' : 'skipped',
        note: settings.channels.sms ? (c.smsEnabled ? undefined : 'SMS off for this contact') : 'SMS channel not enabled — call button shown instead',
      })
    }
  }

  // The other seat on the same trip.
  if (settings.notifyCounterpart && ride) {
    if (source !== 'driver' && ride.driverId) {
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
  summarise('admin', 'TodaSafeRide Admin')
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

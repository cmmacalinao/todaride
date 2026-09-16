import { describe, expect, it } from 'vitest'
import { buildIncident, markNotificationDelivery, SAFETY_DEFAULTS, withSafetyDefaults } from '../safety'
import type { Passenger, SosAlert } from '../../types'

// Covers the emergency-SMS queuing this session added: buildIncident should
// only attach a real phone/message (what RideContext's one-tap
// sendContactSms actually sends) when both Super Admin's channel switch and
// the contact's own opt-in are on — every other combination must stay
// 'skipped' with nothing to send, so a stray tap can never reach a number
// nobody agreed to.

function basePassenger(overrides: Partial<Passenger> = {}): Passenger {
  return {
    id: 'pax-test',
    name: 'Test Passenger',
    phone: '0917-000-0000',
    email: null,
    province: 'Test',
    city: 'Test',
    barangay: 'Test',
    paymentDetail: null,
    guardianPhone: null,
    guardianName: null,
    guardianRelationship: null,
    emergencyContacts: [],
    ...overrides,
  } as Passenger
}

function baseAlert(): SosAlert {
  return {
    id: 'alert-test',
    rideId: null,
    triggeredBy: 'pax-test',
    type: 'sos',
    status: 'open',
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    guardianNotifiedPhone: null,
  }
}

describe('buildIncident — emergency SMS queuing', () => {
  it('queues phone+message when the channel is on and the contact opted in', () => {
    const passenger = basePassenger({
      emergencyContacts: [{ id: 'ec-1', name: 'Mom', phone: '0917-111-2222', relationship: 'Mother', smsEnabled: true }],
    })
    const incident = buildIncident({
      base: baseAlert(),
      source: 'passenger',
      ride: null,
      passenger,
      driver: null,
      drivers: [],
      parentLinks: [],
      settings: { ...SAFETY_DEFAULTS, channels: { ...SAFETY_DEFAULTS.channels, sms: true } },
    })
    const contactNotif = incident.notifications?.find((n) => n.recipientKind === 'contact')
    expect(contactNotif?.status).toBe('pending')
    expect(contactNotif?.phone).toBe('0917-111-2222')
    expect(contactNotif?.message).toMatch(/EMERGENCY ALERT/)
    expect(contactNotif?.message).toMatch(/Test Passenger/)
  })

  it('skips with no phone/message when the channel is off, even if the contact opted in', () => {
    const passenger = basePassenger({
      emergencyContacts: [{ id: 'ec-1', name: 'Mom', phone: '0917-111-2222', relationship: 'Mother', smsEnabled: true }],
    })
    const incident = buildIncident({
      base: baseAlert(),
      source: 'passenger',
      ride: null,
      passenger,
      driver: null,
      drivers: [],
      parentLinks: [],
      settings: SAFETY_DEFAULTS, // channels.sms defaults to false
    })
    const contactNotif = incident.notifications?.find((n) => n.recipientKind === 'contact')
    expect(contactNotif?.status).toBe('skipped')
    expect(contactNotif?.phone).toBeUndefined()
    expect(contactNotif?.message).toBeUndefined()
  })

  it('skips with no phone/message when the channel is on but the contact did not opt in', () => {
    const passenger = basePassenger({
      emergencyContacts: [{ id: 'ec-1', name: 'Mom', phone: '0917-111-2222', relationship: 'Mother', smsEnabled: false }],
    })
    const incident = buildIncident({
      base: baseAlert(),
      source: 'passenger',
      ride: null,
      passenger,
      driver: null,
      drivers: [],
      parentLinks: [],
      settings: { ...SAFETY_DEFAULTS, channels: { ...SAFETY_DEFAULTS.channels, sms: true } },
    })
    const contactNotif = incident.notifications?.find((n) => n.recipientKind === 'contact')
    expect(contactNotif?.status).toBe('skipped')
    expect(contactNotif?.phone).toBeUndefined()
  })

  it('never queues the legacy guardianPhone contact — smsEnabled is hardcoded false for it', () => {
    const passenger = basePassenger({ guardianPhone: '0917-400-4001' })
    const incident = buildIncident({
      base: baseAlert(),
      source: 'passenger',
      ride: null,
      passenger,
      driver: null,
      drivers: [],
      parentLinks: [],
      settings: { ...SAFETY_DEFAULTS, channels: { ...SAFETY_DEFAULTS.channels, sms: true } },
    })
    const contactNotif = incident.notifications?.find((n) => n.recipientKind === 'contact')
    expect(contactNotif?.status).toBe('skipped')
    expect(contactNotif?.phone).toBeUndefined()
  })
})

describe('markNotificationDelivery', () => {
  it('flips a pending notification to delivered and logs a "notified" event', () => {
    const alert: SosAlert = {
      ...baseAlert(),
      notifications: [
        { id: 'n1', at: baseAlert().createdAt, recipientKind: 'contact', recipientId: 'ec-1', recipientName: 'Mom (Mother)', channel: 'sms', status: 'pending', phone: '0917-111-2222', message: 'hi' },
      ],
      events: [],
    }
    const updated = markNotificationDelivery(alert, 'n1', 'delivered', undefined, 'Admin')
    expect(updated.notifications?.[0].status).toBe('delivered')
    expect(updated.events?.some((e) => e.kind === 'notified')).toBe(true)
    expect(updated.emergencyContactsNotified).toBe(true)
  })

  it('flips to failed without adding a "notified" event', () => {
    const alert: SosAlert = {
      ...baseAlert(),
      notifications: [
        { id: 'n1', at: baseAlert().createdAt, recipientKind: 'contact', recipientId: 'ec-1', recipientName: 'Mom (Mother)', channel: 'sms', status: 'pending', phone: '0917-111-2222', message: 'hi' },
      ],
      events: [],
    }
    const updated = markNotificationDelivery(alert, 'n1', 'failed', 'SMS server unreachable', 'Admin')
    expect(updated.notifications?.[0].status).toBe('failed')
    expect(updated.notifications?.[0].note).toBe('SMS server unreachable')
    expect(updated.events?.some((e) => e.kind === 'notified')).toBe(false)
    expect(updated.emergencyContactsNotified).toBeFalsy()
  })
})

describe('withSafetyDefaults', () => {
  it('keeps SMS off by default', () => {
    expect(withSafetyDefaults(undefined).channels.sms).toBe(false)
  })
})

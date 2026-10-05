import { describe, it, expect } from 'vitest'
import { sosDeliveryStatus, sosSmsHref, sosSmsText } from '../sosDelivery'
import type { SosNotification } from '../../types'

const n = (status: SosNotification['status'], recipientKind: SosNotification['recipientKind'] = 'guardian'): SosNotification => ({
  id: `${status}-${Math.random()}`,
  at: new Date().toISOString(),
  recipientKind,
  recipientId: 'r1',
  recipientName: 'Someone',
  channel: 'sms',
  status,
})

describe('sosDeliveryStatus', () => {
  it('is still sending when nothing has been attempted yet', () => {
    const s = sosDeliveryStatus([])
    expect(s.tone).toBe('sending')
    expect(s.urgeCall).toBe(false)
  })

  it('is still sending while any message is in flight', () => {
    const s = sosDeliveryStatus([n('pending'), n('delivered')])
    expect(s.tone).toBe('sending')
    // Not finished, so not yet the moment to say calling is the only way out.
    expect(s.urgeCall).toBe(false)
  })

  // The case this module exists for: in production every SMS 503s, so the
  // delivered list stays empty and the sheet promised "Sending…" for ever.
  it('says it failed when the texting is over and nobody was reached', () => {
    const s = sosDeliveryStatus([n('failed'), n('failed')])
    expect(s.tone).toBe('failed')
    expect(s.urgeCall).toBe(true)
    expect(s.failed).toHaveLength(2)
  })

  it('reports a partial send rather than rounding it to success', () => {
    const s = sosDeliveryStatus([n('delivered'), n('failed')])
    expect(s.tone).toBe('partial')
    // Somebody was not reached, so calling still matters.
    expect(s.urgeCall).toBe(true)
  })

  it('is plainly delivered when every message landed', () => {
    const s = sosDeliveryStatus([n('delivered'), n('delivered')])
    expect(s.tone).toBe('delivered')
    expect(s.urgeCall).toBe(false)
  })

  it('treats skipped as neither reached nor failed', () => {
    // A recipient the rules chose not to contact — no number on file, a
    // channel switched off. Calling it a failure cries wolf; calling it a
    // success claims they were told.
    const s = sosDeliveryStatus([n('delivered'), n('skipped')])
    expect(s.tone).toBe('delivered')
    expect(s.urgeCall).toBe(false)
    expect(s.failed).toHaveLength(0)
  })

  it('does not call a skipped-only alert a success', () => {
    const s = sosDeliveryStatus([n('skipped')])
    expect(s.tone).toBe('failed')
    expect(s.urgeCall).toBe(true)
  })
})

describe('sosSmsText', () => {
  it('leads with the emergency and carries a location link', () => {
    const t = sosSmsText({
      actorName: 'Celeste M.',
      role: 'passenger',
      location: { lat: 15.7333, lng: 120.9314 },
      tripLine: 'CLSU → Sto. Tomas',
    })
    expect(t.startsWith('EMERGENCY:')).toBe(true)
    expect(t).toContain('Celeste M.')
    expect(t).toContain('passenger')
    expect(t).toContain('15.73330,120.93140')
    expect(t).toContain('CLSU → Sto. Tomas')
  })

  it('says so rather than inventing a location when there is none', () => {
    const t = sosSmsText({ actorName: 'Kuya Edward', role: 'driver', location: null })
    expect(t).toContain('Location not available')
    expect(t).toContain('driver')
    expect(t).not.toContain('maps.google.com')
  })

  it('leaves the trip out when there is no trip', () => {
    const t = sosSmsText({ actorName: 'A', role: 'passenger', location: null, tripLine: null })
    expect(t).not.toContain('Trip:')
  })

  it('stays within about one SMS segment for a typical alert', () => {
    const t = sosSmsText({
      actorName: 'Celeste M.',
      role: 'passenger',
      location: { lat: 15.7333, lng: 120.9314 },
      tripLine: 'CLSU Main Gate → Sto. Tomas',
    })
    expect(t.length).toBeLessThan(220)
  })
})

describe('sosSmsHref', () => {
  it('builds an sms: link the phone can open', () => {
    const href = sosSmsHref('0917 123 4567', 'EMERGENCY: help')
    expect(href.startsWith('sms:09171234567?body=')).toBe(true)
    expect(href).toContain(encodeURIComponent('EMERGENCY: help'))
  })

  it('keeps a leading + for an international number', () => {
    expect(sosSmsHref('+63 917 123 4567', 'x')).toContain('sms:+639171234567')
  })

  it('escapes a message with characters that would break the URL', () => {
    const href = sosSmsHref('09171234567', 'a&b=c https://maps.google.com/?q=1,2')
    expect(href).not.toContain(' ')
    expect(href).toContain('%26')
  })
})

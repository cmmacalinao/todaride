import type { SosNotification } from '../types'

// What the person who pressed SOS is actually told about their own alert.
//
// The sheet used to decide this with one expression: list whoever was
// delivered to, and say "Sending…" when that list was empty. Which reads
// correctly right up until nothing can be sent at all — and then it says
// "Sending…" for ever. In production that is not a corner case: the SMS
// function returns 503 for want of its API key, every notification lands on
// 'failed', the delivered list stays empty, and a person in trouble watches a
// message promising that help is on its way while nothing has left the phone.
//
// That is worse than saying nothing. It is an assurance, and it competes with
// the one thing on that screen that does work — the call buttons, which go
// straight to the phone's own dialler and need no server at all.
//
// So the rule here distinguishes "not finished yet" from "finished, and
// nobody was reached", and says so plainly in the second case.

export type SosDeliveryTone = 'sending' | 'delivered' | 'partial' | 'failed'

export interface SosDeliveryStatus {
  tone: SosDeliveryTone
  // Whether to push the reader at the call buttons. True exactly when the
  // texting has stopped and somebody is still unreached.
  urgeCall: boolean
  delivered: SosNotification[]
  failed: SosNotification[]
  pending: SosNotification[]
}

export function sosDeliveryStatus(notifications: SosNotification[] = []): SosDeliveryStatus {
  // 'skipped' is neither a success nor a failure — it is a recipient the
  // rules decided not to contact (no number on file, a channel switched off).
  // Counting it as failure would cry wolf about somebody nobody meant to
  // text; counting it as success would claim they were told.
  const delivered = notifications.filter((n) => n.status === 'delivered')
  const failed = notifications.filter((n) => n.status === 'failed')
  const pending = notifications.filter((n) => n.status === 'pending')

  // Still in flight. Even with failures already in, the honest report is that
  // it is not finished — the remaining ones may still land.
  if (pending.length > 0) {
    return { tone: 'sending', urgeCall: false, delivered, failed, pending }
  }

  // Nothing has been attempted at all yet: the alert exists, its
  // notifications have not been built. Briefly true right after SEND.
  if (notifications.length === 0) {
    return { tone: 'sending', urgeCall: false, delivered, failed, pending }
  }

  if (delivered.length === 0) {
    // Finished, and not one message got out. The case this module exists for.
    return { tone: 'failed', urgeCall: true, delivered, failed, pending }
  }

  if (failed.length > 0) {
    return { tone: 'partial', urgeCall: true, delivered, failed, pending }
  }

  return { tone: 'delivered', urgeCall: false, delivered, failed, pending }
}

// A pre-filled message in the phone's own SMS app, for when the server-side
// send is not available.
//
// No API key, no account, no credits, and nothing to configure: the phone
// composes it and the person taps send. It is one tap more than an automatic
// text and infinitely more than one that never goes — and it matches the
// decision already made for SOS generally, that a human presses the button
// rather than the app deciding on its own.
//
// Kept to roughly one SMS segment. A location link is worth more than prose
// here: it is what a person receiving this actually needs in order to come.
export function sosSmsHref(phone: string, message: string): string {
  // ?body= is the de-facto form on both Android and iOS. The separator
  // differs (iOS historically wanted &), but ? works on current iOS and
  // Android alike, and the pilot is Android.
  return `sms:${phone.replace(/[^\d+]/g, '')}?body=${encodeURIComponent(message)}`
}

export function sosSmsText(input: {
  actorName: string
  role: 'passenger' | 'driver'
  location: { lat: number; lng: number } | null
  tripLine?: string | null
}): string {
  const { actorName, role, location, tripLine } = input
  const who = role === 'driver' ? 'driver' : 'passenger'
  const where = location
    ? `https://maps.google.com/?q=${location.lat.toFixed(5)},${location.lng.toFixed(5)}`
    : 'Location not available'
  // The trip only earns its place when there is one and there is room.
  const trip = tripLine ? ` Trip: ${tripLine}.` : ''
  return `EMERGENCY: ${actorName} (TODA Ride ${who}) needs help.${trip} Location: ${where}`
}

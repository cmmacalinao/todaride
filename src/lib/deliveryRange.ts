// How far a shop is willing to deliver.
//
// Any distance was quotable: a 9km order priced fine, the customer approved
// it, the shop accepted it, and then no rider would take a tariff fare for a
// trip that long — or one did, and spent an hour on a single delivery. The
// shop knows its own range; nothing in the app asked.
//
// Unset means no limit, which is exactly how every shop behaved before this
// existed, so nothing changes until a shop chooses.

export interface RangeState {
  // Null when the shop has set no limit at all.
  limitKm: number | null
  // Null when the distance is not known yet — no address picked.
  km: number | null
  withinRange: boolean
  // How far past the limit, rounded, when it is past it.
  overBy: number | null
}

export function deliveryRangeState(limitKm: number | null | undefined, km: number | null | undefined): RangeState {
  const limit = typeof limitKm === 'number' && limitKm > 0 ? limitKm : null
  const distance = typeof km === 'number' && Number.isFinite(km) ? km : null
  // No limit, or nothing to measure yet: there is nothing to refuse. An
  // address that has not been picked is not an address out of range.
  if (limit === null || distance === null) {
    return { limitKm: limit, km: distance, withinRange: true, overBy: null }
  }
  const within = distance <= limit
  return {
    limitKm: limit,
    km: distance,
    withinRange: within,
    overBy: within ? null : Math.round((distance - limit) * 10) / 10,
  }
}

// What to tell the customer. Null when there is nothing to say — which is
// most of the time, and a line that appears only when it matters is one
// people still read.
export function deliveryRangeMessage(state: RangeState, shopName: string): string | null {
  if (state.withinRange || state.limitKm === null || state.km === null) return null
  return `${shopName} delivers within ${state.limitKm} km. This address is ${state.km} km away — ${state.overBy} km too far.`
}

// What the app actually charges on a trip started at the terminal — a QR scan
// inside the tricycle, or "Sakay sa Terminal o Pumara". The waiver switch in
// Super Admin zeroes it; switched off, these rides pay the same commission as
// any other booking.
export function terminalRideAppFee(feeWaived: boolean, commissionPerRide: number): number {
  return feeWaived ? 0 : Math.max(0, commissionPerRide)
}

// Whether the "no booking app fee" promise is still true. Every place that
// makes that promise to a passenger asks this first — the moment the fee is
// ₱1 or more, the wording has to disappear rather than become a lie.
export function terminalRideIsFree(feeWaived: boolean, commissionPerRide: number): boolean {
  return terminalRideAppFee(feeWaived, commissionPerRide) === 0
}

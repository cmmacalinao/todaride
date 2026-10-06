// Launch mode: the app stops showing its own demo population to real users.
//
// The pilot ships with seventeen seeded drivers and a "Prototype · Simulated
// data" badge. Both are right for a prototype and wrong the first time a real
// passenger opens the app: the badge tells them this is not a real service,
// and the fake drivers sit in the same lists as the one real driver, so a
// booking can be offered to a tricycle that does not exist.
//
// Hidden rather than deleted, deliberately. Deleting them is not reversible
// and not even straightforward — RideContext re-injects any missing seed on
// load, so a purge means editing mock/data.ts, and the moment the seeds leave
// the code every past ride that references one loses its driver's name
// (TripMonitor resolves names through MOCK_DRIVERS precisely for that).
// Hiding keeps the demo rig for testing and for showing a TODA what the app
// does, and it is one switch to put back.
//
// The rule below only ever filters LISTS — who can be offered a ride, who
// appears in a picker. Looking a driver up by id must keep working whether or
// not they are hidden, or a completed trip in somebody's history turns into
// "Driver" with no name.

export interface SeedHideable {
  id: string
}

// Drivers a real passenger should be able to see and be matched with.
//
// `launchMode` off returns the list untouched: the prototype behaves exactly
// as it always has, which is what every demo and every test depends on.
export function visibleDrivers<T extends SeedHideable>(
  drivers: T[],
  seedIds: ReadonlySet<string>,
  launchMode: boolean,
): T[] {
  if (!launchMode) return drivers
  return drivers.filter((d) => !seedIds.has(d.id))
}

// Whether the prototype badge should be drawn.
//
// It is the single most damaging thing on the screen at launch — a passenger
// deciding whether to trust a stranger with a ride, told by the app itself
// that this is simulated. Off in launch mode, on otherwise.
export function showsPrototypeBadge(launchMode: boolean): boolean {
  return !launchMode
}

// A guard for the one thing launch mode must never do.
//
// If hiding the seeds leaves nobody to take a booking, a real passenger gets
// silence instead of a ride, and the cause ("the demo drivers are hidden") is
// invisible from their side. The caller shows this to an admin rather than
// letting the pilot look broken.
export function launchModeLeavesNoDrivers<T extends SeedHideable>(
  drivers: T[],
  seedIds: ReadonlySet<string>,
  launchMode: boolean,
): boolean {
  if (!launchMode) return false
  return drivers.length > 0 && visibleDrivers(drivers, seedIds, launchMode).length === 0
}

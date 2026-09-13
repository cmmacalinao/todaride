import type { SavedLocationLabel } from '../types'

// Shared between every screen that offers a Home/School/Work/Favorite quick
// pick (PassengerPage's ride/errand booking, VendorMenuBooking's Food
// Order/PaDeliver checkout) so the labels, icons, and button copy read the
// same wherever a passenger sees them.
export const SAVED_LOCATION_LABELS: SavedLocationLabel[] = ['Home', 'School', 'Work', 'Favorite']

export const SAVED_LOCATION_ICONS: Record<SavedLocationLabel, string> = {
  Home: '🏠',
  School: '🏫',
  Work: '💼',
  Favorite: '⭐',
}

// Home/School/Work are single-slot (saving one replaces the old one), so
// their button just names the slot. Favorite accumulates instead — the "+"
// makes clear that tapping it adds another rather than replacing anything.
export function savedLocationButtonLabel(label: SavedLocationLabel): string {
  return label === 'Favorite' ? `+ ${SAVED_LOCATION_ICONS[label]} ${label}` : `${SAVED_LOCATION_ICONS[label]} ${label}`
}

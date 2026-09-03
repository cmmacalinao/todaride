export type Role = 'passenger' | 'driver' | 'parent' | 'admin'

export interface Coords {
  x: number
  y: number
}

export interface MockLocation {
  id: string
  label: string
  coords: Coords
  // Real-shaped (though illustrative, not exhaustive) PH address tags used
  // purely for search/filter matching — the abstract x/y coords above still
  // drive the fare/ETA simulation math.
  province: string
  city: string
  barangay: string
  // Real approximate lat/lng, used only to place this point on the actual
  // OpenStreetMap live-tracking view — independent of the coords above.
  gps: GeoCoords
}

export interface LocationPing {
  ts: string
  coords: Coords
}

export type RideStatus =
  | 'requested'
  | 'accepted'
  | 'driver_arriving'
  | 'ongoing'
  | 'completed'
  | 'declined'
  | 'cancelled'

export type VerificationStatus = 'pending' | 'approved' | 'rejected'

export type DocumentType = 'nbiClearance' | 'driversLicense' | 'ltoRegistration' | 'lguRegistration'

export interface DriverDocument {
  submitted: boolean
  dataUrl: string | null
}

export type DriverDocuments = Record<DocumentType, DriverDocument>

export interface GeoCoords {
  lat: number
  lng: number
}

export type TodaOfficerRole = 'President' | 'Secretary' | 'Other'

export interface TodaOfficer {
  name: string
  role: TodaOfficerRole
}

// 'unregistered' is a TODA that exists because a driver named it at signup,
// before the organisation itself has applied for anything. It is a real
// record with real members — the association exists on the ground whether or
// not it has filed paperwork — and it is what a later registration claims,
// so the drivers already under it become its accredited members without
// anyone re-entering them.
export type TodaOrgVerificationStatus = 'unregistered' | 'pending' | 'approved' | 'rejected'

// Two independent sign-offs are required before a TODA's own per-ride
// commission actually takes effect: the org's own members (simulated as a
// single attestation toggle the TODA Admin sets — no real per-member vote)
// and the App Admin. Both must be true for proposedCommissionPerRide to be
// charged; otherwise the TODA collects nothing extra.
// A terminal is where drivers wait and passengers are picked up. Until now
// each organisation had exactly one, held as a location id on the org itself.
// A university transport system does not work that way — CLSU alone has three
// gates people queue at — so a terminal is now a record of its own, and an
// organisation can hold several.
export type TerminalType = 'university' | 'public' | 'market' | 'transport_hub'

export const TERMINAL_TYPE_LABELS: Record<TerminalType, string> = {
  university: 'University Terminal',
  public: 'Public Terminal',
  market: 'Market Terminal',
  transport_hub: 'Transport Hub',
}

export interface Terminal {
  // Human-facing code the operator actually uses on paper and over the radio
  // (CLSU-01), not a generated id — it is the name of the place in practice.
  id: string
  name: string
  type: TerminalType
  // Which organisation runs it. A terminal without one is not dispatchable.
  todaOrgId: string
  gps: GeoCoords | null
  province: string
  city: string
  barangay: string
  addressDetail: string
  isActive: boolean
}

export interface TodaOrganization {
  id: string
  name: string
  // Legacy link into the abstract-grid pickup/priority-dispatch system used
  // by the three seed TODAs; null for newly self-registered orgs, which
  // rely on terminalGps instead (see isRideVisibleToDriver/getPriorityTodaOrgId
  // scoping notes — new orgs don't yet participate in ride pickup priority,
  // only in the terminal-presence queue-join check).
  terminalLocationId: string | null
  proposedCommissionPerRide: number | null
  commissionApprovedByMembers: boolean
  commissionApprovedByAdmin: boolean
  // Exclusive access credential for this org's own TODA Admin panel — a
  // separate officer credential, not tied to any individual driver login.
  adminPin: string
  // The number a driver calls when something goes wrong — the officer on
  // duty, not an individual's private line. Optional so every existing
  // organisation stays valid; where it is missing the app says so rather
  // than pretending there is someone to ring.
  contactPhone?: string | null
  // At least two authorized officers (President and/or Secretary) named at
  // registration, who the App Admin can hold accountable for the org.
  officers: TodaOfficer[]
  province: string
  city: string
  barangay: string
  addressDetail: string
  // Captured via the browser's real Geolocation API — this is what
  // getTodaQueue's proximity check compares a driver's live position
  // against before letting them join the queue. Null until someone
  // captures/sets it (registration doesn't strictly require it, but the
  // proximity check is skipped entirely when it's null).
  terminalGps: GeoCoords | null
  verificationStatus: TodaOrgVerificationStatus
  // Same "approve as noted, with a resubmission deadline" pattern as
  // Driver.pendingNote/pendingNoteDeadline — set together when the App Admin
  // uses "Approve as noted" instead of a bare Approve/Reject on a pending
  // registration.
  registrationNote: string | null
  registrationNoteDeadline: string | null
  // Passenger-submitted average, folded in as a running average alongside
  // ratingCount — same shape as Driver's rating/ratingCount below.
  rating: number
  ratingCount: number
  // TaaS Level 1 — every TODA is a "SaaS Partner" by default (see
  // TODASafeRide-as-a-Service business roadmap). These are B2B billing
  // fields owed to TODASafeRide HQ, separate from the per-ride fare split
  // above — never subtracted from proposedCommissionPerRide/driver payouts.
  saasPlan: SaasPlan
  monthlyPlatformFee: number
  perBookingFee: number
  // Level-2 Operator this TODA reports to, if any; null = reports directly
  // to HQ (the default — most TODAs never move past Level 1).
  operatorId: string | null
}

// Boundaries are drawn on the map and kept as records of their own, because
// two different rules are measured from them. A TODA boundary is the area an
// association covers; a city-proper boundary is where the city tariff applies
// — outside it, the trip costs more. Both are the same shape on a map, so
// they are the same record with a different kind.
export type BoundaryKind = 'toda' | 'city_proper'

export const BOUNDARY_KIND_LABELS: Record<BoundaryKind, string> = {
  toda: 'TODA Boundary',
  city_proper: 'City Proper Boundary',
}

export interface MapBoundary {
  id: string
  name: string
  kind: BoundaryKind
  // Which association this belongs to, for a TODA boundary. Null for a city
  // proper, which belongs to the city named below rather than to any TODA.
  todaOrgId: string | null
  city: string
  points: GeoCoords[]
  // Where the shape came from, when it was not drawn by hand — an OSM way,
  // a surveyed file. Worth keeping: a boundary someone traced off a map and
  // one an ordinance defines deserve different amounts of trust.
  source: string | null
}

export type SaasPlan = 'starter' | 'standard' | 'premium'

// TaaS Level 2 — "Authorized Operator": an established TODA
// cooperative/organization that has qualified for greater access to the
// TODASafeRide brand and business system, and can itself have one or more
// TodaOrganizations reporting to it (see TodaOrganization.operatorId). A
// distinct account/login from TodaOrganization's own TODA Admin — modeled on
// the same PIN-login + pending/approved verification pattern.
export interface Operator {
  id: string
  name: string
  contactPerson: string
  contactPhone: string
  adminPin: string
  province: string
  city: string
  // Self-service business-profile fields — editable from the Operator's own
  // dashboard (OperatorPortalPage.tsx) via updateOperatorProfile, unlike
  // TodaOrganization/Pharmacy's org profile which stays read-only.
  email: string | null
  barangay: string
  addressDetail: string
  businessRegistrationNo: string | null
  // A sponsor/partner mark (e.g. a civic club or funder's logo) shown on the
  // right side of the app header — see NavBar.tsx. A data: URL, same as
  // every other admin-uploaded image in this app (BannerAd, driver
  // documents); null/undefined shows nothing rather than a broken image.
  logoDataUrl?: string | null
  // The partnership banner on the sign-in screen — the same partner's
  // artwork as the logo, so the same owner. A path under /public for the
  // seeded default, a data: URL once an Operator replaces it from their
  // portal; null once they remove it, and then the screen shows nothing
  // there. Undefined means never set, which the loader turns into the seed.
  bannerDataUrl?: string | null
  // One-time activation fee, set by the App Admin on approval (typical
  // ₱25,000–75,000 per the roadmap) — null until approved.
  activationFee: number | null
  monthlyPlatformFee: number
  perBookingFee: number
  // Level-3 Franchise this Operator belongs to, if any; null = reports
  // directly to HQ.
  franchiseId: string | null
  verificationStatus: TodaOrgVerificationStatus
  registrationNote: string | null
}

// TaaS Level 3 — "Franchise": the right to operate a TODASafeRide business
// within an approved territory, introduced only after the SaaS/Operator
// levels have proven the model (see roadmap's "earn the right to franchise").
// Owns a set of Operators via Operator.franchiseId. royaltyPct is
// display-only — it is never deducted from actual ride payouts.
export interface Franchise {
  id: string
  name: string
  contactPerson: string
  contactPhone: string
  adminPin: string
  province: string
  city: string
  // Self-service business-profile fields — editable from the Franchise's own
  // dashboard (FranchisePage.tsx) via updateFranchiseProfile.
  email: string | null
  barangay: string
  addressDetail: string
  businessRegistrationNo: string | null
  // One-time franchise fee, set by the App Admin on approval (typical
  // ₱100,000–300,000+ per the roadmap) — null until approved.
  initialFranchiseFee: number | null
  monthlyTechnologyFee: number
  royaltyPct: number | null
  verificationStatus: TodaOrgVerificationStatus
  registrationNote: string | null
}

// TODARIDE MEDS — a pharmacy account, modeled directly on TodaOrganization
// above: its own PIN login, its own portal (PharmacyPortalPage), scoped to
// its own orders/products. For this MVP pass every seeded pharmacy ships
// pre-approved (no Admin approval UI yet — see verificationStatus comment).
export type MedicineCategory = 'otc' | 'rx' | 'restricted'

export interface MedicineProduct {
  id: string
  pharmacyId: string
  name: string
  genericName: string | null
  category: MedicineCategory
  price: number
  inStock: boolean
}

// 'pharmacy' gets the full TODARIDE MEDS catalog/quote pipeline (this
// entity's own products + medsOrders/quote flow). 'store' is a general
// business (sari-sari store, hardware, grocery, etc.) with no medicine
// catalog — it registers through the same form so it appears as a pickable,
// named pickup point for a Pabili errand instead of the auto-resolved
// generic "nearby public market", but Pabili itself stays freeform (the
// passenger still just types what to buy; there's no product list or quote
// step for a store).
// All four share the Pharmacy entity, portal and login below — they differ
// only in what they sell and which Super Admin toggle reveals them.
// 'pharmacy' is gated by Buy Medicine; the rest are partner vendors.
export type BusinessType = 'pharmacy' | 'store' | 'resto_food' | 'other_commodity'

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  pharmacy: 'Pharmacy',
  store: 'Store',
  resto_food: 'Resto / Food',
  other_commodity: 'Other Commodity',
}

// A single e-wallet account a pharmacy/store shows to customers so they can
// pay for goods directly (as opposed to cash, which the driver collects on
// delivery — see MedsBooking.tsx/PassengerPage.tsx's "medicine cost to the
// pharmacy, delivery fee to the driver" split). qrDataUrl is optional since
// a business may only want to show the account number/name.
export interface PaymentAccountDetails {
  accountName: string
  accountNumber: string
  qrDataUrl: string | null
}

// A settlement of platform fees, paid by whoever owes them up to the
// platform itself. A driver owes commission on the fares they collected in
// cash; a TODA, Operator or Franchise owes its monthly subscription. Same
// record either way — only the payer differs — so one Statement of Account
// can be produced at any level of the hierarchy.
export type PlatformFeePayerRole = 'driver' | 'toda_org' | 'operator' | 'franchise'

// A driver asking for money the platform is holding for them.
//
// Cash fares never appear here: those were handed over at the kerb and are
// already in the driver's pocket. What accumulates is the online ones — the
// passenger paid the platform's merchant account, so the driver's share of
// that fare is money somebody else is holding, and there has to be a way to
// ask for it.
//
// A request, not a transfer. Nothing here moves money: a real disbursement
// needs Maya's payout API and a verified payout account per driver, and until
// that exists this is the same shape as the platform fee payments above — a
// record that a reconciliation is done against, settled by a person.
export interface DriverWithdrawal {
  id: string
  driverId: string
  driverName: string
  amount: number
  // Where the driver wants it sent, copied at the moment of asking. Copied
  // rather than looked up later, because a driver who changes their wallet
  // number afterwards must not silently redirect a payout already approved.
  method: 'gcash' | 'maya'
  accountName: string
  accountNumber: string
  requestedAt: string
  status: 'pending' | 'paid' | 'rejected'
  // Filled in when somebody settles it: the reference off the transfer, so
  // the driver has something to check against their own wallet history.
  reference: string | null
  settledAt: string | null
  // Why, when it is refused. A rejection with no reason is a support ticket.
  note: string | null
}

export interface PlatformFeePayment {
  id: string
  payerRole: PlatformFeePayerRole
  payerId: string
  payerName: string
  amount: number
  method: 'gcash'
  // What the payer typed off their GCash receipt. Not verified by anything —
  // this is a prototype — but it is the number a real reconciliation would
  // be done against, so it is captured rather than invented.
  reference: string
  proofDataUrl: string | null
  paidAt: string
}

export interface Pharmacy {
  id: string
  name: string
  businessType: BusinessType
  // Null until the pharmacy/store fills these in from its own portal — see
  // PharmacyPortalPage.tsx's "Payment accounts" section. Customers only see
  // one of these (and its QR/account info) when they pick GCash/Maya as
  // their payment method — Card stays a plain simulated "paid online" note
  // since it has no comparable account-number/QR concept.
  gcashAccount: PaymentAccountDetails | null
  mayaAccount: PaymentAccountDetails | null
  // Exclusive login credential for this pharmacy's own portal — same role as
  // TodaOrganization.adminPin.
  adminPin: string
  contactPhone: string
  province: string
  city: string
  barangay: string
  addressDetail: string
  // Abstract simulation-grid position (fare/ETA math) alongside the real
  // locationGps below, same split as MockLocation.coords/gps — needed so a
  // confirmed order can build a pickup MockLocation for the dispatched Ride.
  coords: Coords
  locationGps: GeoCoords | null
  isOpen: boolean
  // 'pending'/'rejected' exist for a future Admin-approval pass — every
  // seeded pharmacy this MVP ships as 'approved' directly, so the UI never
  // actually shows a pending/rejected pharmacy yet.
  verificationStatus: TodaOrgVerificationStatus
  // Editable from My Profile (see NavBar.tsx's hamburger drawer) — optional
  // so existing Pharmacy literals stay valid. No email field previously
  // existed at all; paymentDetail here is deliberately separate from the
  // real gcashAccount/mayaAccount above (those are what customers actually
  // pay into — this is just a free-text note on the profile panel).
  email?: string | null
  paymentDetail?: string | null
  password?: string | null
  emergencyContact?: string | null
}

// Full lifecycle: pending_confirmation (customer asked for a quote) →
// quoted (pharmacy priced the items, awaiting the customer) → confirmed
// (customer accepted the quote and checked out — only now may the pharmacy
// actually process/dispatch it) → ready_for_pickup (self_book orders only,
// between processing and the customer booking their own ride) → dispatched
// (a real Ride exists — look at it for further delivery status instead of
// tracking progress twice here). rejected/cancelled are terminal off-ramps
// reachable from any pre-dispatch state.
export type MedsOrderStatus =
  | 'pending_confirmation'
  | 'quoted'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'ready_for_pickup'
  | 'dispatched'

export interface MedsOrderItem {
  productId: string
  name: string
  quantity: number
  unitPrice: number
  // The pharmacy's own note on this line — e.g. the requested brand wasn't
  // in stock and they substituted a generic — set when they send the quote,
  // shown to the customer alongside the price. Null until then.
  note: string | null
}

export interface MedsOrder {
  id: string
  customerId: string
  customerName: string
  pharmacyId: string
  items: MedsOrderItem[]
  subtotal: number
  deliveryFee: number
  serviceFee: number
  total: number
  paymentMethod: PaymentMethod
  status: MedsOrderStatus
  rejectionReason: string | null
  // 'not_required' when the cart has no Rx item — otherwise starts 'pending'
  // as soon as a prescription photo is attached, reviewed by the pharmacy
  // portal same as a driver document review. An array since a prescription
  // is often more than one page — empty array means none attached.
  prescriptionDataUrls: string[]
  prescriptionStatus: 'not_required' | 'pending' | 'approved' | 'rejected'
  // A photo of a handwritten/printed receipt the pharmacy sends back with
  // its quote — the alternative to (or backup for) typing individual line
  // items, for a prescription-only order with nothing itemized yet. Set
  // together with the quote (see PHARMACY_SEND_QUOTE); null otherwise.
  receiptDataUrl: string | null
  deliveryAddress: MockLocation
  // Chosen by the customer at checkout. 'pharmacy_books' (default): the
  // pharmacy's confirmation immediately dispatches a Ride, same as before
  // this field existed. 'self_book': confirmation instead leaves the order
  // at 'ready_for_pickup' and the customer dispatches the Ride themselves
  // (e.g. to pick their own favorite driver, or time it around their day)
  // via bookOwnMedsRide.
  deliveryMode: 'pharmacy_books' | 'self_book'
  // Set once a Ride is actually created for this order (either
  // automatically when the pharmacy processes it, or via bookOwnMedsRide) —
  // from here on, DriverPage/TripMonitor (looking up this Ride) are the
  // source of truth for delivery progress, not this MedsOrder.
  linkedRideId: string | null
  // Simulated online payment — set together when the customer accepts a
  // quote with an online method (gcash/maya/card). Same "Prototype ·
  // Simulated data" spirit as the rest of the app's payment handling: no
  // real gateway, just an instant recorded confirmation. Stays null for
  // cash, which is still collected/confirmed at delivery via the linked
  // Ride's existing payment flow, unchanged.
  paidOnline: boolean
  paymentReference: string | null
  // Uploaded by the customer alongside accepting a gcash/maya quote — a
  // screenshot of the actual e-wallet transfer to the pharmacy's own
  // account (see Pharmacy.gcashAccount/mayaAccount), so the pharmacy has
  // something to check before processing. Optional — stays null for cash
  // and for online payments the customer didn't bother attaching proof to.
  paymentProofDataUrl: string | null
  requestedAt: string
  quotedAt: string | null
  confirmedAt: string | null
  // Freeform back-and-forth between the customer and the pharmacy about
  // this specific order — brand substitutions, stock questions, delivery
  // instructions. Kept on the order itself (not the eventual Ride) since it
  // starts as soon as a quote is requested, before any driver exists.
  messages: OrderMessage[]
}

export interface OrderMessage {
  id: string
  sender: 'customer' | 'pharmacy'
  text: string
  sentAt: string
}

export type DriverAccessStatus = 'active' | 'paused' | 'terminated'

export interface Driver {
  id: string
  name: string
  plateNumber: string
  licenseNo: string
  licenseExpiry: string
  pin: string
  rating: number
  // Number of ratings folded into `rating` so far — lets a new rating be
  // merged in as a running average instead of overwriting it.
  ratingCount: number
  online: boolean
  verificationStatus: VerificationStatus
  // When a driver signed up before producing documents, the date those
  // documents are due. null once everything is in, or when they were
  // complete from the start. Stamped at registration rather than derived
  // from the current setting, so changing the window later cannot put an
  // existing driver in breach of a date nobody gave them.
  documentsDueBy?: string | null
  documents: DriverDocuments
  todaOrgId: string | null
  province: string
  city: string
  barangay: string
  addressDetail: string
  phone: string
  // Optional alternate login identifier alongside name/phone — not collected
  // at registration by default, only if the driver chooses to add one.
  email: string | null
  // Optional Facebook profile URL/username — common for PH riders/TODAs to
  // vouch for or look up a driver informally, alongside the formal license
  // documents below.
  facebook: string | null
  // When this TODA member last joined the terminal queue; null = not
  // currently queued. Ordering within a TODA's queue is by this timestamp
  // ascending (first to join is first offered a ride). Irrelevant for
  // freelance drivers (todaOrgId === null) — they have no terminal queue.
  queueJoinedAt: string | null
  // Which of the TODA's terminals this driver works out of. A TODA with one
  // terminal never needs it; CLSU has three, and a driver waiting at the
  // Second Gate is not in the same line as one at the Main Gate. Optional so
  // every existing driver record stays valid — unset means "wherever they
  // happen to be standing", the old behaviour.
  homeTerminalId?: string | null
  // The GPS reading captured the last time this driver joined a terminal
  // queue. There is no continuous feed for an idle driver, so this is the
  // freshest real position dispatch has to work with; null falls back to
  // the driver's terminal (see driverDispatchGps in mock/data.ts).
  lastKnownGps?: GeoCoords | null
  // When that position was published. Without it there is no way to tell a
  // reading from a minute ago from one left behind yesterday, and a stale
  // point drawn as a live tricycle is worse than no tricycle: somebody walks
  // toward a marker for a driver who went home.
  lastKnownGpsAt?: string | null
  // Where a passenger sends an e-wallet fare. Null until the driver fills it
  // in from their own profile — a number nobody entered is worse than none
  // at all, so the passenger is told to ask rather than shown a blank.
  // qrDataUrl is the driver's own GCash/Maya QR, which is what actually gets
  // used at the kerb: the passenger scans it instead of typing a number.
  gcashAccount?: PaymentAccountDetails | null
  mayaAccount?: PaymentAccountDetails | null
  // Opt-in: when a request is a Pabili errand, drivers with this on are
  // offered it before anyone else in the terminal queue (still in join
  // order among themselves) — Pabili makes up a large, real share of
  // requests, so drivers who specifically want that work can get first
  // crack at it instead of it being offered in plain queue order. Doesn't
  // affect regular ride requests at all.
  pabiliPriority: boolean
  // Only the App Admin can change this (not the TODA itself — a TODA can
  // only *request* a hold/terminate, see MembershipRequest). A paused or
  // terminated driver can still log in to see why, but can't join a
  // terminal queue or receive ride offers.
  accessStatus: DriverAccessStatus
  accessNote: string | null
  // Admin's note on a still-pending application, shown to the applicant on
  // their login screen (e.g. "resubmit a clearer LTO OR/CR photo").
  pendingNote: string | null
  // Set together with pendingNote when Admin uses "Approve as noted" instead
  // of a bare Approve/Reject — gives the applicant a real deadline to submit
  // the missing requirement. Purely a display deadline (see isPastDeadline
  // in mock/data.ts): once it passes with the application still pending,
  // the queue shows it as needing rejection rather than silently mutating
  // state on its own.
  pendingNoteDeadline: string | null
  // Set together with verificationStatus 'rejected' — Admin's reason shown to
  // the applicant on their login screen, alongside the option to appeal.
  rejectionReason: string | null
  // Set when a rejected applicant appeals — flips verificationStatus back to
  // 'pending' so it re-enters the Admin queue, with this message shown
  // alongside the original rejectionReason for context. Cleared whenever
  // Admin approves or rejects again (see APPROVE_DRIVER/REJECT_DRIVER).
  appealMessage: string | null
  appealedAt: string | null
  // Freeform note of a preferred payout account (e.g. a GCash/Maya number)
  // shown on My Profile — a saved reference only, doesn't change how fares
  // are actually settled. Optional so existing Driver literals don't need
  // updating just because this field exists.
  paymentDetail?: string | null
  // Account password set from My Profile — this prototype's actual login
  // still only checks `pin` (see DriverAuthGate.tsx), so this field is
  // stored for completeness but doesn't gate sign-in.
  password?: string | null
  // A driver has no guardian/parent account backing an emergency contact
  // the way a Passenger's guardianPhone does — this is the driver-side
  // equivalent, editable from My Profile.
  emergencyContact?: string | null
}

// A fixed, single-slot-per-label set of quick-pick places — saving a new
// location under a label already in use (e.g. a second "Home") replaces the
// old one rather than accumulating duplicates. `location` is a full
// MockLocation (not just an id) so a saved place can be either a preset
// location or a previously-geocoded custom address, either way carrying its
// own real gps for the map.
export type SavedLocationLabel = 'Home' | 'School' | 'Work' | 'Favorite'

export interface SavedLocation {
  id: string
  label: SavedLocationLabel
  location: MockLocation
}

export interface Passenger {
  id: string
  name: string
  age: number
  isStudent: boolean
  // PWD/Senior citizen discount — mutually exclusive with isStudent in
  // practice (fare calc gives this priority when both are somehow true).
  isPwdSenior: boolean
  phone: string
  // Optional alternate login identifier alongside name/phone.
  email: string | null
  // 4-digit PIN, alternative to OTP at login. Null for passengers who never
  // log in on their own (e.g. a child registered through a Parent account).
  pin: string | null
  province: string
  city: string
  barangay: string
  addressDetail: string
  // Only used as an SOS fallback when this passenger has no linked parent
  // account (e.g. a solo-registered adult passenger).
  guardianPhone: string | null
  // Who that number belongs to, and how they are related. Optional for the
  // same reason as paymentDetail below — every existing Passenger literal
  // predates these fields and stays valid without them. A number with no
  // name against it is of limited use to whoever has to make the call.
  guardianName?: string | null
  guardianRelationship?: string | null
  // When set, a new ride is offered to this driver first, ahead of the
  // normal terminal-queue order.
  favoriteDriverId: string | null
  savedLocations: SavedLocation[]
  // Freeform note of a preferred payment account (e.g. a GCash/Maya number)
  // shown on My Profile — a saved reference only, not read by checkout,
  // which still asks the payment method fresh on every booking. Optional so
  // existing seed passengers (and every other Passenger literal in the
  // codebase) don't need updating just because this field exists.
  paymentDetail?: string | null
  // Account password set from My Profile — this prototype's actual login
  // still only checks `pin`/OTP (see AuthGate.tsx), so this field is stored
  // for completeness but doesn't gate sign-in. Optional for the same reason
  // as paymentDetail above.
  password?: string | null
}

// A TODA officer starts a new member's registration by supplying just
// enough to identify them and a channel to reach them — the invite link
// (built from this record's id) opens the driver registration form
// pre-filled with these fields and locked to this TODA, so the recruit only
// has to add the rest: plate/license/address/PIN/documents.
export interface DriverInvite {
  id: string
  todaOrgId: string
  name: string
  phone: string
  email: string | null
  createdAt: string
  // Set once someone actually completes registration through this invite —
  // an invite is single-use so the same link can't spawn duplicate accounts.
  usedByDriverId: string | null
}

export type DuesType = 'monthly_dues' | 'contribution'

export interface DuesRecord {
  id: string
  driverId: string
  todaOrgId: string
  type: DuesType
  label: string
  amount: number
  dueDate: string
  paidAt: string | null
}

export type MembershipRequestType = 'hold' | 'terminate'
export type MembershipRequestStatus = 'pending' | 'approved' | 'rejected'

// A TODA org can only ask — the App Admin decides. This is that ask.
export interface MembershipRequest {
  id: string
  driverId: string
  todaOrgId: string
  requestType: MembershipRequestType
  reason: string
  status: MembershipRequestStatus
  requestedAt: string
  resolvedAt: string | null
}

export interface Parent {
  id: string
  name: string
  phone: string
  // Optional alternate login identifier alongside name/phone.
  email: string | null
  // 4-digit PIN, alternative to OTP at login.
  pin: string | null
  province: string
  city: string
  barangay: string
  addressDetail: string
  // When set, a new ride booked for the parent's own self-booking is
  // offered to this driver first, ahead of the normal terminal-queue order
  // — mirrors Passenger.favoriteDriverId. Optional (not `| null`) so older
  // persisted records without it still satisfy the type; treat missing the
  // same as null.
  favoriteDriverId?: string | null
  // Same optional, editable-from-My-Profile fields as Passenger/Driver —
  // see those for why they're optional (existing literals stay valid).
  paymentDetail?: string | null
  password?: string | null
  emergencyContact?: string | null
}

export interface ParentLink {
  parentId: string
  studentPassengerId: string
  relationship: string
  consentGiven: boolean
  proofOfAuthorityDataUrl: string | null
  consentedAt: string
}

export type SosAlertType = 'sos' | 'route_deviation'
export type SosAlertStatus = 'open' | 'resolved'
export type SosTriggeredByRole = 'passenger' | 'driver'

export type HotlineCategory = 'police' | 'fire' | 'medical' | 'rescue' | 'disaster' | 'toda' | 'other'

// A real, dialable emergency contact — unlike almost everything else in this
// prototype, these are NOT simulated: a wrong number here could send someone
// to the wrong place in an emergency. Hence `source` and `verified`: seeded
// entries carry where they came from, and anything an admin types in starts
// unverified until a person confirms it by actually calling.
//
// Scope is widest-to-narrowest by nulls: province null = nationwide;
// province set + city null = province-wide; both set = that city/municipality
// only. Readers see their own city's numbers plus everything above it.
export interface EmergencyHotline {
  id: string
  name: string
  number: string
  category: HotlineCategory
  province: string | null
  city: string | null
  // Where the number came from — a URL for seeded ones, or free text like
  // "confirmed by TODA president" for locally added entries.
  source: string | null
  // Operating hours or any caveat worth seeing before dialling — "24/7",
  // "office hours only". Optional so existing stored entries stay valid.
  notes?: string | null
  verified: boolean
  addedAt: string
}

export interface SosAlert {
  id: string
  // Ride-bound for the original passenger-triggered flow; null for a
  // driver-initiated SOS (see TRIGGER_DRIVER_SOS), which can fire whether or
  // not the driver is currently on a trip.
  rideId: string | null
  triggeredBy: string
  type: SosAlertType
  status: SosAlertStatus
  notes: string
  createdAt: string
  // Set when this alert's passenger had no linked parent account, so the
  // fallback guardian contact on file was (simulated-)notified instead.
  guardianNotifiedPhone: string | null
  // Driver-initiated SOS only — undefined/null on every existing
  // passenger-triggered alert. todaOrgId is what lets TodaAdminPage.tsx and
  // fellow members on DriverPage.tsx find "alerts from my own TODA" without
  // touching the (unscoped, ride-bound) passenger SOS path at all.
  triggeredByRole?: SosTriggeredByRole
  todaOrgId?: string | null
  location?: GeoCoords | null
}

export interface RidePhoto {
  id: string
  dataUrl: string
  takenBy: string
  takenAt: string
}

export type PaymentMethod = 'cash' | 'gcash' | 'maya' | 'card'
export type PaymentStatus = 'pending' | 'paid'

export interface Payment {
  method: PaymentMethod
  status: PaymentStatus
  referenceNo: string | null
  // Total collected from the passenger, i.e. fareEstimate + tip.
  amount: number
  driverPayout: number
  platformFee: number
  // The driver's own TODA's per-ride cut, if the org has an
  // admin-and-member-approved commission active at completion time. 0 for
  // freelance drivers or TODAs without an active commission.
  todaCommission: number
  // Passenger-offered tip (Pabili orders only, currently) — goes to the
  // driver in full, not subject to platform fee or TODA commission.
  tip: number
  paidAt: string
}

export type QueueOfferOutcome = 'declined' | 'timeout'

export interface QueueOfferLogEntry {
  driverId: string
  driverName: string
  outcome: QueueOfferOutcome
  at: string
}

export interface Ride {
  id: string
  passengerId: string
  passengerName: string
  // Only set for a "book for someone else" guest ride, where passengerId is
  // a synthetic id with no real Passenger record to look up a phone from —
  // lets the driver still call the actual rider directly. Null otherwise;
  // a self-booking's phone comes from the real Passenger/Parent record.
  passengerPhone: string | null
  driverId: string | null
  driverName: string | null
  pickup: MockLocation
  dropoff: MockLocation
  fareEstimate: number
  status: RideStatus
  requestedAt: string
  acceptedAt: string | null
  startedAt: string | null
  // How far the driver was from the booked pickup pin when they started, in
  // metres. The pickup coordinate is moved to where the driver actually was
  // (see START_RIDE), so this is the only record that the two ever disagreed
  // - and a trip that began a kilometre from where it was booked is exactly
  // what a dispute is about. Null when there was no position to compare.
  startedAwayFromPickupMeters: number | null
  completedAt: string | null
  driverPosition: Coords | null
  passengerPosition: Coords | null
  // Real device GPS captured at booking time, for the driver to pinpoint
  // exactly where the passenger is standing — independent of the abstract
  // pickup point used for the simulation grid above. Null if the passenger
  // didn't capture it (it's optional).
  pickupGps: GeoCoords | null
  // Continuously-updated real device GPS, only present while the driver (or
  // passenger) has explicitly opted in to live-sharing their location on the
  // real OpenStreetMap tracking view for this ride — null otherwise, in
  // which case the map falls back to interpolating along legProgress.
  driverLiveGps: GeoCoords | null
  driverLiveGpsAt: string | null
  passengerLiveGps: GeoCoords | null
  passengerLiveGpsAt: string | null
  legProgress: number
  locationLog: LocationPing[]
  paymentMethod: PaymentMethod
  payment: Payment | null
  // When the passenger said they had got off. Completion no longer follows
  // from this on its own: the driver still has to confirm the fare was
  // actually handed over, so a passenger cannot close a ride they have not
  // paid for. Optional so rides saved before this existed still parse.
  passengerArrivedAt?: string | null
  // Where the passenger actually got out, when that is not the destination
  // they booked — someone asking to stop early is ordinary, and the trip
  // record should say where the ride ended rather than where it was meant
  // to. Null when they got out at (or within a short walk of) the booked
  // drop-off, in which case dropoff.label is the better description: a real
  // place name beats a pair of coordinates. Optional so older rides parse.
  actualDropoff?: { gps: GeoCoords; label: string; metersShort: number } | null
  // Drivers who have said no to this ride. Separate from priorityQueueLog,
  // which is the terminal-queue rotation and only tracks whoever was "up":
  // an open-to-all ride has no queue turn to skip, so without this a decline
  // had nowhere to be recorded and the request simply reappeared. Optional so
  // rides saved before this existed still parse.
  declinedByDriverIds?: string[]
  isStudentRide: boolean
  // PWD/Senior discount, snapshotted at request time same as isStudentRide —
  // takes priority over the student rate if both are somehow true.
  isPwdSeniorRide: boolean
  routeAlert: boolean
  deviationOffset: Coords | null
  safetyPhotos: RidePhoto[]
  priorityTodaOrgId: string | null
  // Sequential terminal-queue dispatch: while the priority window is open,
  // only the driver currently "up" (queueOfferedDriverId) can accept — not
  // a broadcast to the whole TODA. Null means either the queue was empty at
  // request time or everyone in it has already been offered and passed, in
  // which case the ride opens to all immediately (see isRideVisibleToDriver).
  // Set when the passenger turned down a driver's proposed fare. Distinct
  // from declinedByDriverIds, which also fills up when drivers pass on the
  // ride — this one means the passenger is back to choosing, and the app
  // puts them back on the booking screen to do it.
  passengerDeclinedFare?: boolean
  // The passenger boarded at the terminal rather than being dispatched to:
  // either they scanned the QR inside the tricycle, or they picked it out of
  // the pila on the Sakay sa Terminal page. Either way the app did no
  // matching — they walked up and got in — so it charges no platform fee on
  // the ride. The TODA's own commission is a separate arrangement and is
  // untouched.
  bookedAtTerminal?: boolean
  // The passenger started this trip by tapping "record my ride" while
  // already sitting in the tricycle, so the app filled in the pickup from
  // their GPS and has not been told where they are going yet. The trip runs
  // normally; the destination is asked for once they are moving, because a
  // passenger who has just sat down is not reading a form.
  destinationPending?: boolean
  // Written by the app itself, not asked for. The passenger boarded off the
  // street and the two GPS traces — theirs and the tricycle's — left
  // together and stayed together, so the app recorded who they are riding
  // with. It is a safety net rather than a booking: nobody was dispatched,
  // nothing was matched, and no platform fee is charged for it.
  safetyRecord?: boolean
  // The plate a passenger typed for a tricycle this app has never heard
  // of. Not every tricycle on the road is a registered TODA SafeRide
  // driver, and somebody riding in one of those is exactly who most needs
  // a record of it — so the plate is kept even though there is no account
  // to attach it to, and no driver phone to compare movement against.
  unregisteredPlate?: string | null
  priorityQueueOfferedDriverId: string | null
  priorityQueueOfferedAt: string | null
  priorityQueueLog: QueueOfferLogEntry[]
  // How many riders are actually in the tricycle for this trip (1-4, a
  // standard tricycle's practical capacity) — the passenger books once for
  // their whole group rather than each rider booking separately.
  passengerCount: number
  // A completed ride can be rated once — driver and TODA are rated and
  // reviewed independently (a great driver from a poorly-run TODA, or vice
  // versa, should be able to say so). Null fields = not yet rated.
  driverRating: number | null
  driverReviewText: string | null
  todaRating: number | null
  todaReviewText: string | null
  ratedAt: string | null
  // "ride" is a normal trip; "pabili" and "buy_medicine" are errand
  // requests — the driver buys whatever's in pabiliItems at `pickup` and
  // delivers it to `dropoff`, reusing the same dispatch/tracking/completion
  // flow as a regular ride. "buy_medicine" additionally carries the
  // passenger's uploaded prescription/ID so the driver can show them at the
  // pharmacy counter.
  serviceType: ServiceType
  pabiliItems: string | null
  // Goes entirely to the driver on completion — see Payment.tip.
  pabiliTip: number
  // Admin's Pabili/Buy Medicine service charge, snapshotted at request time
  // (0 for serviceType 'ride') and folded into fareEstimate.
  pabiliServiceFee: number
  // "buy_medicine" only — a photo of the passenger's prescription and/or
  // Senior Citizen ID (for discounted/controlled medicine) and any other
  // supporting document, so the driver can present them at the pharmacy
  // counter instead of the passenger having to be there in person. All
  // optional (not every purchase needs a prescription or a senior discount)
  // and empty/null for every other serviceType. prescriptionDataUrls is an
  // array since a prescription is often more than one page.
  prescriptionDataUrls: string[]
  seniorIdDataUrl: string | null
  otherDocDataUrl: string | null
  // A screenshot of a gcash/maya transfer sent directly to a Pabili store's
  // own account (see Pharmacy.gcashAccount/mayaAccount) — only meaningful
  // when pickup is a registered store and paymentMethod isn't 'cash'. Null
  // otherwise; purely informational for the driver, same spirit as the
  // prescription/document photos above.
  paymentProofDataUrl: string | null
  // Set when a parent booked this ride on behalf of their linked child
  // (passengerId/passengerName are still the child's — this is just a
  // record of who initiated it).
  bookedByParentId: string | null
  // Links every ride created from one Group Ride booking together — each
  // rider going to their own destination gets their own Ride record (same
  // as an ordinary shared ride), but these were all requested at once by
  // one person rather than found opportunistically along the way. Null for
  // an ordinary ride. Optional so rides saved before this existed still
  // parse.
  groupBookingId?: string | null
  // Who's actually settling this ride's fare when the group chose "I'll
  // pay for everyone" — the booker's passengerId, the same value on every
  // ride in the group including the booker's own. Null when the group paid
  // separately (or this isn't a group ride), in which case this ride's own
  // fareEstimate is this rider's own to pay, same as an ordinary ride. When
  // set and this ride isn't the payer's own, fareEstimate is 0 — the whole
  // group's fare was folded into the payer's ride instead. Optional so
  // rides saved before this existed still parse.
  groupPayerId?: string | null
  // "Special pickup": the passenger's TODA Terminal is far from them, so
  // instead of walking to the terminal they've asked the driver to come to
  // their exact pickupGps spot — folded into fareEstimate as the extra
  // terminal→pickup distance beyond tariffSettings.standardKmCovered (see
  // estimateSpecialPickupFee in mock/data.ts). specialPickupFee is 0 (and
  // specialPickupRequested false) for an ordinary terminal pickup.
  specialPickupRequested: boolean
  specialPickupFee: number
  // A "special trip": the passenger has taken the whole tricycle, so the
  // driver must not pick anyone else up along the way. Optional because
  // every ride booked before the option existed is an ordinary shared-
  // eligible trip; absent reads the same as false.
  specialTrip?: boolean
  // An incentive tip the passenger can add (and keep raising) while still
  // waiting for a driver to accept — separate from pabiliTip (which is
  // fixed at request time for an errand). Starts at 0 and only rises while
  // status is 'requested' (see ADD_TIP_OFFER); goes entirely to the driver
  // on completion, same as pabiliTip — see Payment.tip.
  tipOffer: number
  // The payment method chosen at request time is locked while the trip is
  // in progress — the passenger sees it (read-only) on the trip screen but
  // can't change it until the ride is actually 'completed', at which point
  // tapping a method confirms/corrects how they paid (see
  // acknowledgeRidePayment) and is what moves this ride out of "current
  // trip" and into Trip History. False for every ride until that tap.
  paymentAcknowledged: boolean
  // Who called the ride off and why. A cancellation with no account of itself
  // is the same record whether the passenger never showed, the tricycle broke
  // down, or the driver simply changed their mind — and those are not the
  // same thing to the passenger reading it, or to the TODA reviewing a
  // driver's pattern of them. Null on every ride that was not cancelled.
  // Which items on a Pabili list the driver has actually bought, by their
  // position in pabiliItems. Kept on the ride rather than on the driver's
  // device so it survives a reload mid-errand and so the customer can watch
  // the shopping happen instead of waiting blind.
  // Where the driver actually was when they took the job — pinned at that
  // moment, not the terminal the TODA nominally works from. It is what the
  // out-of-area charge is measured from, and it is drawn on the map so the
  // passenger can see the tricycle really is coming from over there.
  driverOriginGps: GeoCoords | null
  // A driver has offered to take this ride at a fare the passenger has not
  // agreed to yet. The ride is not theirs until the passenger says yes, so
  // nothing here is applied to the ride until then.
  pendingApproval: PendingFareApproval | null
  // Kept on the ride once approved, so the receipt can say where the extra
  // came from rather than presenting one unexplained number.
  outOfAreaKm: number
  outOfAreaFee: number
  pabiliBoughtIndexes: number[]
  cancelledBy: 'passenger' | 'driver' | null
  cancellationReason: RideCancellationReason | null
  // The driver's own words, when the preset reason needs them. Optional.
  cancellationNote: string | null
  cancelledAt: string | null
}

export type ServiceType = 'ride' | 'pabili' | 'buy_medicine'

// Why a driver called off a ride they had already accepted.
export type RideCancellationReason =
  | 'passenger_no_show'
  | 'passenger_cancelled_in_person'
  | 'vehicle_problem'
  | 'wrong_or_unreachable_pickup'
  | 'unsafe_situation'
  | 'other'

export const RIDE_CANCELLATION_REASON_LABELS: Record<RideCancellationReason, string> = {
  passenger_no_show: 'Passenger did not show up',
  passenger_cancelled_in_person: 'Passenger cancelled in person',
  vehicle_problem: 'Tricycle problem / breakdown',
  wrong_or_unreachable_pickup: 'Pickup point wrong or unreachable',
  unsafe_situation: 'Unsafe situation',
  other: 'Other reason',
}

// How an errand's distance charge is worked out. See errandBaseFare.
export type PabiliFareMode = 'standard' | 'fixed'

export const PABILI_FARE_MODE_LABELS: Record<PabiliFareMode, string> = {
  standard: 'Standard fare — same as an ordinary ride',
  fixed: 'Fixed rate — one flat amount per errand',
}

// A driver's offer, waiting on the passenger. Carries the whole fare as it
// would stand, not just the extra, so the passenger approves a total rather
// than doing arithmetic at the kerb.
export interface PendingFareApproval {
  driverId: string
  driverName: string
  driverOriginGps: GeoCoords | null
  // How far outside the TODA's own area the driver is starting from, and
  // what that adds. Both zero for a driver already inside it.
  outOfAreaKm: number
  outOfAreaFee: number
  fareBefore: number
  fareAfter: number
  proposedAt: string
}

export type DriverReportReason =
  | 'unsafe_driving'
  | 'rude_behavior'
  | 'overcharging'
  | 'vehicle_condition'
  | 'other'

export type DriverReportStatus = 'open' | 'reviewed'

// A non-emergency complaint about a driver, distinct from the real-time SOS
// alert system — filed after the fact (or mid-ride) for the App Admin to
// review, not something that pages a guardian.
export interface DriverReport {
  id: string
  rideId: string
  passengerId: string
  passengerName: string
  driverId: string
  driverName: string
  reason: DriverReportReason
  details: string
  createdAt: string
  status: DriverReportStatus
}

export type ExpenseCategory =
  | 'driver_incentives'
  | 'fuel_subsidy'
  | 'maintenance'
  | 'marketing'
  | 'sms_api_fees'
  | 'office_admin'
  | 'salaries'
  | 'permits_fees'
  | 'other'

// A manually-logged business cost — separate from Payment (which tracks
// money already moving through completed rides). Expenses are money going
// out that never touched a ride: fuel subsidies, marketing spend, the
// Semaphore/Google Maps bills, permits, etc. Recorded, never auto-derived.
export interface ExpenseRecord {
  id: string
  category: ExpenseCategory
  amount: number
  description: string
  recordedAt: string
  recordedBy: string
}

// A shareholder's paid-in capital — equity money the business raised from
// its owners, not revenue it earned from operating. Kept as its own record
// (never folded into Payment/ExpenseRecord totals) since mixing capital
// into an income statement misstates both: capital belongs on the balance
// sheet, income/expenses on the P&L. The Accounting panel shows it
// alongside income for visibility, but always as a clearly separate figure.
export interface CapitalContribution {
  id: string
  stockholderName: string
  shares: number
  amount: number
  contributedAt: string
  recordedBy: string
}

// The specific position an officer holds — matched against these plus a
// free-text label when position is 'other' (e.g. "Auditor", "Board Member").
export type AccountingOfficerPosition = 'President' | 'Treasurer' | 'Other'

// The allowlist gating the Accounting & Compliance ("Super Admin") page —
// managed by the App Admin from the main Admin dashboard, never from inside
// the restricted page itself (that would be a chicken-and-egg lockout: the
// first officer has to be added by someone who doesn't need this list to get
// in). Email is the lookup key at the lock screen — only a registered
// officer's email unlocks the page, replacing the old "type any name" flow.
export interface AccountingOfficer {
  id: string
  name: string
  email: string
  position: AccountingOfficerPosition
  // Only meaningful when position === 'Other' — the custom title shown
  // instead of the generic word "Other" (e.g. "Auditor").
  otherPositionLabel: string | null
  addedAt: string
}

// Money a TODA collects that isn't a member's dues charge — an officer's
// own contribution, a sponsor/donor gift, a fiesta pot, etc. Same
// equity/goodwill-money-vs-revenue distinction as CapitalContribution above,
// but scoped to a single TODA org's own treasury rather than the platform.
export interface TodaContribution {
  id: string
  todaOrgId: string
  contributorName: string
  purpose: string
  amount: number
  contributedAt: string
  recordedBy: string
}

export type TodaExpenseCategory =
  | 'fuel_subsidy'
  | 'terminal_maintenance'
  | 'event'
  | 'officer_honorarium'
  | 'office_admin'
  | 'other'

// A TODA-level business cost, scoped to a single org's own books — same
// shape/intent as the platform-wide ExpenseRecord above, kept separate so a
// TODA's spending never mixes into the platform's own income statement.
export interface TodaExpenseRecord {
  id: string
  todaOrgId: string
  category: TodaExpenseCategory
  amount: number
  description: string
  recordedAt: string
  recordedBy: string
}

// A slice of the cap table — deliberately a plain, editable percentage
// record rather than issued/legal shares (see AccountingOfficerManager-style
// caveat: this is internal management data, not a substitute for actual
// corporate/legal share issuance). "category" groups holders the way a
// proposed corporate structure typically would (Founder, Investors, etc.);
// "Other" + otherCategoryLabel covers anything that doesn't fit those pools
// (e.g. a reserved/unallocated slice, or a one-off partner).
export type EquityHolderCategory =
  | 'Founder'
  | 'Investors'
  | 'Developers & Key Personnel'
  | 'Strategic / Community Pool'
  | 'Future Investor / Employee Pool'
  | 'Other'

export interface EquityAllocation {
  id: string
  holderName: string
  category: EquityHolderCategory
  otherCategoryLabel: string | null
  percentage: number
  notes: string | null
  addedAt: string
}

export type InvestorStatus = 'proposed' | 'active' | 'exited'
export type ShareClass = 'common' | 'preferred' | 'other'

// A tracked investment round, not an automatic cap-table entry — per the
// "don't automatically issue equity" principle, sharePercentage here is
// informational until someone deliberately mirrors it into EquityAllocation
// (see AdminAccounting's "Add to cap table" action). preMoneyValuation and
// postMoneyValuation are both optional/independent since real deals don't
// always follow investmentAmount = postMoney - preMoney exactly (option
// pools, SAFEs, etc.) — the UI offers to compute one from the others but
// never forces it.
export interface Investor {
  id: string
  investorName: string
  investmentDate: string
  investmentAmount: number
  investmentRound: string
  preMoneyValuation: number | null
  postMoneyValuation: number | null
  sharePercentage: number
  shareClass: ShareClass
  agreementReference: string | null
  status: InvestorStatus
  notes: string | null
  addedAt: string
}

export type FounderContributionKind = 'cash' | 'non_cash'
export type FounderContributionStatus = 'pending' | 'approved' | 'rejected'

// Tracks what backs the Founder's cap-table percentage — per the master
// structure doc, the Founder allocation is contribution-based (concept,
// software, IP, leadership), not automatically a cash requirement, so
// cash and non-cash contributions are tracked side by side rather than
// assumed equal to the equity percentage.
export interface FounderContribution {
  id: string
  founderName: string
  date: string
  contributionType: string
  description: string
  kind: FounderContributionKind
  estimatedValue: number
  supportingDocDataUrl: string | null
  status: FounderContributionStatus
  approvedValue: number | null
  approvedBy: string | null
  approvalDate: string | null
  addedAt: string
}

export type RotaryProjectCategory =
  | 'Community Partner Project'
  | 'NGO-Supported Project'
  | 'Grant-Funded Project'
  | 'Passenger Safety'
  | 'Student Safety'
  | 'Road Safety'
  | 'Health'
  | 'Education'
  | 'Water'
  | 'Other Community Project'

export type RotaryProjectStatus = 'proposed' | 'approved' | 'in_progress' | 'completed' | 'cancelled'

// A community project funded (wholly or partly) from the Social Impact
// Fund below — amountSpent is deliberately NOT stored here; it's derived
// from SocialImpactTransaction records linked by projectId (see
// lib/socialImpact.ts), so there's one source of truth for money movement
// instead of a project total that can drift from its own transaction log.
// "partner" is the beneficiary organization's name — a free-text field on
// purpose, since the actual Community Partner/NGO differs per city and is
// never hard-coded here.
export interface RotaryProject {
  id: string
  projectName: string
  partner: string
  description: string
  category: RotaryProjectCategory
  // Not automatically classified as grant-funded — category is a deliberate
  // choice, never assumed (see master structure doc's caution on this).
  approvedBudget: number
  socialImpactFundAllocation: number
  additionalFunding: number
  status: RotaryProjectStatus
  startDate: string | null
  endDate: string | null
  addedAt: string
}

export type SocialImpactTransactionCategory =
  | 'fund_allocation'
  | 'project_commitment'
  | 'project_expense'
  | 'transfer'
  | 'adjustment'

export type SocialImpactTransactionStatus =
  | 'proposed'
  | 'approved'
  | 'allocated'
  | 'disbursed'
  | 'completed'
  | 'cancelled'

// A single movement in the Social Impact Fund ledger — NOT a dividend to a
// Community Partner/NGO or TODA Partner (those beneficiary organizations
// hold 0% equity, see RotaryProject.partner/RccIncentive.partner). "amount"
// is always entered as a positive
// magnitude; category alone determines inflow vs. outflow when computing
// the running balance (see lib/socialImpact.ts), so it always reads as
// "how much moved," not a sign a data-entry mistake could quietly flip.
export interface SocialImpactTransaction {
  id: string
  date: string
  description: string
  amount: number
  projectId: string | null
  category: SocialImpactTransactionCategory
  status: SocialImpactTransactionStatus
  approvedBy: string | null
  supportingDocDataUrl: string | null
  addedAt: string
}

export type DistributionType =
  | 'Investor Distribution'
  | 'Shareholder Dividend'
  | 'Founder Distribution'
  | 'Reinvestment'
  | 'Social Impact Allocation'
  | 'TODA Partner Incentive'
  | 'Other Approved Distribution'

export type DistributionStatus = 'proposed' | 'approved' | 'paid' | 'cancelled'

// A payout FROM the business to a recipient — distinct from the inbound
// records elsewhere (Investor rounds, CapitalContribution). A Community
// Partner/NGO or TODA Partner must never receive a Shareholder Dividend or
// Investor Distribution here (they hold 0% equity, see
// RotaryProject.partner/RccIncentive.partner) — the UI warns rather than
// hard-blocks, checking against the actual registered partner names rather
// than any hard-coded org name.
export interface Distribution {
  id: string
  recipient: string
  distributionType: DistributionType
  amount: number
  date: string
  source: string
  reference: string | null
  status: DistributionStatus
  approvedBy: string | null
  addedAt: string
}

export type RccIncentiveBasis =
  | 'Per qualified driver recruited'
  | 'Per active driver'
  | 'Passenger acquisition'
  | 'Local revenue incentive'
  | 'Approved community campaign'
  | 'Approved social-impact program'

export type RccIncentiveStatus = 'proposed' | 'approved' | 'paid' | 'cancelled'

// A TODA Partner is a community marketing/promotion partner (driver
// recruitment, barangay outreach, safety campaigns) — 0% corporate equity,
// same as a Community Partner/NGO. Incentives are earned per a specific
// configured basis, never paid automatically just because the partnership
// exists. "partner" is the organization's name — free text, since it
// differs per TODA/city and is never hard-coded here.
export interface RccIncentive {
  id: string
  partner: string
  basis: RccIncentiveBasis
  description: string
  amount: number
  date: string
  status: RccIncentiveStatus
  approvedBy: string | null
  addedAt: string
}

// The formal SEC Articles of Incorporation / GIS-level capitalization
// figures — distinct from EquityAllocation (the internal, percentage-only
// cap table) and CapitalContribution (a running ledger of cash paid in).
// This is a single record, not a list: it's "what's on file with SEC,"
// which only ever has one current version. All figures start blank/zero —
// never pre-filled with placeholder SEC data, since these must come from
// an actual filed registration, not a guess.
export interface CorporateRegistrationInfo {
  companyName: string
  secRegistrationNo: string
  registrationDate: string | null
  tin: string
  principalOfficeAddress: string
  primaryPurpose: string
  // null = perpetual (RA 11232 default), a number = a fixed term in years.
  corporateTermYears: number | null
  authorizedCapitalStock: number
  parValuePerShare: number
  numberOfSharesAuthorized: number
  subscribedCapitalStock: number
  paidUpCapitalStock: number
  treasurerInTrust: string | null
  updatedAt: string | null
}

export type StockholderType = 'Individual' | 'Corporation' | 'Other'

// One row of the SEC General Information Sheet's stockholders table —
// deliberately mirrors those exact fields (name, nationality, address,
// shares, amount subscribed, amount paid) rather than the looser shape
// CapitalContribution/EquityAllocation already use, so this page can be
// filled in directly from an actual filed GIS/AOI.
export interface Stockholder {
  id: string
  name: string
  nationality: string
  address: string
  stockholderType: StockholderType
  sharesSubscribed: number
  amountSubscribed: number
  amountPaid: number
  dateSubscribed: string | null
  certificateNo: string | null
  addedAt: string
}

// Admin-configurable LGU-style tariff: a flat base rate (student or
// standard) that covers the first `standardKmCovered` kilometers, then
// `perKmRate` for each additional km beyond that — see estimateFare in
// mock/data.ts for the actual calculation using real (haversine) distance
// between pickup/dropoff gps.
export interface TariffSettings {
  standardRate: number
  studentRate: number
  // PWD/Senior citizen discounted flat base rate — takes priority over the
  // student rate if a passenger somehow qualifies for both.
  pwdSeniorRate: number
  perKmRate: number
  standardKmCovered: number
  // Flat surcharge added per rider beyond the first when a group of 2+ books
  // together (see Ride.passengerCount) — admin-configurable. Used as a
  // fallback for group sizes without a computed group discount, i.e. 5+
  // riders, since ride-sharing bookings cap at 4 (see Ride.passengerCount).
  extraPassengerFee: number
  // Percentage knocked off standardRate×passengerCount for a standard
  // (non-student, non-PWD/Senior) ride-sharing booking of 2-4 — e.g. 10 means
  // a 2-passenger ride costs standardRate×2×0.9. Discounted-fare riders keep
  // using the flat extraPassengerFee surcharge instead.
  groupRideDiscountPct: number
  // How a 2-4 group fare is arrived at. 'percent' takes the discount above
  // off standardRate x passengerCount; 'flat' ignores it and charges the
  // figure the LGU or TODA actually published for that many riders.
  //
  // A percentage is a way of deriving a fare, and a derived fare can
  // disagree with the one on the tricycle. Where an operator has been
  // given the numbers, they should be able to type the numbers.
  groupRideFareMode: 'percent' | 'flat'
  // Total fare for the whole group at each size, used only in flat mode.
  // Zero means "not set", and falls back to the percentage rather than
  // charging nobody anything.
  groupRideFlatRate2: number
  groupRideFlatRate3: number
  groupRideFlatRate4: number
}

// Who made a logged change — an audit-trail concept, not a login role (see
// Role / AuthedAccountRole for that). The underlying account is always just
// 'admin' or 'toda_admin', but 'admin' splits into two logged personas that
// already exist as separate badges in the UI (see NavBar): "Admin" for
// ordinary /admin actions (driver/TODA approvals, tariff, etc.) vs. "Super
// Admin" for the extra-gated Accounting & Compliance page (cap table,
// distributions, SEC registration, ...), unlocked only by a registered
// finance officer. 'toda_admin' is a single TODA's own org-scoped admin.
export type ActivityLogActorRole = 'admin' | 'super_admin' | 'toda_admin'

// A single audit-trail row: who changed what, where, and when. Deliberately
// generic (a short action label + a human-readable summary) rather than a
// typed union per action, so logging a new kind of admin change is just
// another logActivity() call, not a type change here. todaOrgId scopes a
// toda_admin's entries to their own org (null for a global Super Admin
// change) so each TODA Admin's log view only shows their own org's history.
export interface ActivityLogEntry {
  id: string
  actorRole: ActivityLogActorRole
  actorName: string
  todaOrgId: string | null
  action: string
  summary: string
  at: string
}

// ============================================================
// Income & Promotion — admin-only module (marketing, ads, coins/
// rewards, referrals, ride credits). Passenger-facing surfaces only ever
// read a thin slice of this (their own coin balance, active promos,
// their referral code) — never revenue, advertiser pricing, budgets, or
// settings. See IncomePromotionPage.tsx / PassengerRewardsCard.tsx.
// ============================================================

export type AdvertiserStatus = 'active' | 'paused' | 'expired' | 'pending'
export type AdvertiserPlan = 'basic' | 'standard' | 'premium' | 'custom'

// A paying business partner running ads/promotions on the platform —
// distinct from a Campaign (which is the marketing activity itself; an
// Advertiser can sponsor zero or more Campaigns via Campaign.advertiserId).
export interface Advertiser {
  id: string
  businessName: string
  category: string
  province: string
  city: string
  barangay: string
  addressDetail: string
  contactName: string
  contactPhone: string
  contactEmail: string | null
  plan: AdvertiserPlan
  monthlyValue: number
  status: AdvertiserStatus
  joinedAt: string
  notes: string | null
}

export type CampaignType =
  | 'social_share'
  | 'referral'
  | 'ride_challenge'
  | 'safety'
  | 'rating'
  | 'merchant_promotion'
  | 'community_campaign'
  | 'driver_recruitment'
  | 'passenger_recruitment'

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'ended' | 'archived'
export type CampaignAudience = 'passengers' | 'drivers' | 'both' | 'public'

// A structured marketing campaign with an audience, budget, and spend
// limits — distinct from a PromoOffer (a simple coupon/offer code). Reach/
// clicks/shares/participants are manually recorded (this app has no real ad
// tracking — see updateCampaignMetrics), while referralsCount/
// completedRides/rewardsIssued/revenueGenerated are DERIVED live from
// Referral/CoinTransaction records carrying this campaign's id, so those
// four numbers can never drift from the actual underlying records (same
// "single source of truth" principle as the Social Impact Fund).
export interface Campaign {
  id: string
  name: string
  description: string
  type: CampaignType
  targetAudience: CampaignAudience
  startDate: string
  endDate: string | null
  rewardCoins: number
  rewardNote: string | null
  budget: number
  dailyLimit: number | null
  weeklyLimit: number | null
  monthlyLimit: number | null
  status: CampaignStatus
  advertiserId: string | null
  reach: number
  clicks: number
  shares: number
  participants: number
  createdAt: string
  updatedAt: string | null
}

export type PromoOfferKind =
  | 'promotional_offer'
  | 'merchant_offer'
  | 'ride_campaign'
  | 'passenger_campaign'
  | 'driver_campaign'
  | 'referral_campaign'
  | 'social_media_campaign'
  | 'safety_campaign'

export type PromoOfferStatus = 'draft' | 'active' | 'paused' | 'ended' | 'archived'
export type PromoDiscountType = 'percent_off' | 'flat_off' | 'free_ride_credit'

// A simple, redeemable offer/coupon — e.g. "10% off Pabili this week" —
// as opposed to a full Campaign (structured, budgeted, audience-targeted
// marketing activity). Usage is tracked as a plain counter (timesRedeemed);
// this is a prototype with no real coupon-code redemption flow wired up.
export interface PromoOffer {
  id: string
  title: string
  description: string
  kind: PromoOfferKind
  discountType: PromoDiscountType
  discountValue: number
  code: string | null
  startDate: string
  endDate: string | null
  usageLimit: number | null
  timesRedeemed: number
  status: PromoOfferStatus
  createdAt: string
}

// Configurable coin amounts for each way a passenger/driver can earn
// TODARIDE COINS — Rewards tab. Individual Campaigns can still set their
// own rewardCoins that overrides this base 'campaign' rate.
export interface RewardRules {
  registration: number
  verification: number
  ride: number
  rating: number
  review: number
  referral: number
  socialShare: number
  safety: number
  campaign: number
}

export type CoinDirection = 'issued' | 'redeemed' | 'adjusted' | 'expired'
export type CoinSource =
  | 'registration'
  | 'verification'
  | 'ride'
  | 'rating'
  | 'review'
  | 'referral'
  | 'social_share'
  | 'safety'
  | 'campaign'
  | 'admin_adjustment'
  | 'ride_credit_redemption'

// One row of the TODARIDE COINS ledger — every issuance, redemption, or
// manual correction. amount is always a positive coin count; `direction`
// says which way it moved. Outstanding balance for any actor is the sum of
// issued+adjusted (positive) minus redeemed+expired (see lib/rewards.ts).
export interface CoinTransaction {
  id: string
  actorType: 'passenger' | 'driver'
  actorId: string
  actorName: string
  direction: CoinDirection
  source: CoinSource
  amount: number
  campaignId: string | null
  note: string | null
  recordedBy: string
  at: string
}

// One coin→peso ride-credit conversion tier, e.g. "100 coins = ₱5" —
// admin-configurable list, not fixed math, per the brief's example tiers.
export interface RideCreditTier {
  id: string
  coins: number
  pesoValue: number
}

export type ReferralStatus = 'pending' | 'qualified' | 'rewarded' | 'rejected' | 'fraud_review'

export interface Referral {
  id: string
  code: string
  referrerId: string
  referrerName: string
  referrerType: 'passenger' | 'driver'
  referredName: string
  referredPassengerId: string | null
  registeredAt: string | null
  verifiedAt: string | null
  firstRideAt: string | null
  status: ReferralStatus
  coinsAwarded: number
  campaignId: string | null
  createdAt: string
}

// Income & Promotion's own settings — separate from TariffSettings (ride
// fares) and commissionPerRide (the real, already-wired platform fee).
// theoreticalCommissionRatePct is a what-if comparison rate only: the
// pilot's actual commission is whatever commissionPerRide × completed
// rides already yields (real ₱0 if commissionPerRide is 0) — this setting
// never changes real fares or payouts, it only drives the Revenue tab's
// "what commission WOULD be at X%" comparison.
export interface IncomePromotionSettings {
  theoreticalCommissionRatePct: number
  coinExpirationDays: number | null
  fraudReferralThreshold: number
  defaultCampaignDailyLimit: number | null
  defaultCampaignWeeklyLimit: number | null
  defaultCampaignMonthlyLimit: number | null
}

// A recorded partnership/sponsorship payment — distinct from Advertiser
// (a recurring paid account with campaigns) and from ride/commission
// revenue. Simple add/delete ledger, same shape as ExpenseRecord/
// TodaContribution elsewhere in this app.
export interface PartnershipRevenueEntry {
  id: string
  partnerName: string
  description: string
  amount: number
  recordedAt: string
  recordedBy: string
}

// Third-party ad-network revenue (Google AdSense) — separate from the
// internal Advertiser/Campaign marketplace (TodaRide's own directly-sold
// ads, shown via AdBanner). This is scaffolding only: `enabled` stays false
// and every slot ID stays null until Admin pastes in a REAL Publisher ID and
// per-placement slot IDs from an actual, approved AdSense account — see
// GoogleAdSlot.tsx, which renders nothing (or a dev-only placeholder) until
// then. Nothing here can serve real ads or earn real income by itself.
export interface AdSensePlacementSlots {
  landing: string | null
  passengerTop: string | null
  passengerBottom: string | null
  driverTop: string | null
  driverBottom: string | null
  parentBottom: string | null
}

// A house banner shown in the passenger app's ad box. `imageUrl` holds
// either a path under /public (the seeded banner) or a data: URL produced by
// Super Admin's uploader — both render through the same <img>, so a slot can
// be seeded from disk and later replaced from the phone with no code change.
export interface BannerAd {
  id: string
  imageUrl: string
  caption: string
}

// Fixed four slots: the box auto-arranges 1, 2, 3 or 4 filled ones, and a
// null slot is simply skipped. Keeping the length fixed means Super Admin
// always shows four labelled slots rather than a growing list.
export const BANNER_AD_SLOT_COUNT = 4

// Every kind of account an operator can act on. One union rather than a
// per-role suspension flag, because the actions (suspend, note) are identical
// whoever they are pointed at — only the directory differs.
export type AccountKind =
  | 'passenger'
  | 'parent'
  | 'driver'
  | 'toda'
  | 'pharmacy'
  | 'operator'
  | 'franchise'

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  passenger: 'Passenger',
  parent: 'Parent',
  driver: 'Driver',
  toda: 'TODA',
  pharmacy: 'Pharmacy / Vendor',
  operator: 'Operator',
  franchise: 'Franchise',
}

// A time-boxed suspension. `days: 0` means indefinite, and `endsAt: null`
// goes with it — the UI reads endsAt to decide whether a suspension has
// lapsed on its own, so an indefinite one simply never does.
export interface AccountSuspension {
  id: string
  kind: AccountKind
  accountId: string
  accountName: string
  reason: string
  days: number
  startedAt: string
  endsAt: string | null
  liftedAt: string | null
}

// A note from the App Admin to one account. Not a chat: there is no reply
// path, which is why it is called a note rather than a message.
export interface AdminNote {
  id: string
  kind: AccountKind
  accountId: string
  accountName: string
  message: string
  createdAt: string
  readAt: string | null
}

export type SupportCategory = 'account' | 'booking' | 'payment' | 'driver' | 'partner' | 'other'

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  account: 'My account',
  booking: 'A booking or trip',
  payment: 'Payment or fare',
  driver: 'A driver or passenger',
  partner: 'Partnering with us',
  other: 'Something else',
}

// A message from the Contact us form. Kept in app state as well as handed to
// the sender's mail client: this prototype has no server to post to, so the
// stored copy is what lets the support team actually see it in the console.
export interface SupportMessage {
  id: string
  name: string
  email: string
  phone: string
  category: SupportCategory
  message: string
  createdAt: string
  status: 'new' | 'handled'
  // The role the sender was signed in as, or null when a logged-out visitor
  // sent it from the landing page's menu.
  fromRole: string | null
}

export type AnnouncementCategory = 'promo' | 'update' | 'ad' | 'notice'
export type AnnouncementAudience = 'all' | 'passengers' | 'drivers' | 'parents' | 'partners'

export const ANNOUNCEMENT_CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  promo: '🎁 Promotion',
  update: '🚀 Update',
  ad: '📢 Advertisement',
  notice: 'ℹ️ Notice',
}

export const ANNOUNCEMENT_AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  all: 'Everyone',
  passengers: 'Passengers & students',
  drivers: 'Drivers',
  parents: 'Parents',
  partners: 'Partners (TODA, pharmacy, vendors)',
}

// Broadcast to a whole audience, unlike AdminNote which targets one account.
export interface Announcement {
  id: string
  title: string
  body: string
  category: AnnouncementCategory
  audience: AnnouncementAudience
  createdAt: string
  active: boolean
}

export interface AdSenseSettings {
  enabled: boolean
  publisherId: string | null
  slots: AdSensePlacementSlots
}

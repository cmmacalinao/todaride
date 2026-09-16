import { createContext, useContext, useEffect, useReducer, type ReactNode, useRef } from 'react'
import { BANNER_AD_SLOT_COUNT, MAX_VENDOR_POSTS } from '../types'
import { mergeById, mergeIncomingRides, mergeVendorPosts } from '../lib/rideMerge'
import { PILOT_ORIGIN } from '../lib/pilotOrigin'
import type { RecoveryKind } from '../lib/unifiedLogin'
import type { RidePhoto } from '../types'
import type { EmergencyContact, SafetySettings, SosEvent, SosEventKind, SosTriggerSource, SosTriggeredByRole } from '../types'
import type {
  PabiliFareMode,
  Landmark,
  MapBoundary,
  Terminal,
  RideCancellationReason,
  AccountingOfficer,
  AccountingOfficerPosition,
  AccountKind,
  AccountSuspension,
  AdminNote,
  Announcement,
  AnnouncementAudience,
  AnnouncementCategory,
  SupportCategory,
  SupportMessage,
  BannerAd,
  ActivityLogActorRole,
  ActivityLogEntry,
  AdSenseSettings,
  EmergencyHotline,
  Advertiser,
  AdvertiserPlan,
  AdvertiserStatus,
  BusinessType,
  Campaign,
  CampaignAudience,
  CampaignStatus,
  CampaignType,
  CapitalContribution,
  CoinDirection,
  CoinSource,
  CoinTransaction,
  CorporateRegistrationInfo,
  Coords,
  DocumentType,
  Driver,
  DriverAccessStatus,
  DriverDocuments,
  DriverInvite,
  DriverReport,
  DriverReportReason,
  Distribution,
  DistributionStatus,
  DistributionType,
  DuesRecord,
  DuesType,
  EquityAllocation,
  EquityHolderCategory,
  ExpenseCategory,
  ExpenseRecord,
  FounderContribution,
  FounderContributionKind,
  FounderContributionStatus,
  Franchise,
  GeoCoords,
  IncomePromotionSettings,
  Investor,
  InvestorStatus,
  MedicineCategory,
  MedicineProduct,
  MenuItemBadge,
  MembershipRequest,
  MembershipRequestType,
  MedsOrder,
  MedsOrderItem,
  MockLocation,
  Operator,
  OrderMessage,
  Parent,
  ParentLink,
  PartnershipRevenueEntry,
  Passenger,
  PaymentAccountDetails,
  PaymentMethod,
  Pharmacy,
  StoreReview,
  VendorPost,
  VendorPostComment,
  PromoDiscountType,
  PromoOffer,
  PromoOfferKind,
  PromoOfferStatus,
  DriverWithdrawal,
  PlatformFeePayment,
  QueueOfferLogEntry,
  QueueOfferOutcome,
  RccIncentive,
  RccIncentiveBasis,
  RccIncentiveStatus,
  Referral,
  ReferralStatus,
  RewardRules,
  Ride,
  RideCreditTier,
  RideStatus,
  RotaryProject,
  RotaryProjectCategory,
  RotaryProjectStatus,
  SaasPlan,
  SavedLocationLabel,
  ServiceType,
  ShareClass,
  SocialImpactTransaction,
  SocialImpactTransactionCategory,
  SocialImpactTransactionStatus,
  SosAlert,
  SosAlertType,
  Stockholder,
  StockholderType,
  TariffSettings,
  TodaContribution,
  TodaExpenseCategory,
  TodaExpenseRecord,
  TodaOfficer,
  TodaOrganization,
} from '../types'
import {
  DEFAULT_ADSENSE_SETTINGS,
  DEFAULT_CORPORATE_REGISTRATION,
  DEFAULT_INCOME_PROMOTION_SETTINGS,
  DEFAULT_MEDS_DELIVERY_FEE,
  DEFAULT_MEDS_SERVICE_FEE,
  DEFAULT_OUT_OF_AREA_PER_KM,
  DEFAULT_PABILI_FIXED_FARE,
  DEFAULT_TODA_RADIUS_KM,
  estimateOutOfAreaBreakdown,
  DEFAULT_PABILI_SERVICE_FEE,
  DEFAULT_REWARD_RULES,
  DEFAULT_RIDE_CREDIT_TIERS,
  DEFAULT_TARIFF_SETTINGS,
  DRIVER_BASE_COORDS,
  MINOR_AGE_LIMIT,
  MOCK_ACCOUNTING_OFFICERS,
  MOCK_EMERGENCY_HOTLINES,
  APP_SUPER_ADMIN_EMAIL,
  MOCK_ADVERTISERS,
  MOCK_CAMPAIGNS,
  MOCK_EQUITY_ALLOCATIONS,
  MOCK_DRIVERS,
  MOCK_FRANCHISES,
  MOCK_MEDICINE_PRODUCTS,
  MOCK_VENDOR_MENU_ITEMS,
  MOCK_OPERATORS,
  MOCK_PARENTS,
  MOCK_PARENT_LINKS,
  MOCK_PASSENGERS,
  MOCK_PHARMACIES,
  MOCK_BOUNDARIES,
  MOCK_TERMINALS,
  MOCK_LANDMARKS,
  MOCK_TODA_ORGANIZATIONS,
  SAAS_PLAN_FEES,
  estimateFare,
  resolveTariff,
  estimateSpecialPickupFee,
  getActiveTodaCommission,
  MOCK_BANNER_ADS,
  getFreeTodaDrivers,
  PLATFORM_GCASH_ACCOUNT,
  nearestTerminal,
  getPriorityTodaOrgId,
  getTerminalGps,
  getTodaQueue,
  orderByDispatchDistance,
  DOCUMENT_TYPES,
} from '../mock/data'
import { TERMINAL_PROXIMITY_METERS, haversineDistanceMeters } from '../lib/geo'
import { SAFETY_DEFAULTS, appendEvent, buildIncident, isActiveAlert, markNotificationDelivery, transitionAlert, withSafetyDefaults } from '../lib/safety'
import { getPersistence } from '../lib/persistence'
import { sendSosSms } from '../lib/sosSmsApi'

// The distance part of an errand's fare. Shared by the booking preview and
// the ride the reducer creates, so the number the customer agreed to is the
// number that gets charged.
export function errandBaseFare(oneWayFare: number, mode: PabiliFareMode, fixedFare: number): number {
  return mode === 'fixed' ? fixedFare : oneWayFare
}

const STORAGE_KEY = 'tricycle-mock-rides-v21'
const DEFAULT_COMMISSION_PER_RIDE = 1
// How many days an unpaid dues record can go overdue before Admin's driver
// directory flags it as pause-eligible. Admin-adjustable via
// SET_DUES_GRACE_PERIOD_DAYS; this is only the starting default.
const DEFAULT_DUES_GRACE_PERIOD_DAYS = 7
// How many days back a passenger/driver's "Trip history" list shows —
// older rides stay in state (earnings totals, admin reports, ratings all
// still see them) but drop out of that list. Admin-adjustable via
// SET_TRIP_HISTORY_RETENTION_DAYS; this is only the starting default.
const DEFAULT_TRIP_HISTORY_RETENTION_DAYS = 3
// Compressed from the real 2-minute TODA-priority window to match the rest
// of this app's sped-up simulation (rides already complete in ~12s/leg).
// Admin-adjustable at runtime via SET_TODA_QUEUE_WINDOW; this is only the
// default used until Admin changes it.
const DEFAULT_TODA_QUEUE_WINDOW_MS = 60000
// A special pickup (driver detours from the terminal to the passenger's
// exact spot) is a harder ask than a normal terminal pickup, so it gets its
// own — deliberately longer, literal 5-minute — escalation window instead of
// the general todaQueueWindowMs, before opening to any active driver
// (any TODA + freelance; see getDispatchWindow/isRideVisibleToDriver in
// lib/tracking.ts). Admin-adjustable via SET_SPECIAL_PICKUP_ESCALATION_MS.
const DEFAULT_SPECIAL_PICKUP_ESCALATION_MS = 300000
// % of net distributable profit set aside for the Social Impact Fund each
// period — admin-adjustable via SET_SOCIAL_IMPACT_FUND_PCT.
const DEFAULT_SOCIAL_IMPACT_FUND_PCT = 5
// How long the one driver holding the offer gets to answer before it
// automatically passes to the next candidate. Admin-adjustable via
// SET_QUEUE_OFFER_TIMEOUT — this is only the starting default. The other
// window, todaQueueWindowMs, is the overall ceiling before the ride stops
// being the TODA's and opens to everyone.
const DEFAULT_QUEUE_OFFER_TIMEOUT_MS = 6000

const TICK_INTERVAL_MS = 800
// Twelve seconds is right for testing a flow — you are not watching, you are
// checking that the next screen appears — but far too fast to show anyone: by
// the time a person looks up from one phone the tricycle has arrived.
// tripLegSeconds scales it so a demo can run at a watchable pace.
const LEG_DURATION_MS = 12000
const DEFAULT_TRIP_LEG_SECONDS = 12
const MAX_LOG_ENTRIES = 200
// Caps the admin/toda-admin change-history list — old enough entries just
// age out rather than growing localStorage unbounded.
const MAX_ACTIVITY_LOG_ENTRIES = 300
const DEVIATION_CHANCE_PER_TICK = 0.015
const DEVIATION_OFFSET_MIN = 10
const DEVIATION_OFFSET_MAX = 18
const MAX_PHOTOS_PER_RIDE = 6
// Small random walk applied to the passenger's simulated phone GPS while
// they're waiting to be picked up, so the marker feels "live" rather than
// pinned dead-center on the pickup point.
const PASSENGER_JITTER_STEP = 1.5

interface RideState {
  rides: Ride[]
  drivers: Driver[]
  passengers: Passenger[]
  parents: Parent[]
  parentLinks: ParentLink[]
  alerts: SosAlert[]
  commissionPerRide: number
  todaQueueWindowMs: number
  queueOfferTimeoutMs: number
  specialPickupEscalationMs: number
  todaOrganizations: TodaOrganization[]
  terminals: Terminal[]
  landmarks: Landmark[]
  // A tombstone for landmarks, same idea as removedPharmacyIds: a seed
  // landmark deleted from the admin screen is absent from `landmarks`, but
  // absence alone is indistinguishable from "not yet backfilled" to
  // withHealedLandmarks — without this list, a deliberate delete looks
  // identical to a late-added seed and gets re-healed back in on reload.
  deletedLandmarkIds: string[]
  boundaries: MapBoundary[]
  clsuFleetQueued: boolean
  duesRecords: DuesRecord[]
  membershipRequests: MembershipRequest[]
  duesGracePeriodDays: number
  tripHistoryRetentionDays: number
  tariffSettings: TariffSettings
  // Per-city and per-TODA taripa, keyed by city name and org id. Empty
  // means "everyone uses tariffSettings", which is where every install
  // starts. See resolveTariff.
  cityTariffs: Record<string, TariffSettings>
  todaTariffs: Record<string, TariffSettings>
  driverReports: DriverReport[]
  pabiliServiceFee: number
  // Which driver each passenger has picked off the nearby list for their
  // next booking, keyed by passenger id. Shared rather than local to the
  // booking form because the choice has to be visible outside that one
  // screen — the split-screen simulator brings the chosen driver up on the
  // other phone the moment it is made.
  // Whether a ride booked by scanning the QR inside a tricycle is exempt
  // from the platform fee. On by default — that exemption is the reason a
  // passenger at the terminal bothers to scan — but it is the platform's own
  // revenue, so the App Admin can switch it off.
  terminalQrFeeWaived: boolean
  tripLegSeconds: number
  // The artwork at the top of the Sakay sa Pila page. Uploaded by the App
  // Admin so the poster can be reprinted for a season, a fare change or a
  // different TODA without anyone touching the code. Null shows the built-in
  // one.
  pilaBannerDataUrl: string | null
  requestedDrivers: Record<string, string | null>
  platformFeePayments: PlatformFeePayment[]
  driverWithdrawals: DriverWithdrawal[]
  platformGcashAccount: PaymentAccountDetails
  pabiliFareMode: PabiliFareMode
  pabiliFixedFare: number
  todaRadiusKm: number
  outOfAreaPerKm: number
  expenses: ExpenseRecord[]
  // Keyed by ComplianceChecklistItem.id (see mock/data.ts) — true once
  // Admin has marked that item done. Missing keys default to not-done.
  complianceChecked: Record<string, boolean>
  // Same "approve as noted, with a resubmission deadline" pattern as
  // Driver.pendingNote/pendingNoteDeadline — lets the finance officer note
  // what's still missing for a not-yet-done checklist item and give a real
  // deadline to submit it. Missing keys mean no note/deadline set.
  complianceReview: Record<string, { note: string | null; deadlineAt: string | null }>
  capitalContributions: CapitalContribution[]
  todaContributions: TodaContribution[]
  todaExpenses: TodaExpenseRecord[]
  driverInvites: DriverInvite[]
  // The allowlist gating the Accounting & Compliance ("Super Admin") page —
  // see AccountingOfficer in types. Managed from the main Admin dashboard.
  accountingOfficers: AccountingOfficer[]
  // The cap table — see EquityAllocation in types. Lives inside the
  // restricted Accounting & Compliance page, same access gate as the rest
  // of the books.
  equityAllocations: EquityAllocation[]
  // Investment rounds — see Investor in types. Tracked separately from
  // equityAllocations; a round is only mirrored into the cap table when
  // explicitly done from the UI (see "Add to cap table" action).
  investors: Investor[]
  // What backs the Founder's cap-table percentage — see FounderContribution
  // in types.
  founderContributions: FounderContribution[]
  // % of net distributable profit set aside each period — see
  // lib/socialImpact.ts for how it turns into an actual fund_allocation
  // transaction (never automatic; an officer records each period's amount).
  socialImpactFundPct: number
  socialImpactTransactions: SocialImpactTransaction[]
  rotaryProjects: RotaryProject[]
  distributions: Distribution[]
  rccIncentives: RccIncentive[]
  // The formal SEC Articles of Incorporation / GIS-level record — see
  // CorporateRegistrationInfo in types. A single record, not a list.
  corporateRegistration: CorporateRegistrationInfo
  stockholders: Stockholder[]
  // Change-history for the App Admin ("Super Admin") and each TODA's own
  // Admin — see logActivity/ActivityLogEntry. Newest first, capped at
  // MAX_ACTIVITY_LOG_ENTRIES.
  activityLog: ActivityLogEntry[]
  // Income & Promotion module — see types/index.ts's "Income & Promotion"
  // section for the full data-model rationale.
  advertisers: Advertiser[]
  campaigns: Campaign[]
  promoOffers: PromoOffer[]
  rewardRules: RewardRules
  coinTransactions: CoinTransaction[]
  rideCreditTiers: RideCreditTier[]
  referrals: Referral[]
  incomePromotionSettings: IncomePromotionSettings
  partnershipRevenue: PartnershipRevenueEntry[]
  adSenseSettings: AdSenseSettings
  // TODARIDE MEDS — see types/index.ts's Pharmacy/MedicineProduct/MedsOrder
  // comments. medsOrders only cover the pre-dispatch part (browsing, cart,
  // pharmacy confirmation, prescription review); once a pharmacy confirms,
  // a real Ride is created and MedsOrder.linkedRideId points at it.
  pharmacies: Pharmacy[]
  // A tombstone: pharmacy ids that were explicitly purged as junk/duplicate
  // accounts. mergeVendorPosts unions accounts by id so a sign-up in flight
  // during a race is never lost — but that same rule means a device whose
  // local storage still remembers a deleted id (stale test data, an old
  // duplicate) resurrects it on its next save. Listing it here stops the
  // resurrection permanently instead of relying on a cleanup that the next
  // stale device just undoes.
  removedPharmacyIds: string[]
  medicineProducts: MedicineProduct[]
  medsOrders: MedsOrder[]
  // TaaS Level 2/3 — see the TODASafeRide-as-a-Service business roadmap.
  // Level 1 (SaaS Partner) lives directly on TodaOrganization's own fields.
  operators: Operator[]
  franchises: Franchise[]
  // Admin-controlled visibility toggles — when false, the feature's booking
  // entry points and nav items are hidden app-wide, but its code, data, and
  // (for meds) existing Pharmacy accounts stay fully intact underneath.
  accountSuspensions: AccountSuspension[]
  adminNotes: AdminNote[]
  announcements: Announcement[]
  supportMessages: SupportMessage[]
  bannerAds: (BannerAd | null)[]
  pabiliEnabled: boolean
  // Rewards, promos and the passenger wallet — a Super Admin switch, off
  // by default: the Rewards tab, drawer item and page stay hidden until on.
  rewardsEnabled: boolean
  medsEnabled: boolean
  // Food/Resto and other-commodity partner vendors — deliberately separate
  // from medsEnabled so an operator can run Pabili-style vendor delivery
  // without opening the pharmacy/prescription side at all.
  vendorsEnabled: boolean
  // The Rotary Club partnership card on the sign-in screen — see
  // LandingPage.tsx. Off by default: the asset (public/partner-banner-
  // rotary.png, the card cropped free of the old TODA SafeRide logo it used
  // to carry) stays reserved rather than deleted, so Super Admin can switch
  // it back on without anyone re-uploading anything.
  partnerBannerEnabled: boolean
  // Prototype shortcut: show the one-time code on screen instead of texting
  // it. Off means OTP screens must get a real code from the SMS server
  // (see server/index.js) and surface an error if it isn't reachable,
  // rather than silently falling back to an on-screen code.
  simulatedOtpEnabled: boolean
  // Public address the shareable links/QRs are built from (see
  // SuperAdminPage's Access links tab). Must be set explicitly because
  // window.location.origin is useless for sharing in the two cases that
  // matter: a dev server ("http://localhost:5192", only reachable on this
  // machine) and a Capacitor native build ("https://localhost" on Android,
  // "capacitor://localhost" on iOS). Empty means "fall back to the current
  // origin", which is right only when genuinely served from a public host.
  publicBaseUrl: string
  // The one TODA a pilot is being run with — printed on the welcome screen
  // (see LandingPage) so the app reads as that TODA's own booking app rather
  // than a generic multi-operator platform. Empty means "no pilot branding",
  // which is right for the general/multi-TODA deployment. A name typed here
  // rather than an id from MOCK_TODA_ORGANIZATIONS: this only ever changes
  // what the welcome screen prints, not which org anything is scoped to.
  pilotTodaName: string
  // Drives the fake tricycle movement (see TICK_POSITIONS): the marker
  // glides along the leg on a timer regardless of where anyone actually is.
  // Off means nothing moves on its own — the map only shows the driver's
  // real GPS, which is what an on-the-road test run needs. Deliberately
  // does NOT disable the terminal-queue offer timeout, which is real
  // dispatch logic rather than simulation.
  simulateMovementEnabled: boolean
  // Every phone follows its own movement and draws it on its own map,
  // trip or no trip. Nothing about it is written anywhere: it is a way to
  // see whether GPS is accurate enough on the handsets a pilot actually
  // uses, not a way to keep a record of where anyone went.
  liveGpsEnabled: boolean
  // Pilot testing only. Lets a driver sign up without uploading anything
  // and approves them on the spot, because during a pilot the person
  // registering is standing in front of you and there is nobody staffing an
  // approvals queue. Off is the real behaviour: documents required, Admin
  // reviews, driver waits.
  openDriverSignup: boolean
  // How long a driver who signed up without documents has to produce them.
  // A deferral, not a waiver: the deadline is stamped on the driver at
  // registration so it survives this setting being changed afterwards —
  // shortening the window should not retroactively put drivers in breach of
  // a date they were never told.
  documentGraceDays: number
  // Real dialable numbers (see EmergencyHotline) — not simulated.
  emergencyHotlines: EmergencyHotline[]
  // Super Admin's dials for the Safety & Emergency Alert System — see
  // lib/safety.ts for what each one does.
  safetySettings: SafetySettings
}

type RideAction =
  | {
      type: 'REQUEST_RIDE'
      passengerId: string
      passengerName: string
      passengerPhone: string | null
      pickup: MockLocation
      dropoff: MockLocation
      paymentMethod: PaymentMethod
      isStudentRide: boolean
      isPwdSeniorRide: boolean
      pickupGps: GeoCoords | null
      passengerCount: number
      serviceType: ServiceType
      pabiliItems: string | null
      packageNote: string | null
      tip: number
      bookedByParentId: string | null
      specialPickupRequested: boolean
      specialTrip: boolean
      // A driver the passenger picked off the nearby list for this one
      // booking. Outranks the saved favourite and the terminal Pila for the
      // first offer — but only the first: if they do not take it, the ride
      // falls back to normal dispatch rather than waiting on someone who has
      // already passed.
      requestedDriverId: string | null
      bookedAtTerminal: boolean
      destinationPending: boolean
      // Set when the passenger is already aboard and already moving — the
      // app watched their GPS leave with this tricycle's. The ride is
      // created underway rather than requested, because there is nothing
      // left to dispatch.
      boardedWithDriverId: string | null
      // Set instead of boardedWithDriverId for a tricycle with no account.
      unregisteredPlate: string | null
      // Photographs taken before this ride existed — the plate, the
      // driver, the inside of the tricycle. They are the same evidence
      // whether the shutter went before or after the trip was recorded,
      // so they are carried in rather than lost with the panel's state.
      initialPhotos: RidePhoto[]
      prescriptionDataUrls: string[]
      seniorIdDataUrl: string | null
      otherDocDataUrl: string | null
      paymentProofDataUrl: string | null
    }
  // One booking, several riders, each going to their own destination — as
  // opposed to an ordinary shared ride, where a second passenger is found
  // opportunistically along the route after the first is already underway.
  // Every ride this creates shares one groupBookingId and targets the same
  // driver, so the group boards together.
  | {
      type: 'REQUEST_GROUP_RIDE'
      bookedByPassengerId: string
      pickup: MockLocation
      pickupGps: GeoCoords | null
      paymentMethod: PaymentMethod
      requestedDriverId: string | null
      // 'separate': each rider's own fare, for their own leg, same as an
      // ordinary shared ride. 'booker': the whole group's fare is folded
      // into the booker's own ride; every other rider's ride carries a
      // fareEstimate of 0.
      paySplit: 'separate' | 'booker'
      riders: {
        passengerId: string
        passengerName: string
        passengerPhone: string | null
        dropoff: MockLocation
        isStudentRide: boolean
        isPwdSeniorRide: boolean
      }[]
    }
  | { type: 'REPORT_DRIVER_GPS'; driverId: string; gps: GeoCoords }
  | { type: 'ACCEPT_RIDE'; rideId: string; driverId: string }
  | { type: 'DECLINE_RIDE'; rideId: string; driverId: string }
  | {
      type: 'START_RIDE'
      rideId: string
      // Where the driver actually is as they start. The pickup moves to it —
      // see the reducer.
      driverGps?: GeoCoords | null
    }
  | { type: 'PASSENGER_CONFIRM_ARRIVAL'; rideId: string; actualDropoff?: Ride['actualDropoff'] }
  | { type: 'CLEAR_ALL_RIDES' }
  | { type: 'COMPLETE_RIDE'; rideId: string; paidMethod?: PaymentMethod }
  | { type: 'CANCEL_RIDE'; rideId: string }
  | { type: 'SET_PABILI_ITEM_BOUGHT'; rideId: string; index: number; bought: boolean }
  | {
      type: 'DRIVER_CANCEL_RIDE'
      rideId: string
      reason: RideCancellationReason
      note: string | null
    }
  | { type: 'ADD_TIP_OFFER'; rideId: string; amount: number }
  | { type: 'ACKNOWLEDGE_RIDE_PAYMENT'; rideId: string; method: PaymentMethod; referenceNo?: string | null }
  | { type: 'TICK_POSITIONS' }
  | { type: 'UPDATE_DRIVER_LIVE_GPS'; rideId: string; gps: GeoCoords | null }
  | { type: 'UPDATE_PASSENGER_LIVE_GPS'; rideId: string; gps: GeoCoords | null }
  | { type: 'TRIGGER_SOS'; rideId: string; triggeredBy: string; source?: SosTriggerSource; location?: GeoCoords | null }
  | { type: 'TRIGGER_DRIVER_SOS'; driverId: string; location: GeoCoords | null; notes: string | null; source?: SosTriggerSource }
  // A passenger's SOS before any trip exists — standing at a terminal,
  // climbing into a tricycle, deciding not to. The ride-bound TRIGGER_SOS
  // cannot serve that moment, and it is not a safe moment to be without a
  // panic button.
  | { type: 'TRIGGER_PASSENGER_SOS'; passengerId: string; location: GeoCoords | null; notes: string | null }
  | { type: 'RESOLVE_ALERT'; alertId: string; actorName?: string; actorRole?: SosEvent['actorRole']; notes?: string | null }
  | { type: 'ACKNOWLEDGE_ALERT'; alertId: string; actorName: string; actorRole: SosEvent['actorRole'] }
  | { type: 'SET_ALERT_RESPONDING'; alertId: string; actorName: string; actorRole: SosEvent['actorRole'] }
  | { type: 'CANCEL_ALERT'; alertId: string; actorName: string; actorRole: SosEvent['actorRole']; notes?: string | null }
  | { type: 'LOG_ALERT_EVENT'; alertId: string; kind: SosEventKind; summary: string; actorName: string; actorRole: SosEvent['actorRole'] }
  | { type: 'SET_SAFETY_SETTINGS'; patch: Partial<SafetySettings> }
  | { type: 'SET_PASSENGER_EMERGENCY_CONTACTS'; passengerId: string; contacts: EmergencyContact[] }
  | { type: 'LOG_POSSIBLE_CRASH'; actorId: string; role: SosTriggeredByRole; rideId: string | null; location: GeoCoords | null; outcome: 'ok' | 'timeout' }
  // Records the result of a person tapping "Send SMS" on one queued contact
  // notification. Dispatched by sendContactSms below, after lib/sosSmsApi.ts
  // has already made (or failed to make) the real call — never on its own.
  | { type: 'SET_NOTIFICATION_STATUS'; alertId: string; notificationId: string; status: 'delivered' | 'failed'; note?: string; actorName: string }
  | { type: 'APPROVE_DRIVER'; driverId: string }
  | { type: 'REJECT_DRIVER'; driverId: string; reason: string | null }
  | { type: 'APPEAL_DRIVER_REJECTION'; driverId: string; message: string }
  | { type: 'RESUBMIT_DRIVER_DOCUMENT'; driverId: string; docType: DocumentType; dataUrl: string }
  | { type: 'ADD_SAFETY_PHOTO'; rideId: string; dataUrl: string; takenBy: string }
  | { type: 'HYDRATE'; state: RideState }
  // A stray or duplicate store, purged for good — see HYDRATE's tombstone
  // handling for why this has to be an explicit id list rather than just
  // filtering the array here: a plain removal would only last until the
  // next sync pulled the same id back in from another device's copy.
  | { type: 'REMOVE_PHARMACY'; pharmacyId: string }
  | { type: 'SET_COMMISSION'; amount: number }
  | { type: 'RESET_ACCOUNT_PIN'; kind: RecoveryKind; id: string; pin: string }
  | { type: 'SUSPEND_ACCOUNT'; suspension: AccountSuspension }
  | { type: 'LIFT_SUSPENSION'; suspensionId: string }
  | { type: 'SEND_ADMIN_NOTE'; note: AdminNote }
  | { type: 'SEND_SUPPORT_MESSAGE'; message: SupportMessage }
  | { type: 'SET_SUPPORT_MESSAGE_STATUS'; id: string; status: 'new' | 'handled' }
  | { type: 'PUBLISH_ANNOUNCEMENT'; announcement: Announcement }
  | { type: 'SET_ANNOUNCEMENT_ACTIVE'; announcementId: string; active: boolean }
  | { type: 'REMOVE_ANNOUNCEMENT'; announcementId: string }
  | { type: 'SET_BANNER_AD_SLOT'; index: number; ad: BannerAd | null }
  | { type: 'SET_PABILI_ENABLED'; enabled: boolean }
  | { type: 'SET_REWARDS_ENABLED'; enabled: boolean }
  | { type: 'SET_MEDS_ENABLED'; enabled: boolean }
  | { type: 'SET_VENDORS_ENABLED'; enabled: boolean }
  | { type: 'SET_PARTNER_BANNER_ENABLED'; enabled: boolean }
  | { type: 'SET_SIMULATED_OTP_ENABLED'; enabled: boolean }
  | { type: 'SET_PUBLIC_BASE_URL'; url: string }
  | { type: 'SET_PILOT_TODA_NAME'; name: string }
  | { type: 'SET_SIMULATE_MOVEMENT_ENABLED'; enabled: boolean }
  | { type: 'SET_LIVE_GPS_ENABLED'; enabled: boolean }
  | { type: 'SET_OPEN_DRIVER_SIGNUP'; enabled: boolean }
  | { type: 'SET_DOCUMENT_GRACE_DAYS'; days: number }
  | { type: 'ADD_EMERGENCY_HOTLINE'; hotline: EmergencyHotline }
  | { type: 'UPDATE_EMERGENCY_HOTLINE'; id: string; updates: Partial<Omit<EmergencyHotline, 'id'>> }
  | { type: 'REMOVE_EMERGENCY_HOTLINE'; id: string }
  | { type: 'JOIN_TERMINAL_QUEUE'; driverId: string; driverGps: GeoCoords | null }
  | { type: 'LEAVE_TERMINAL_QUEUE'; driverId: string }
  | { type: 'SET_DRIVER_HOME_TERMINAL'; driverId: string; terminalId: string | null }
  | {
      type: 'SET_DRIVER_PAYMENT_ACCOUNT'
      driverId: string
      wallet: 'gcash' | 'maya'
      details: PaymentAccountDetails | null
    }
  | { type: 'SET_TERMINAL_QR_FEE_WAIVED'; waived: boolean }
  | { type: 'SET_TRIP_LEG_SECONDS'; seconds: number }
  | { type: 'SET_PILA_BANNER'; dataUrl: string | null }
  | { type: 'SET_RIDE_DESTINATION'; rideId: string; dropoff: MockLocation }
  | { type: 'SET_REQUESTED_DRIVER'; passengerId: string; driverId: string | null }
  | { type: 'RECORD_PLATFORM_FEE_PAYMENT'; payment: PlatformFeePayment }
  | { type: 'REQUEST_DRIVER_WITHDRAWAL'; withdrawal: DriverWithdrawal }
  | { type: 'SETTLE_DRIVER_WITHDRAWAL'; withdrawalId: string; status: 'paid' | 'rejected'; reference: string | null; note: string | null }
  | { type: 'SET_PLATFORM_GCASH_ACCOUNT'; account: PaymentAccountDetails }
  | { type: 'SET_TODA_QUEUE_WINDOW'; ms: number }
  | { type: 'SET_QUEUE_OFFER_TIMEOUT'; ms: number }
  | { type: 'SET_SPECIAL_PICKUP_ESCALATION_MS'; ms: number }
  | { type: 'SET_FAVORITE_DRIVER'; passengerId: string; driverId: string | null }
  | { type: 'SET_PARENT_FAVORITE_DRIVER'; parentId: string; driverId: string | null }
  | { type: 'PROPOSE_TODA_COMMISSION'; todaOrgId: string; amount: number | null }
  | { type: 'SET_TODA_COMMISSION_MEMBER_APPROVAL'; todaOrgId: string; approved: boolean }
  | { type: 'SET_TODA_COMMISSION_ADMIN_APPROVAL'; todaOrgId: string; approved: boolean }
  | {
      type: 'ADD_DUES_RECORD'
      todaOrgId: string
      driverIds: string[]
      duesType: DuesType
      label: string
      amount: number
      dueDate: string
    }
  | { type: 'MARK_DUES_PAID'; duesRecordId: string }
  | {
      type: 'REQUEST_MEMBERSHIP_ACTION'
      todaOrgId: string
      driverId: string
      requestType: MembershipRequestType
      reason: string
    }
  | { type: 'RESOLVE_MEMBERSHIP_REQUEST'; requestId: string; approve: boolean }
  | { type: 'SET_DRIVER_ACCESS'; driverId: string; accessStatus: DriverAccessStatus; accessNote: string | null }
  | { type: 'SET_DRIVER_PABILI_PRIORITY'; driverId: string; enabled: boolean }
  | { type: 'SET_DRIVER_ONLINE'; driverId: string; online: boolean }
  | {
      type: 'UPDATE_PASSENGER_PROFILE'
      passengerId: string
      name: string
      phone: string
      email: string | null
      pin: string | null
      paymentDetail: string | null
      password: string | null
      guardianPhone: string | null
    }
  | {
      type: 'UPDATE_DRIVER_PROFILE'
      driverId: string
      name: string
      phone: string
      email: string | null
      pin: string
      paymentDetail: string | null
      password: string | null
      emergencyContact: string | null
    }
  | {
      type: 'UPDATE_PARENT_PROFILE'
      parentId: string
      name: string
      phone: string
      email: string | null
      pin: string | null
      paymentDetail: string | null
      password: string | null
      emergencyContact: string | null
    }
  | {
      type: 'UPDATE_PHARMACY_PROFILE'
      pharmacyId: string
      name: string
      phone: string
      email: string | null
      pin: string
      paymentDetail: string | null
      password: string | null
      emergencyContact: string | null
    }
  | { type: 'SET_DUES_GRACE_PERIOD_DAYS'; days: number }
  | { type: 'SET_TRIP_HISTORY_RETENTION_DAYS'; days: number }
  | { type: 'SET_DRIVER_PENDING_NOTE'; driverId: string; note: string | null; deadline: string | null }
  | { type: 'SAVE_BOUNDARY'; boundary: MapBoundary }
  | { type: 'DELETE_BOUNDARY'; boundaryId: string }
  | { type: 'ADD_UNREGISTERED_TODA'; id: string; name: string; province: string; city: string; barangay: string }
  | {
      type: 'REGISTER_TODA_ORGANIZATION'
      id: string
      name: string
      officers: TodaOfficer[]
      province: string
      city: string
      barangay: string
      addressDetail: string
      terminalGps: GeoCoords | null
      adminPin: string
      contactPhone?: string | null
    }
  | { type: 'APPROVE_TODA_ORG'; todaOrgId: string }
  | { type: 'REJECT_TODA_ORG'; todaOrgId: string }
  | { type: 'SET_TODA_ORG_PENDING_NOTE'; todaOrgId: string; note: string | null; deadline: string | null }
  | { type: 'SET_TODA_SAAS_PLAN'; todaOrgId: string; plan: SaasPlan; perBookingFee: number }
  | { type: 'SET_TODA_OPERATOR'; todaOrgId: string; operatorId: string | null }
  | {
      type: 'REGISTER_OPERATOR'
      id: string
      name: string
      contactPerson: string
      contactPhone: string
      province: string
      city: string
      adminPin: string
    }
  | { type: 'APPROVE_OPERATOR'; operatorId: string }
  | { type: 'REJECT_OPERATOR'; operatorId: string }
  | {
      type: 'SET_OPERATOR_FEES'
      operatorId: string
      activationFee: number | null
      monthlyPlatformFee: number
      perBookingFee: number
    }
  | { type: 'SET_OPERATOR_FRANCHISE'; operatorId: string; franchiseId: string | null }
  | { type: 'SET_OPERATOR_LOGO'; operatorId: string; logoDataUrl: string | null }
  | { type: 'SET_OPERATOR_BANNER'; operatorId: string; bannerDataUrl: string | null }
  | {
      type: 'UPDATE_OPERATOR_PROFILE'
      operatorId: string
      contactPerson: string
      contactPhone: string
      email: string | null
      province: string
      city: string
      barangay: string
      addressDetail: string
      businessRegistrationNo: string | null
    }
  | {
      type: 'REGISTER_FRANCHISE'
      id: string
      name: string
      contactPerson: string
      contactPhone: string
      province: string
      city: string
      adminPin: string
    }
  | { type: 'APPROVE_FRANCHISE'; franchiseId: string }
  | { type: 'REJECT_FRANCHISE'; franchiseId: string }
  | {
      type: 'SET_FRANCHISE_FEES'
      franchiseId: string
      initialFranchiseFee: number | null
      monthlyTechnologyFee: number
      royaltyPct: number | null
    }
  | {
      type: 'UPDATE_FRANCHISE_PROFILE'
      franchiseId: string
      contactPerson: string
      contactPhone: string
      email: string | null
      province: string
      city: string
      barangay: string
      addressDetail: string
      businessRegistrationNo: string | null
    }
  | {
      type: 'ADD_TODA_CONTRIBUTION'
      id: string
      todaOrgId: string
      contributorName: string
      purpose: string
      amount: number
      recordedBy: string
    }
  | { type: 'DELETE_TODA_CONTRIBUTION'; contributionId: string }
  | {
      type: 'ADD_TODA_EXPENSE'
      id: string
      todaOrgId: string
      category: TodaExpenseCategory
      amount: number
      description: string
      recordedBy: string
    }
  | { type: 'DELETE_TODA_EXPENSE'; expenseId: string }
  | { type: 'SET_COMPLIANCE_NOTE'; itemId: string; note: string | null; deadlineAt: string | null }
  | { type: 'SET_TODA_TERMINAL_GPS'; todaOrgId: string; gps: GeoCoords }
  | {
      type: 'SET_TODA_TERMINAL_ADDRESS'
      todaOrgId: string
      province: string
      city: string
      barangay: string
      addressDetail: string
    }
  | { type: 'SET_TARIFF_SETTINGS'; settings: TariffSettings }
  | { type: 'SET_CITY_TARIFF'; city: string; settings: TariffSettings | null }
  | { type: 'SET_TODA_TARIFF'; todaOrgId: string; settings: TariffSettings | null }
  | { type: 'SAVE_PASSENGER_LOCATION'; passengerId: string; id: string; label: SavedLocationLabel; location: MockLocation }
  | { type: 'REMOVE_PASSENGER_LOCATION'; passengerId: string; savedLocationId: string }
  | {
      type: 'RATE_RIDE'
      rideId: string
      driverRating: number
      driverReviewText: string
      todaRating: number | null
      todaReviewText: string
    }
  | {
      type: 'REPORT_DRIVER'
      id: string
      rideId: string
      passengerId: string
      passengerName: string
      driverId: string
      driverName: string
      reason: DriverReportReason
      details: string
    }
  | { type: 'RESOLVE_DRIVER_REPORT'; reportId: string }
  | { type: 'SET_PABILI_SERVICE_FEE'; amount: number }
  | { type: 'SET_PABILI_FARE_MODE'; mode: PabiliFareMode }
  | { type: 'SET_PABILI_FIXED_FARE'; amount: number }
  | { type: 'ADD_TERMINAL'; terminal: Terminal }
  | { type: 'REMOVE_TERMINAL'; terminalId: string }
  | { type: 'SET_TERMINAL_GPS'; terminalId: string; gps: GeoCoords }
  | { type: 'SET_TERMINAL_ACTIVE'; terminalId: string; isActive: boolean }
  | { type: 'ADD_LANDMARK'; landmark: Landmark }
  | { type: 'REMOVE_LANDMARK'; landmarkId: string }
  | { type: 'SET_LANDMARK_GPS'; landmarkId: string; gps: GeoCoords }
  | { type: 'UPDATE_LANDMARK'; landmarkId: string; landmark: Omit<Landmark, 'id'> }
  | { type: 'SET_TODA_RADIUS_KM'; km: number }
  | { type: 'SET_OUT_OF_AREA_PER_KM'; amount: number }
  | { type: 'DRIVER_PROPOSE_ACCEPT'; rideId: string; driverId: string; originGps: GeoCoords | null }
  | { type: 'PASSENGER_APPROVE_FARE'; rideId: string }
  | { type: 'PASSENGER_DECLINE_FARE'; rideId: string }
  | {
      type: 'ADD_EXPENSE'
      id: string
      category: ExpenseCategory
      amount: number
      description: string
      recordedBy: string
    }
  | { type: 'DELETE_EXPENSE'; expenseId: string }
  | { type: 'TOGGLE_COMPLIANCE_ITEM'; itemId: string; done: boolean }
  | {
      type: 'ADD_CAPITAL_CONTRIBUTION'
      id: string
      stockholderName: string
      shares: number
      amount: number
      recordedBy: string
    }
  | { type: 'DELETE_CAPITAL_CONTRIBUTION'; contributionId: string }
  | {
      type: 'ADD_ACCOUNTING_OFFICER'
      id: string
      name: string
      email: string
      position: AccountingOfficerPosition
      otherPositionLabel: string | null
    }
  | { type: 'REMOVE_ACCOUNTING_OFFICER'; officerId: string }
  | {
      type: 'UPDATE_ACCOUNTING_OFFICER'
      officerId: string
      name: string
      email: string
      position: AccountingOfficerPosition
      otherPositionLabel: string | null
    }
  | {
      type: 'ADD_EQUITY_ALLOCATION'
      id: string
      holderName: string
      category: EquityHolderCategory
      otherCategoryLabel: string | null
      percentage: number
      notes: string | null
    }
  | {
      type: 'UPDATE_EQUITY_ALLOCATION'
      allocationId: string
      holderName: string
      category: EquityHolderCategory
      otherCategoryLabel: string | null
      percentage: number
      notes: string | null
    }
  | { type: 'REMOVE_EQUITY_ALLOCATION'; allocationId: string }
  | {
      type: 'ADD_INVESTOR'
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
    }
  | {
      type: 'UPDATE_INVESTOR'
      investorId: string
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
    }
  | { type: 'REMOVE_INVESTOR'; investorId: string }
  | {
      type: 'ADD_FOUNDER_CONTRIBUTION'
      id: string
      founderName: string
      date: string
      contributionType: string
      description: string
      kind: FounderContributionKind
      estimatedValue: number
      supportingDocDataUrl: string | null
    }
  | {
      type: 'UPDATE_FOUNDER_CONTRIBUTION'
      contributionId: string
      founderName: string
      date: string
      contributionType: string
      description: string
      kind: FounderContributionKind
      estimatedValue: number
      supportingDocDataUrl: string | null
    }
  | {
      type: 'SET_FOUNDER_CONTRIBUTION_STATUS'
      contributionId: string
      status: FounderContributionStatus
      approvedValue: number | null
      approvedBy: string
    }
  | { type: 'REMOVE_FOUNDER_CONTRIBUTION'; contributionId: string }
  | { type: 'SET_SOCIAL_IMPACT_FUND_PCT'; pct: number }
  | {
      type: 'ADD_SOCIAL_IMPACT_TRANSACTION'
      id: string
      date: string
      description: string
      amount: number
      projectId: string | null
      category: SocialImpactTransactionCategory
      status: SocialImpactTransactionStatus
      approvedBy: string | null
      supportingDocDataUrl: string | null
    }
  | {
      type: 'SET_SOCIAL_IMPACT_TRANSACTION_STATUS'
      transactionId: string
      status: SocialImpactTransactionStatus
      approvedBy: string
    }
  | { type: 'REMOVE_SOCIAL_IMPACT_TRANSACTION'; transactionId: string }
  | {
      type: 'ADD_ROTARY_PROJECT'
      id: string
      projectName: string
      partner: string
      description: string
      category: RotaryProjectCategory
      approvedBudget: number
      socialImpactFundAllocation: number
      additionalFunding: number
      status: RotaryProjectStatus
      startDate: string | null
      endDate: string | null
    }
  | {
      type: 'UPDATE_ROTARY_PROJECT'
      projectId: string
      projectName: string
      partner: string
      description: string
      category: RotaryProjectCategory
      approvedBudget: number
      socialImpactFundAllocation: number
      additionalFunding: number
      status: RotaryProjectStatus
      startDate: string | null
      endDate: string | null
    }
  | { type: 'REMOVE_ROTARY_PROJECT'; projectId: string }
  | {
      type: 'ADD_DISTRIBUTION'
      id: string
      recipient: string
      distributionType: DistributionType
      amount: number
      date: string
      source: string
      reference: string | null
      status: DistributionStatus
      approvedBy: string | null
    }
  | {
      type: 'UPDATE_DISTRIBUTION'
      distributionId: string
      recipient: string
      distributionType: DistributionType
      amount: number
      date: string
      source: string
      reference: string | null
      status: DistributionStatus
      approvedBy: string | null
    }
  | { type: 'REMOVE_DISTRIBUTION'; distributionId: string }
  | {
      type: 'ADD_RCC_INCENTIVE'
      id: string
      partner: string
      basis: RccIncentiveBasis
      description: string
      amount: number
      date: string
      status: RccIncentiveStatus
      approvedBy: string | null
    }
  | {
      type: 'UPDATE_RCC_INCENTIVE'
      incentiveId: string
      partner: string
      basis: RccIncentiveBasis
      description: string
      amount: number
      date: string
      status: RccIncentiveStatus
      approvedBy: string | null
    }
  | { type: 'REMOVE_RCC_INCENTIVE'; incentiveId: string }
  | { type: 'UPDATE_CORPORATE_REGISTRATION'; info: CorporateRegistrationInfo }
  | {
      type: 'ADD_STOCKHOLDER'
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
    }
  | {
      type: 'UPDATE_STOCKHOLDER'
      stockholderId: string
      name: string
      nationality: string
      address: string
      stockholderType: StockholderType
      sharesSubscribed: number
      amountSubscribed: number
      amountPaid: number
      dateSubscribed: string | null
      certificateNo: string | null
    }
  | { type: 'REMOVE_STOCKHOLDER'; stockholderId: string }
  | {
      type: 'REGISTER_DRIVER'
      name: string
      plateNumber: string
      licenseNo: string
      licenseExpiry: string
      pin: string
      documents: DriverDocuments
      todaOrgId: string | null
      province: string
      city: string
      barangay: string
      addressDetail: string
      phone: string
      email: string | null
      facebook: string | null
      inviteId: string | null
    }
  | {
      type: 'CREATE_DRIVER_INVITE'
      id: string
      todaOrgId: string | null
      name: string
      phone: string
      email: string | null
      pharmacyId?: string | null
      plateNumber?: string | null
    }
  // Only while unused — an invite somebody already registered through is a
  // record of how their account came to be, and stays.
  | { type: 'REMOVE_DRIVER_INVITE'; inviteId: string }
  // A demo order for a vendor to try the booking flow on — see the reducer.
  | { type: 'ADD_VENDOR_SAMPLE_ORDER'; pharmacyId: string }
  | {
      type: 'REGISTER_PASSENGER'
      id: string
      name: string
      age: number
      phone: string
      email: string | null
      pin: string
      province: string
      city: string
      barangay: string
      addressDetail: string
      guardianPhone: string | null
      guardianName: string | null
      guardianRelationship: string | null
      // Self-registering student — same Passenger account as anyone else,
      // just flagged for the student fare (see calculateFare). Distinct from
      // a child registered by a Parent, who gets no login of their own.
      isStudent: boolean
    }
  | {
      type: 'REGISTER_GUARDIAN_FOR_STUDENT'
      parentId: string
      studentPassengerId: string
      name: string
      phone: string
      relationship: string
      province: string
      city: string
      barangay: string
      addressDetail: string
    }
  | {
      type: 'REGISTER_PARENT_WITH_CHILD'
      parentId: string
      childId: string
      parentName: string
      parentPhone: string
      parentEmail: string | null
      parentPin: string
      childName: string
      childAge: number
      childPhone: string
      relationship: string
      province: string
      city: string
      barangay: string
      addressDetail: string
      proofOfAuthorityDataUrl: string | null
    }
  | {
      type: 'ADD_ACTIVITY_LOG_ENTRY'
      id: string
      actorRole: ActivityLogActorRole
      actorName: string
      todaOrgId: string | null
      action: string
      summary: string
      at: string
    }
  | {
      type: 'ADD_ADVERTISER'
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
      notes: string | null
    }
  | {
      type: 'UPDATE_ADVERTISER'
      advertiserId: string
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
      notes: string | null
    }
  | { type: 'REMOVE_ADVERTISER'; advertiserId: string }
  | {
      type: 'ADD_CAMPAIGN'
      id: string
      name: string
      description: string
      campaignType: CampaignType
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
    }
  | {
      type: 'UPDATE_CAMPAIGN'
      campaignId: string
      name: string
      description: string
      campaignType: CampaignType
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
    }
  | { type: 'SET_CAMPAIGN_STATUS'; campaignId: string; status: CampaignStatus }
  | { type: 'UPDATE_CAMPAIGN_METRICS'; campaignId: string; reach: number; clicks: number; shares: number; participants: number }
  | { type: 'REMOVE_CAMPAIGN'; campaignId: string }
  | {
      type: 'ADD_PROMO_OFFER'
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
      status: PromoOfferStatus
    }
  | {
      type: 'UPDATE_PROMO_OFFER'
      offerId: string
      title: string
      description: string
      kind: PromoOfferKind
      discountType: PromoDiscountType
      discountValue: number
      code: string | null
      startDate: string
      endDate: string | null
      usageLimit: number | null
      status: PromoOfferStatus
    }
  | { type: 'SET_PROMO_OFFER_STATUS'; offerId: string; status: PromoOfferStatus }
  | { type: 'REMOVE_PROMO_OFFER'; offerId: string }
  | { type: 'SET_REWARD_RULES'; rules: RewardRules }
  | {
      type: 'ADD_COIN_TRANSACTION'
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
    }
  | { type: 'REMOVE_COIN_TRANSACTION'; transactionId: string }
  | { type: 'ADD_RIDE_CREDIT_TIER'; id: string; coins: number; pesoValue: number }
  | { type: 'UPDATE_RIDE_CREDIT_TIER'; tierId: string; coins: number; pesoValue: number }
  | { type: 'REMOVE_RIDE_CREDIT_TIER'; tierId: string }
  | {
      type: 'ADD_REFERRAL'
      id: string
      code: string
      referrerId: string
      referrerName: string
      referrerType: 'passenger' | 'driver'
      referredName: string
      referredPassengerId: string | null
      campaignId: string | null
    }
  | {
      type: 'SET_REFERRAL_STATUS'
      referralId: string
      status: ReferralStatus
      coinsAwarded: number
    }
  | { type: 'REMOVE_REFERRAL'; referralId: string }
  | { type: 'SET_INCOME_PROMOTION_SETTINGS'; settings: IncomePromotionSettings }
  | {
      type: 'ADD_PARTNERSHIP_REVENUE'
      id: string
      partnerName: string
      description: string
      amount: number
      recordedBy: string
    }
  | { type: 'REMOVE_PARTNERSHIP_REVENUE'; entryId: string }
  | { type: 'SET_ADSENSE_SETTINGS'; settings: AdSenseSettings }
  // TODARIDE MEDS — pre-dispatch order lifecycle: CREATE_MEDS_ORDER (customer
  // asks for a quote) -> PHARMACY_SEND_QUOTE (pharmacy prices the items) ->
  // CUSTOMER_ACCEPT_QUOTE (customer checks out — only now may the pharmacy
  // proceed) -> PHARMACY_PROCESS_MEDS_ORDER, which either dispatches a real
  // Ride immediately (deliveryMode 'pharmacy_books', same REQUEST_RIDE
  // construction the rest of the app already uses) or leaves the order at
  // 'ready_for_pickup' for the customer to dispatch themselves via
  // MEDS_ORDER_BOOK_OWN_RIDE ('self_book'). Once a Ride exists, everything
  // past that point is ordinary ride dispatch/tracking, not a MEDS-specific
  // action.
  | {
      type: 'CREATE_MEDS_ORDER'
      customerId: string
      customerName: string
      pharmacyId: string
      items: MedsOrderItem[]
      deliveryAddress: MockLocation
      prescriptionDataUrls: string[]
      paymentMethod: PaymentMethod
      deliveryMode: 'pharmacy_books' | 'self_book'
      contactPhone?: string | null
      pricedFromMenu?: boolean
    }
  | { type: 'PHARMACY_SEND_QUOTE'; orderId: string; items: MedsOrderItem[]; receiptDataUrl: string | null }
  // A Registered Vendor order skips the quote round-trip entirely — its
  // items were already priced off the vendor's own menu at checkout (see
  // CREATE_MEDS_ORDER's pricedFromMenu). This is the vendor's one action on
  // it: accept as placed (straight to 'confirmed', same gate
  // PHARMACY_PROCESS_MEDS_ORDER already waits behind) or decline (see
  // PHARMACY_REJECT_MEDS_ORDER, unchanged/shared with the quote flow).
  | { type: 'VENDOR_ACCEPT_MENU_ORDER'; orderId: string }
  // The vendor's answer to a new order: the goods as ordered plus the rider
  // fee they are quoting for this delivery, sent back for the customer to
  // approve (and pay, unless cash on delivery) before anything is cooked —
  // see CUSTOMER_ACCEPT_QUOTE.
  | { type: 'VENDOR_SEND_QUOTE'; orderId: string; deliveryFee: number }
  | { type: 'PHARMACY_REJECT_MEDS_ORDER'; orderId: string; reason: string }
  | { type: 'REVIEW_MEDS_PRESCRIPTION'; orderId: string; approved: boolean; reason: string | null }
  | {
      type: 'CUSTOMER_ACCEPT_QUOTE'
      orderId: string
      paymentMethod: PaymentMethod
      paymentProofDataUrl: string | null
      deliveryMode: 'pharmacy_books' | 'self_book'
    }
  | { type: 'CANCEL_MEDS_ORDER'; orderId: string }
  // Nobody has accepted the dispatched ride yet (still 'requested') and the
  // vendor doesn't want to keep waiting — cancels that ride and reopens the
  // order for the vendor to fulfill some other way. See VENDOR_MARK_DELIVERED_OTHER
  // for closing it out once actually delivered.
  | { type: 'VENDOR_SWITCH_TO_OTHER_DELIVERY'; orderId: string }
  | { type: 'VENDOR_MARK_DELIVERED_OTHER'; orderId: string }
  | { type: 'SEND_MEDS_ORDER_MESSAGE'; orderId: string; sender: 'customer' | 'pharmacy'; text: string }
  | { type: 'PHARMACY_PROCESS_MEDS_ORDER'; orderId: string; preferredDriverId?: string | null }
  | { type: 'MEDS_ORDER_BOOK_OWN_RIDE'; orderId: string; overrides?: MedsRideOverrides }
  // A vendor books a TODA SafeRide driver for an order that did not come
  // through the app (phone, chat, walk-in). Creates the order already
  // dispatched, with its ride, in one step — see the reducer.
  | {
      type: 'VENDOR_BOOK_DELIVERY'
      pharmacyId: string
      customerName: string
      contactPhone: string
      deliveryAddress: MockLocation
      itemsSummary: string
      goodsAmount: number
      // 'cash': the driver collects goods + fees from the customer on
      // delivery (fronting the goods to the vendor at pickup, as Pabili
      // does). 'paid': the customer already paid the vendor directly, so
      // the driver only collects the delivery and service fee.
      collection: 'cash' | 'paid'
      preferredDriverId?: string | null
    }
  | { type: 'TOGGLE_MEDICINE_PRODUCT_STOCK'; productId: string }
  | { type: 'TOGGLE_MEDICINE_PRODUCT_VISIBILITY'; productId: string }
  | { type: 'SET_MEDICINE_PRODUCT_STOCK_COUNT'; productId: string; stockCount: number | null }
  | {
      type: 'REGISTER_PHARMACY'
      id: string
      name: string
      businessType: BusinessType
      contactPhone: string
      province: string
      city: string
      barangay: string
      addressDetail: string
      coords: Coords
      locationGps: GeoCoords | null
      adminPin: string
    }
  | {
      type: 'ADD_MEDICINE_PRODUCT'
      id: string
      pharmacyId: string
      name: string
      genericName: string | null
      category: MedicineCategory
      price: number
      menuCategory?: string | null
      photoDataUrl?: string | null
      description?: string | null
      badge?: MenuItemBadge | null
      stockCount?: number | null
    }
  | {
      type: 'UPDATE_MEDICINE_PRODUCT'
      productId: string
      name: string
      genericName: string | null
      category: MedicineCategory
      price: number
      menuCategory: string | null
      photoDataUrl: string | null
      description: string | null
      badge: MenuItemBadge | null
      stockCount: number | null
    }
  | {
      type: 'UPDATE_PHARMACY_PAYMENT_ACCOUNT'
      pharmacyId: string
      method: 'gcash' | 'maya'
      details: PaymentAccountDetails | null
    }
  | {
      type: 'UPDATE_VENDOR_BRANDING'
      pharmacyId: string
      coverPhotoDataUrl: string | null
      coverPhotoPosition: { x: number; y: number; scale?: number } | null
      bannerBackgroundDataUrl: string | null
      logoDataUrl: string | null
      themeColor: string | null
      tagline: string | null
    }
  | { type: 'UPDATE_PHARMACY_LOCATION'; pharmacyId: string; locationGps: GeoCoords }
  | { type: 'SET_VENDOR_BANNER_THUMB'; pharmacyId: string; dataUrl: string | null; key: string | null }
  | { type: 'TOGGLE_PHARMACY_TRUSTED_DRIVER'; pharmacyId: string; driverId: string }
  | { type: 'RATE_PHARMACY'; pharmacyId: string; customerId: string; customerName: string; rating: number; text: string | null }
  | {
      type: 'ADD_VENDOR_POST'
      pharmacyId: string
      text: string
      photoDataUrl: string | null
      sharePhotoDataUrl?: string | null
      productId: string | null
    }
  | { type: 'SET_VENDOR_POST_SHARE_PHOTO'; pharmacyId: string; postId: string; dataUrl: string }
  | { type: 'REMOVE_VENDOR_POST'; pharmacyId: string; postId: string }
  | { type: 'REACT_VENDOR_POST'; pharmacyId: string; postId: string; reaction: 'like' | 'heart'; actorId: string }
  | { type: 'COMMENT_VENDOR_POST'; pharmacyId: string; postId: string; authorId: string; authorName: string; text: string }
  | { type: 'REMOVE_MEDICINE_PRODUCT'; productId: string }
  | { type: 'REORDER_MEDICINE_PRODUCTS'; orderedIds: string[] }

// Stamped on every save. The server refuses app_state writes that carry an
// older number (see supabase trigger in DOCUMENT GUIDES/app_state_guard.sql),
// so a phone still running a build from before a data-safety fix cannot
// overwrite everyone's world with its stale copy. Bump it when a build
// must be locked out — every build from then on writes the new number and
// every older one is rejected at the door.
export const STATE_SCHEMA_VERSION = 2

interface StoredState {
  schemaVersion?: number
  rides: Ride[]
  alerts: SosAlert[]
  drivers: Driver[]
  passengers?: Passenger[]
  parents?: Parent[]
  parentLinks?: ParentLink[]
  commissionPerRide?: number
  terminalQrFeeWaived?: boolean
  tripLegSeconds?: number
  pilaBannerDataUrl?: string | null
  requestedDrivers?: Record<string, string | null>
  platformFeePayments?: PlatformFeePayment[]
  driverWithdrawals?: DriverWithdrawal[]
  platformGcashAccount?: PaymentAccountDetails
  todaQueueWindowMs?: number
  queueOfferTimeoutMs?: number
  specialPickupEscalationMs?: number
  todaOrganizations?: TodaOrganization[]
  terminals?: Terminal[]
  landmarks?: Landmark[]
  deletedLandmarkIds?: string[]
  boundaries?: MapBoundary[]
  // One-time marker: the seeded CLSU fleet has been placed in its terminal
  // queues on this install. Without it the backfill would re-queue drivers
  // every reload, undoing anyone who left the line.
  clsuFleetQueued?: boolean
  duesRecords?: DuesRecord[]
  membershipRequests?: MembershipRequest[]
  duesGracePeriodDays?: number
  tripHistoryRetentionDays?: number
  tariffSettings?: TariffSettings
  cityTariffs?: Record<string, TariffSettings>
  todaTariffs?: Record<string, TariffSettings>
  driverReports?: DriverReport[]
  pabiliServiceFee?: number
  pabiliFareMode?: PabiliFareMode
  pabiliFixedFare?: number
  todaRadiusKm?: number
  outOfAreaPerKm?: number
  expenses?: ExpenseRecord[]
  complianceChecked?: Record<string, boolean>
  complianceReview?: Record<string, { note: string | null; deadlineAt: string | null }>
  capitalContributions?: CapitalContribution[]
  todaContributions?: TodaContribution[]
  todaExpenses?: TodaExpenseRecord[]
  driverInvites?: DriverInvite[]
  accountingOfficers?: AccountingOfficer[]
  equityAllocations?: EquityAllocation[]
  investors?: Investor[]
  founderContributions?: FounderContribution[]
  socialImpactFundPct?: number
  socialImpactTransactions?: SocialImpactTransaction[]
  rotaryProjects?: RotaryProject[]
  distributions?: Distribution[]
  rccIncentives?: RccIncentive[]
  corporateRegistration?: CorporateRegistrationInfo
  stockholders?: Stockholder[]
  activityLog?: ActivityLogEntry[]
  advertisers?: Advertiser[]
  campaigns?: Campaign[]
  promoOffers?: PromoOffer[]
  rewardRules?: RewardRules
  coinTransactions?: CoinTransaction[]
  rideCreditTiers?: RideCreditTier[]
  referrals?: Referral[]
  incomePromotionSettings?: IncomePromotionSettings
  partnershipRevenue?: PartnershipRevenueEntry[]
  adSenseSettings?: AdSenseSettings
  pharmacies?: Pharmacy[]
  removedPharmacyIds?: string[]
  medicineProducts?: MedicineProduct[]
  medsOrders?: MedsOrder[]
  operators?: Operator[]
  franchises?: Franchise[]
  accountSuspensions?: AccountSuspension[]
  adminNotes?: AdminNote[]
  announcements?: Announcement[]
  supportMessages?: SupportMessage[]
  bannerAds?: (BannerAd | null)[]
  pabiliEnabled?: boolean
  rewardsEnabled?: boolean
  medsEnabled?: boolean
  vendorsEnabled?: boolean
  partnerBannerEnabled?: boolean
  simulatedOtpEnabled?: boolean
  publicBaseUrl?: string
  pilotTodaName?: string
  simulateMovementEnabled?: boolean
  liveGpsEnabled?: boolean
  openDriverSignup?: boolean
  documentGraceDays?: number
  emergencyHotlines?: EmergencyHotline[]
  safetySettings?: Partial<SafetySettings>
}

// PIN/email were added to Driver/Passenger/Parent after this app already had
// users with data saved in localStorage — without this, anyone's
// already-stored account would be missing both fields (silently breaking PIN
// login) until they cleared storage. Backfills a deterministic PIN (last 4
// phone digits, matching how the seed mock accounts were assigned theirs) so
// existing accounts get a working PIN instead of a permanently broken one.
function lastFourDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.slice(-4) || '0000'
}

// The house banner shipped as a 2.8MB PNG wrapped in an SVG until it was
// re-encoded to WebP (236KB). Banner slots are persisted, and a stored slot
// wins over the seed, so every install from before that change still points
// at a file that no longer exists — a broken image on the passenger home
// screen. Rewrites just that one path; a banner Super Admin uploaded is a
// data URL and is left alone.
const LEGACY_BANNER_URL = '/ads/toda-saferide-banner.svg'
const BANNER_URL = '/ads/toda-saferide-banner.webp'

// Every name the recorded-pickup label has answered to. The label is
// stamped onto a ride when the trip is recorded, so renaming it in the
// source changes nothing a passenger sees: trips already saved keep the
// wording they were born with, and the booking form offers the last
// trip's pickup as the next one's. Rename it three times and all three
// are still on screen somewhere.
//
// So old labels are rewritten on the way in, the same as any other stored
// shape this app has outgrown.
const RECORDED_PICKUP_LABEL = 'FROM'
const OLD_RECORDED_PICKUP_LABELS = [
  'Kung nasaan ka ngayon',
  'My location',
  'Where you from',
]

// Both ends, not just the pickup.
//
// A recorded trip starts with its dropoff set to a copy of its pickup —
// there is no destination until the passenger gives one — so the label
// lives twice on the same ride. And the booking form seeds the next
// pickup from the last trip DROPOFF, on the reasoning that you are
// standing where you got out. Rewriting only the pickup therefore fixed
// the copy nobody reads and left the one on screen.
function migrateRecordedPickupLabel(rides: Ride[]): Ride[] {
  const fix = (loc: MockLocation | null | undefined) =>
    loc && OLD_RECORDED_PICKUP_LABELS.includes(loc.label) ? { ...loc, label: RECORDED_PICKUP_LABEL } : loc
  return rides.map((ride) => ({
    ...ride,
    pickup: fix(ride.pickup) ?? ride.pickup,
    dropoff: fix(ride.dropoff) ?? ride.dropoff,
  }))
}

function migrateBannerAd(ad: BannerAd | null): BannerAd | null {
  if (!ad || ad.imageUrl !== LEGACY_BANNER_URL) return ad
  return { ...ad, imageUrl: BANNER_URL }
}

function fromStored(parsed: StoredState): RideState {
  const parentLinks = parsed.parentLinks ?? MOCK_PARENT_LINKS
  // A passenger linked as someone's child doesn't log in on their own (see
  // REGISTER_PARENT_WITH_CHILD), so it shouldn't get a backfilled PIN either
  // — guardianPhone isn't a reliable signal for this (a self-registered
  // senior/PWD adult also has none).
  const linkedChildIds = new Set(parentLinks.map((l) => l.studentPassengerId))
  return {
    rides: migrateRecordedPickupLabel(parsed.rides ?? []),
    alerts: parsed.alerts ?? [],
    drivers: ((): Driver[] => {
      const stored = (parsed.drivers ?? []).map((d) => ({ ...d, email: d.email ?? null, facebook: d.facebook ?? null }))
      // Seeded drivers added after an install already exists would never
      // appear otherwise — the same merge-by-id the seeded TODAs needed.
      const missing = MOCK_DRIVERS.filter((seed) => !stored.some((d) => d.id === seed.id))
      const placed = parsed.clsuFleetQueued
        ? stored
        : stored.map((d) => {
            const seed = MOCK_DRIVERS.find((m) => m.id === d.id)
            return seed?.queueJoinedAt && !d.queueJoinedAt
              ? { ...d, queueJoinedAt: seed.queueJoinedAt, homeTerminalId: d.homeTerminalId ?? seed.homeTerminalId }
              : d
          })
      return [...placed, ...missing]
    })(),
    passengers: (parsed.passengers ?? MOCK_PASSENGERS).map((p) => ({
      ...p,
      email: p.email ?? null,
      pin: p.pin ?? (linkedChildIds.has(p.id) ? null : lastFourDigits(p.phone)),
    })),
    parents: (parsed.parents ?? MOCK_PARENTS).map((p) => ({
      ...p,
      email: p.email ?? null,
      pin: p.pin ?? lastFourDigits(p.phone),
    })),
    parentLinks,
    commissionPerRide: parsed.commissionPerRide ?? DEFAULT_COMMISSION_PER_RIDE,
    terminalQrFeeWaived: parsed.terminalQrFeeWaived ?? true,
    tripLegSeconds: parsed.tripLegSeconds ?? DEFAULT_TRIP_LEG_SECONDS,
    pilaBannerDataUrl: parsed.pilaBannerDataUrl ?? null,
    requestedDrivers: parsed.requestedDrivers ?? {},
    platformFeePayments: parsed.platformFeePayments ?? [],
    driverWithdrawals: parsed.driverWithdrawals ?? [],
    platformGcashAccount: parsed.platformGcashAccount ?? PLATFORM_GCASH_ACCOUNT,
    todaQueueWindowMs: parsed.todaQueueWindowMs ?? DEFAULT_TODA_QUEUE_WINDOW_MS,
    queueOfferTimeoutMs: parsed.queueOfferTimeoutMs ?? DEFAULT_QUEUE_OFFER_TIMEOUT_MS,
    specialPickupEscalationMs: parsed.specialPickupEscalationMs ?? DEFAULT_SPECIAL_PICKUP_ESCALATION_MS,
    // Older saved sessions predate TaaS Level 1 (SaaS Partner) fields —
    // default each org to the cheapest plan/direct-to-HQ rather than leaving
    // them undefined (would render blank/NaN in SubscriptionSection).
    // Seeded terminals are backfilled for anyone whose stored state predates
    // them — an empty terminal list is never what the operator meant.
    terminals: parsed.terminals?.length ? parsed.terminals : MOCK_TERMINALS,
    // Same backfill reasoning as terminals — an older stored session predates
    // landmarks entirely, and an empty search result for every query is a
    // worse first impression than the seed set showing up underneath
    // whatever a TODA admin has since added. But a seed landmark an admin
    // has since deleted must not come back just because it's now "missing" —
    // same tombstone rule as removedPharmacyIds, filtered back out here.
    landmarks: withHealedLandmarks(parsed.landmarks).filter(
      (l) => !(parsed.deletedLandmarkIds ?? []).includes(l.id),
    ),
    deletedLandmarkIds: parsed.deletedLandmarkIds ?? [],
    clsuFleetQueued: true,
    boundaries: ((): MapBoundary[] => {
      const stored = parsed.boundaries ?? []
      const missing = MOCK_BOUNDARIES.filter((seed) => !stored.some((b) => b.id === seed.id))
      // A boundary drawn under the old model lived on the organisation; carry
      // it over rather than losing work someone did on a map.
      const fromJurisdictions = (parsed.todaOrganizations ?? [])
        .filter((o) => Array.isArray((o as { jurisdiction?: GeoCoords[] }).jurisdiction))
        .map((o) => {
          const points = (o as unknown as { jurisdiction: GeoCoords[] }).jurisdiction
          return {
            id: `boundary-${o.id}`,
            name: `${o.name} area`,
            kind: 'toda' as const,
            todaOrgId: o.id,
            city: o.city,
            points,
            source: null,
          }
        })
        .filter((b) => b.points.length >= 3 && !stored.some((s2) => s2.id === b.id))
      return [...stored, ...missing, ...fromJurisdictions]
    })(),
    todaOrganizations: ((): TodaOrganization[] => {
      const stored = parsed.todaOrganizations ?? MOCK_TODA_ORGANIZATIONS
      const missingSeeds = MOCK_TODA_ORGANIZATIONS.filter((seed) => !stored.some((o) => o.id === seed.id))
      return [...stored, ...missingSeeds]
    })().map((o) => ({
      ...o,
      saasPlan: o.saasPlan ?? 'starter',
      monthlyPlatformFee: o.monthlyPlatformFee ?? SAAS_PLAN_FEES.starter,
      perBookingFee: o.perBookingFee ?? 0,
      operatorId: o.operatorId ?? null,
    })),
    duesRecords: parsed.duesRecords ?? [],
    membershipRequests: parsed.membershipRequests ?? [],
    duesGracePeriodDays: parsed.duesGracePeriodDays ?? DEFAULT_DUES_GRACE_PERIOD_DAYS,
    tripHistoryRetentionDays: parsed.tripHistoryRetentionDays ?? DEFAULT_TRIP_HISTORY_RETENTION_DAYS,
    tariffSettings: { ...DEFAULT_TARIFF_SETTINGS, ...parsed.tariffSettings },
    cityTariffs: parsed.cityTariffs ?? {},
    todaTariffs: parsed.todaTariffs ?? {},
    driverReports: parsed.driverReports ?? [],
    pabiliServiceFee: parsed.pabiliServiceFee ?? DEFAULT_PABILI_SERVICE_FEE,
    pabiliFareMode: parsed.pabiliFareMode === 'fixed' ? 'fixed' : 'standard',
    pabiliFixedFare: parsed.pabiliFixedFare ?? DEFAULT_PABILI_FIXED_FARE,
    todaRadiusKm: parsed.todaRadiusKm ?? DEFAULT_TODA_RADIUS_KM,
    outOfAreaPerKm: parsed.outOfAreaPerKm ?? DEFAULT_OUT_OF_AREA_PER_KM,
    expenses: parsed.expenses ?? [],
    complianceChecked: parsed.complianceChecked ?? {},
    complianceReview: parsed.complianceReview ?? {},
    capitalContributions: parsed.capitalContributions ?? [],
    todaContributions: parsed.todaContributions ?? [],
    todaExpenses: parsed.todaExpenses ?? [],
    driverInvites: parsed.driverInvites ?? [],
    // The Founder's entry was added after people already had officer lists
    // saved, and a stored list wins over the seed — so without this backfill
    // he'd hold Super Admin yet still be locked out of the books on every
    // existing browser. Matched on email so re-adding him by hand doesn't
    // produce a duplicate.
    accountingOfficers: (() => {
      const stored = parsed.accountingOfficers ?? MOCK_ACCOUNTING_OFFICERS
      const founder = MOCK_ACCOUNTING_OFFICERS.find((o) => o.email === APP_SUPER_ADMIN_EMAIL)
      if (!founder) return stored
      const hasFounder = stored.some((o) => o.email.toLowerCase() === APP_SUPER_ADMIN_EMAIL.toLowerCase())
      return hasFounder ? stored : [founder, ...stored]
    })(),
    equityAllocations: parsed.equityAllocations ?? MOCK_EQUITY_ALLOCATIONS,
    investors: parsed.investors ?? [],
    founderContributions: parsed.founderContributions ?? [],
    socialImpactFundPct: parsed.socialImpactFundPct ?? DEFAULT_SOCIAL_IMPACT_FUND_PCT,
    socialImpactTransactions: parsed.socialImpactTransactions ?? [],
    rotaryProjects: parsed.rotaryProjects ?? [],
    distributions: parsed.distributions ?? [],
    rccIncentives: parsed.rccIncentives ?? [],
    corporateRegistration: { ...DEFAULT_CORPORATE_REGISTRATION, ...parsed.corporateRegistration },
    stockholders: parsed.stockholders ?? [],
    activityLog: parsed.activityLog ?? [],
    advertisers: parsed.advertisers ?? MOCK_ADVERTISERS,
    campaigns: parsed.campaigns ?? MOCK_CAMPAIGNS,
    promoOffers: parsed.promoOffers ?? [],
    rewardRules: { ...DEFAULT_REWARD_RULES, ...parsed.rewardRules },
    coinTransactions: parsed.coinTransactions ?? [],
    rideCreditTiers: parsed.rideCreditTiers ?? DEFAULT_RIDE_CREDIT_TIERS,
    referrals: parsed.referrals ?? [],
    incomePromotionSettings: { ...DEFAULT_INCOME_PROMOTION_SETTINGS, ...parsed.incomePromotionSettings },
    partnershipRevenue: parsed.partnershipRevenue ?? [],
    adSenseSettings: { ...DEFAULT_ADSENSE_SETTINGS, ...parsed.adSenseSettings, slots: { ...DEFAULT_ADSENSE_SETTINGS.slots, ...parsed.adSenseSettings?.slots } },
    pharmacies: withLateSeedVendors(parsed.pharmacies).filter((p) => !(parsed.removedPharmacyIds ?? []).includes(p.id)),
    removedPharmacyIds: parsed.removedPharmacyIds ?? [],
    medicineProducts: withLateSeedVendorMenus(parsed.medicineProducts),
    // Older saved sessions predate the order-chat feature — default each
    // order's messages to an empty array rather than crashing on .map/.length.
    medsOrders: (parsed.medsOrders ?? []).map((o: MedsOrder) => ({ ...o, messages: o.messages ?? [] })),
    // Older saved sessions predate the Operator/Franchise business-profile
    // fields (email/barangay/addressDetail/businessRegistrationNo) — same
    // backfill approach as todaOrganizations above.
    operators: (parsed.operators ?? MOCK_OPERATORS).map((o) => ({
      ...o,
      email: o.email ?? null,
      barangay: o.barangay ?? '',
      addressDetail: o.addressDetail ?? '',
      businessRegistrationNo: o.businessRegistrationNo ?? null,
      // Absent, not null: a record saved before the partner logo existed has
      // no such key and should take the seeded mark, while one an Operator
      // deliberately cleared holds null and must stay cleared. `??` cannot
      // tell those apart and would resurrect a logo they just removed.
      logoDataUrl:
        'logoDataUrl' in o
          ? o.logoDataUrl
          : (MOCK_OPERATORS.find((seed) => seed.id === o.id)?.logoDataUrl ?? null),
      // Same rule, same reason: a record from before the banner existed takes
      // the seeded artwork; one deliberately cleared stays cleared.
      bannerDataUrl:
        'bannerDataUrl' in o
          ? o.bannerDataUrl
          : (MOCK_OPERATORS.find((seed) => seed.id === o.id)?.bannerDataUrl ?? null),
    })),
    franchises: (parsed.franchises ?? MOCK_FRANCHISES).map((f) => ({
      ...f,
      email: f.email ?? null,
      barangay: f.barangay ?? '',
      addressDetail: f.addressDetail ?? '',
      businessRegistrationNo: f.businessRegistrationNo ?? null,
    })),
    accountSuspensions: parsed.accountSuspensions ?? [],
    adminNotes: parsed.adminNotes ?? [],
    announcements: parsed.announcements ?? [],
    supportMessages: parsed.supportMessages ?? [],
    // Length-normalised on the way in: a blob saved before this feature (or
    // before the slot count changed) would otherwise hand the UI an array of
    // the wrong length and lose or orphan a slot.
    bannerAds: Array.from({ length: BANNER_AD_SLOT_COUNT }, (_, i) =>
      migrateBannerAd(parsed.bannerAds?.[i] ?? MOCK_BANNER_ADS[i] ?? null),
    ),
    pabiliEnabled: parsed.pabiliEnabled ?? false,
    rewardsEnabled: parsed.rewardsEnabled ?? false,
    medsEnabled: parsed.medsEnabled ?? false,
    vendorsEnabled: parsed.vendorsEnabled ?? false,
    partnerBannerEnabled: parsed.partnerBannerEnabled ?? false,
    // Real codes unless somebody has said otherwise. The endpoint is live
    // and the account has credits, so a pilot with real testers should be
    // proving the real path. An install that has already chosen keeps its
    // choice — this only changes what a fresh one starts with.
    simulatedOtpEnabled: parsed.simulatedOtpEnabled ?? false,
    publicBaseUrl: parsed.publicBaseUrl ?? '',
    pilotTodaName: parsed.pilotTodaName ?? '',
    // Off unless somebody has said otherwise. The pilot is on real roads
    // now, so the map should move because a tricycle moved. An install that
    // has already chosen keeps its choice — this only changes what a fresh
    // one starts with.
    simulateMovementEnabled: parsed.simulateMovementEnabled ?? false,
    liveGpsEnabled: parsed.liveGpsEnabled ?? true,
    openDriverSignup: parsed.openDriverSignup ?? true,
    documentGraceDays: parsed.documentGraceDays ?? 30,
    safetySettings: withSafetyDefaults(parsed.safetySettings),
    // Merged rather than "stored wins", because a stored list would freeze
    // out every hotline added to the seed afterwards — and a missing
    // emergency number is the one kind of stale data worth being pushy
    // about. Matched on id, so an admin's own edits to a seeded entry (a
    // corrected number, a verified tick) survive; only genuinely absent ids
    // are appended. Trade-off: deleting a seeded number doesn't stick — edit
    // it instead if one is wrong.
    emergencyHotlines: (() => {
      const stored = parsed.emergencyHotlines
      if (!stored) return MOCK_EMERGENCY_HOTLINES
      const seen = new Set(stored.map((h) => h.id))
      const missing = MOCK_EMERGENCY_HOTLINES.filter((h) => !seen.has(h.id))
      return missing.length > 0 ? [...stored, ...missing] : stored
    })(),
  }
}

// Where a blob that could not be hydrated gets parked. Silently falling back
// to seeds used to be unrecoverable: the persist effect runs on mount too, so
// one bad read immediately wrote the defaults over the real data — every
// announcement, suspension, support message and service switch gone, with no
// way back. Keeping the original bytes makes the fallback survivable, and the
// console error makes it visible instead of looking like the app "reset
// itself again".
// Which open document is allowed to advance the movement simulation.
//
// Every document runs the tick below and every document persists what it
// produced, which other documents then hydrate from. With two or more open at
// once — the Split-Screen Simulator is three: the page plus both panes — each
// clock is offset from the others by part of a tick, so a pane is repeatedly
// overwritten with a legProgress *behind* the one it just computed, ticks
// forward again, and gets pushed back again. The driver marker vibrates in
// place instead of travelling. One clock, leased and refreshed, removes the
// disagreement; every other document just follows the state it is handed.
const SIM_CLOCK_KEY = 'tricycle-sim-clock-v1'
// Long enough to survive a slow tick, short enough that closing the owning
// tab hands the clock over within a few ticks rather than freezing movement.
const SIM_CLOCK_LEASE_MS = 2500

const STORAGE_BACKUP_KEY = `${STORAGE_KEY}.unreadable`

// Seed vendors added after the pilot's shared state already existed. A
// stored `pharmacies` list wins over the seeds wholesale (see fromStored),
// which is right for everything a person has edited — but it also means a
// vendor added to the seeds later never appears anywhere the app has run
// before. These ids are merged in when absent, the same way the emergency
// hotlines are. Only these: vendor-1 and vendor-2 are deliberately left out,
// since the pilot's own registered stores replaced them. Trade-off, as with
// the hotlines: deleting one of these from the live data does not stick.
const LATE_SEED_VENDOR_IDS = new Set(['vendor-3', 'vendor-4', 'vendor-5', 'vendor-6', 'vendor-7', 'vendor-8'])

// Landmarks are entirely seed-controlled for now (no admin add/edit screen
// yet), so unlike vendors this backfills every field, not just the ones a
// person might have customized — a stored landmark missing `city` (from
// before that field existed) is healed from the current seed by id, and any
// seed landmark added since is merged in the same way late-seed vendors are.
function withHealedLandmarks(stored: Landmark[] | undefined): Landmark[] {
  if (!stored?.length) return MOCK_LANDMARKS
  const seen = new Set(stored.map((l) => l.id))
  const missing = MOCK_LANDMARKS.filter((l) => !seen.has(l.id))
  const healed = stored.map((l) => {
    const seed = MOCK_LANDMARKS.find((s) => s.id === l.id)
    return seed ? { ...seed, ...l, city: l.city ?? seed.city } : l
  })
  return missing.length > 0 ? [...healed, ...missing] : healed
}

function withLateSeedVendors(stored: Pharmacy[] | undefined): Pharmacy[] {
  if (!stored) return MOCK_PHARMACIES
  const seen = new Set(stored.map((p) => p.id))
  const missing = MOCK_PHARMACIES.filter((p) => LATE_SEED_VENDOR_IDS.has(p.id) && !seen.has(p.id))
  // A seed vendor already in the shared state picks up branding the seed
  // gained later (logo, banner photo, tagline, theme) — only where it has
  // none of its own, so anything the store set from its portal wins.
  let changed = false
  const dressed = stored.map((p) => {
    if (!LATE_SEED_VENDOR_IDS.has(p.id)) return p
    const seed = MOCK_PHARMACIES.find((s) => s.id === p.id)
    if (!seed) return p
    const next = { ...p }
    for (const key of ['logoDataUrl', 'coverPhotoDataUrl', 'coverPhotoPosition', 'tagline', 'themeColor'] as const) {
      if (next[key] == null && seed[key] != null) {
        ;(next as Record<string, unknown>)[key] = seed[key]
        changed = true
      }
    }
    // Same idea for a seed's sample post: only while the store has never
    // posted of its own (an empty array here still means "no post yet",
    // unlike the fields above), so a real post it made in its own portal is
    // never displaced by the seed's placeholder one.
    if ((next.posts?.length ?? 0) === 0 && (seed.posts?.length ?? 0) > 0) {
      next.posts = seed.posts
      changed = true
    }
    return next
  })
  const base = changed ? dressed : stored
  return missing.length > 0 ? [...base, ...missing] : base
}

function withLateSeedVendorMenus(stored: MedicineProduct[] | undefined): MedicineProduct[] {
  if (!stored) return [...MOCK_MEDICINE_PRODUCTS, ...MOCK_VENDOR_MENU_ITEMS]
  const seen = new Set(stored.map((p) => p.id))
  const missing = MOCK_VENDOR_MENU_ITEMS.filter((p) => LATE_SEED_VENDOR_IDS.has(p.pharmacyId) && !seen.has(p.id))
  return missing.length > 0 ? [...stored, ...missing] : stored
}

// Drops anything of the wrong shape so one bad field cannot cost the whole
// save. A stored array that arrives as an object, a stored object that
// arrives as a string — these are the shapes that make hydration throw, and
// every one of them is survivable by falling back to the default for that
// field alone.
function sanitiseStored(parsed: Record<string, unknown>): Record<string, unknown> {
  const ARRAYS = [
    'rides', 'alerts', 'drivers', 'passengers', 'parents', 'parentLinks', 'todaOrganizations',
    'terminals', 'boundaries', 'platformFeePayments', 'driverWithdrawals', 'pharmacies', 'medsOrders', 'announcements',
    'expenses', 'operators', 'franchises',
  ]
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (value === undefined) continue
    if (ARRAYS.includes(key) && !Array.isArray(value)) continue
    clean[key] = value
  }
  return clean
}

function loadInitialState(): RideState {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) {
    let parsed: unknown = null
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      console.error('[TodaRide] Saved data is not valid JSON.', err)
    }
    if (parsed && typeof parsed === 'object') {
      try {
        return fromStored(parsed as StoredState)
      } catch (err) {
        // Second chance before giving up. Throwing away every ride, terminal,
        // TODA and setting because one field was the wrong shape is a far
        // worse outcome than starting the app with that one field defaulted —
        // and on a pilot phone the loss is silent and permanent.
        try {
          const recovered = fromStored(sanitiseStored(parsed as Record<string, unknown>) as unknown as StoredState)
          console.warn(
            '[TodaRide] Saved data had a bad field and was repaired on load. A copy of the original is under ' +
              `"${STORAGE_BACKUP_KEY}". Original error:`,
            err,
          )
          try {
            localStorage.setItem(STORAGE_BACKUP_KEY, raw)
          } catch {
            // Quota — the warning above is still the record of what happened.
          }
          return recovered
        } catch (fatal) {
          try {
            localStorage.setItem(STORAGE_BACKUP_KEY, raw)
          } catch {
            // Best-effort — if even this fails (quota), the error below still
            // tells us what happened.
          }
          console.error(
            `[TodaRide] Saved data could not be read even after repair and has been set aside under "${STORAGE_BACKUP_KEY}". ` +
              'Starting from seed data. Errors:',
            err,
            fatal,
          )
        }
      }
    }
  }
  return {
    rides: [],
    alerts: [],
    drivers: MOCK_DRIVERS,
    passengers: MOCK_PASSENGERS,
    parents: MOCK_PARENTS,
    parentLinks: MOCK_PARENT_LINKS,
    commissionPerRide: DEFAULT_COMMISSION_PER_RIDE,
    terminalQrFeeWaived: true,
    tripLegSeconds: DEFAULT_TRIP_LEG_SECONDS,
    pilaBannerDataUrl: null,
    requestedDrivers: {},
    platformFeePayments: [],
    driverWithdrawals: [],
    platformGcashAccount: PLATFORM_GCASH_ACCOUNT,
    todaQueueWindowMs: DEFAULT_TODA_QUEUE_WINDOW_MS,
    queueOfferTimeoutMs: DEFAULT_QUEUE_OFFER_TIMEOUT_MS,
    specialPickupEscalationMs: DEFAULT_SPECIAL_PICKUP_ESCALATION_MS,
    todaOrganizations: MOCK_TODA_ORGANIZATIONS,
    terminals: MOCK_TERMINALS,
    landmarks: MOCK_LANDMARKS,
    deletedLandmarkIds: [],
    boundaries: MOCK_BOUNDARIES,
    clsuFleetQueued: true,
    duesRecords: [],
    membershipRequests: [],
    duesGracePeriodDays: DEFAULT_DUES_GRACE_PERIOD_DAYS,
    tripHistoryRetentionDays: DEFAULT_TRIP_HISTORY_RETENTION_DAYS,
    tariffSettings: DEFAULT_TARIFF_SETTINGS,
    cityTariffs: {},
    todaTariffs: {},
    driverReports: [],
    pabiliServiceFee: DEFAULT_PABILI_SERVICE_FEE,
    pabiliFareMode: 'standard',
    pabiliFixedFare: DEFAULT_PABILI_FIXED_FARE,
    todaRadiusKm: DEFAULT_TODA_RADIUS_KM,
    outOfAreaPerKm: DEFAULT_OUT_OF_AREA_PER_KM,
    expenses: [],
    complianceChecked: {},
    complianceReview: {},
    capitalContributions: [],
    todaContributions: [],
    todaExpenses: [],
    driverInvites: [],
    accountingOfficers: MOCK_ACCOUNTING_OFFICERS,
    equityAllocations: MOCK_EQUITY_ALLOCATIONS,
    investors: [],
    founderContributions: [],
    socialImpactFundPct: DEFAULT_SOCIAL_IMPACT_FUND_PCT,
    socialImpactTransactions: [],
    rotaryProjects: [],
    distributions: [],
    rccIncentives: [],
    corporateRegistration: DEFAULT_CORPORATE_REGISTRATION,
    stockholders: [],
    activityLog: [],
    advertisers: MOCK_ADVERTISERS,
    campaigns: MOCK_CAMPAIGNS,
    promoOffers: [],
    rewardRules: DEFAULT_REWARD_RULES,
    coinTransactions: [],
    rideCreditTiers: DEFAULT_RIDE_CREDIT_TIERS,
    referrals: [],
    incomePromotionSettings: DEFAULT_INCOME_PROMOTION_SETTINGS,
    partnershipRevenue: [],
    adSenseSettings: DEFAULT_ADSENSE_SETTINGS,
    pharmacies: MOCK_PHARMACIES,
    removedPharmacyIds: [],
    medicineProducts: [...MOCK_MEDICINE_PRODUCTS, ...MOCK_VENDOR_MENU_ITEMS],
    medsOrders: [],
    operators: MOCK_OPERATORS,
    franchises: MOCK_FRANCHISES,
    accountSuspensions: [],
    adminNotes: [],
    announcements: [],
    supportMessages: [],
    bannerAds: MOCK_BANNER_ADS,
    pabiliEnabled: false,
    rewardsEnabled: false,
    medsEnabled: false,
    vendorsEnabled: false,
    partnerBannerEnabled: false,
    simulatedOtpEnabled: false,
    publicBaseUrl: '',
    pilotTodaName: '',
    simulateMovementEnabled: false,
    liveGpsEnabled: true,
    openDriverSignup: true,
    documentGraceDays: 30,
    emergencyHotlines: MOCK_EMERGENCY_HOTLINES,
    safetySettings: SAFETY_DEFAULTS,
  }
}

function lerp(from: Coords, to: Coords, t: number): Coords {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
}

function legOrigin(ride: Ride): Coords {
  return ride.status === 'ongoing' ? ride.pickup.coords : DRIVER_BASE_COORDS
}

function legDestination(ride: Ride): Coords {
  return ride.status === 'ongoing' ? ride.dropoff.coords : ride.pickup.coords
}

function generateReferenceNo(): string {
  return `PM-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase()
}

function randomOffset(): Coords {
  const magnitude = DEVIATION_OFFSET_MIN + Math.random() * (DEVIATION_OFFSET_MAX - DEVIATION_OFFSET_MIN)
  const angle = Math.random() * Math.PI * 2
  return { x: Math.cos(angle) * magnitude, y: Math.sin(angle) * magnitude }
}

function clampToMap(value: number): number {
  return Math.min(96, Math.max(4, value))
}

// A ride's `passengerId` is either a real Passenger's id, or — for a
// parent's self-booking, which has no separate Passenger record — the
// Parent's own id. Check both so the favorite-driver preference applies
// either way.
function findFavoriteDriverId(state: RideState, passengerId: string): string | null {
  return (
    state.passengers.find((p) => p.id === passengerId)?.favoriteDriverId ??
    state.parents.find((p) => p.id === passengerId)?.favoriteDriverId ??
    null
  )
}

// TODARIDE MEDS — builds the actual delivery Ride for a confirmed order,
// shared by both dispatch paths: PHARMACY_PROCESS_MEDS_ORDER (deliveryMode
// 'pharmacy_books', dispatches immediately) and MEDS_ORDER_BOOK_OWN_RIDE
// (deliveryMode 'self_book', dispatches whenever the customer taps "Book my
// ride now"). Same construction REQUEST_RIDE already uses — the pharmacy
// becomes the Ride's "pickup" (abstract coords for the fare/priority-dispatch
// simulation, real gps for the live map), the order's delivery address
// becomes "dropoff".
export interface MedsRideOverrides {
  dropoff?: MockLocation
  paymentMethod?: PaymentMethod
  tip?: number
  // A rider the vendor picked for this delivery (see TrustedRiderSelect) —
  // offered first, ahead of the customer's favourite and the terminal
  // queue. Null/undefined = whoever dispatch would choose anyway.
  preferredDriverId?: string | null
}

// What a delivery from this store to that address costs to ride: the
// standard one-way TODA fare — the same tariff and the same estimate a
// passenger booking that trip would get (the pickup's city, or the answering
// TODA's own schedule); no errand pricing — plus the platform's per-ride
// booking fee the admin sets. This is the quotation a vendor sends — the
// rider gets the fare, the platform the fee.
export function vendorDeliveryFareQuote(
  state: RideState,
  pharmacy: Pharmacy,
  dropoff: MockLocation,
): { todaFare: number; bookingFee: number } {
  const pickup: MockLocation = {
    id: pharmacy.id,
    label: pharmacy.name,
    coords: pharmacy.coords,
    gps: pharmacy.locationGps ?? { lat: 15.7940977, lng: 120.9905849 },
    province: pharmacy.province,
    city: pharmacy.city,
    barangay: pharmacy.barangay,
  }
  const priorityTodaOrgId = getPriorityTodaOrgId(pickup)
  const tariff = resolveTariff(state.tariffSettings, state.cityTariffs, state.todaTariffs, pickup.city, priorityTodaOrgId)
  const oneWay = estimateFare(pickup, dropoff, tariff, { isStudent: false, isPwdSenior: false, passengerCount: 1 })
  return {
    todaFare: Math.max(0, Math.round(oneWay)),
    bookingFee: Math.max(0, Math.round(state.commissionPerRide)),
  }
}

function buildMedsDeliveryRide(
  state: RideState,
  order: MedsOrder,
  pharmacy: Pharmacy,
  overrides?: MedsRideOverrides,
): Ride {
  const pickup: MockLocation = {
    id: pharmacy.id,
    label: pharmacy.name,
    coords: pharmacy.coords,
    gps: pharmacy.locationGps ?? { lat: 15.7940977, lng: 120.9905849 },
    province: pharmacy.province,
    city: pharmacy.city,
    barangay: pharmacy.barangay,
  }
  const dropoff = overrides?.dropoff ?? order.deliveryAddress
  const priorityTodaOrgId = getPriorityTodaOrgId(pickup)
  // The vendor's own Trusted Rider (see Pharmacy.trustedDriverIds) — the
  // first one currently on duty — is offered the delivery first, the same
  // way a passenger's favourite driver is. The customer's own favourite
  // still wins if they have one: it is their food, and their driver.
  const trustedOnDuty = (pharmacy.trustedDriverIds ?? [])
    .map((id) => state.drivers.find((d) => d.id === id))
    .find((d) => d && d.online && d.verificationStatus === 'approved' && d.accessStatus === 'active')
  const { offeredDriverId, offeredAt } = nextQueueOffer(
    priorityTodaOrgId,
    [],
    state.drivers,
    overrides?.preferredDriverId ?? findFavoriteDriverId(state, order.customerId) ?? trustedOnDuty?.id ?? null,
    true,
    dispatchCtx(state, pickup.gps),
  )
  const itemsSummary = order.items.map((item) => `${item.quantity}x ${item.name}`).join(', ')
  return {
    id: `ride-${Date.now()}`,
    passengerId: order.customerId,
    passengerName: order.customerName,
    passengerPhone: null,
    driverId: null,
    driverName: null,
    pickup,
    dropoff,
    // Normally the medicine subtotal was already settled with the pharmacy
    // online when the customer accepted the quote (see CUSTOMER_ACCEPT_QUOTE)
    // — the driver's own fare is then just the delivery + service fee, same
    // as a normal Pabili errand's fareEstimate never including the cost of
    // the goods themselves. But when online payment wasn't available/working
    // and the customer opted for "driver pays, I reimburse on delivery" (see
    // ActiveOrderCard's cash fallback), paymentMethod is 'cash' and nothing
    // was ever paid to the pharmacy — the driver fronts the medicine cost at
    // pickup, so their fare must include it to be reimbursed in full on
    // delivery, same as Pabili's driver-fronts-the-goods model.
    fareEstimate: order.paymentMethod === 'cash' ? order.total : order.deliveryFee + order.serviceFee,
    status: 'requested',
    requestedAt: new Date().toISOString(),
    acceptedAt: null,
    startedAt: null,
    startedAwayFromPickupMeters: null,
    completedAt: null,
    driverPosition: null,
    passengerPosition: null,
    pickupGps: null,
    driverLiveGps: null,
    driverLiveGpsAt: null,
    passengerLiveGps: null,
    passengerLiveGpsAt: null,
    legProgress: 0,
    locationLog: [],
    paymentMethod: overrides?.paymentMethod ?? order.paymentMethod,
    payment: null,
    isStudentRide: false,
    isPwdSeniorRide: false,
    routeAlert: false,
    deviationOffset: null,
    safetyPhotos: [],
    priorityTodaOrgId,
    priorityQueueOfferedDriverId: offeredDriverId,
    priorityQueueOfferedAt: offeredAt,
    priorityQueueLog: [],
    passengerCount: 1,
    driverRating: null,
    driverReviewText: null,
    todaRating: null,
    todaReviewText: null,
    ratedAt: null,
    // A Registered Vendor's delivery (food, dry goods) is a Pabili errand to
    // the driver — a shopping list to pick up and bring — not a medicine run;
    // it shows with the 🛍️ label and the per-item "bought" checklist, and
    // never the prescription paperwork a pharmacy order carries.
    serviceType: pharmacy.businessType === 'resto_food' || pharmacy.businessType === 'other_commodity' ? 'pabili' : 'buy_medicine',
    pabiliItems: itemsSummary,
    packageNote: null,
    pabiliTip: overrides?.tip ?? 0,
    pabiliServiceFee: order.serviceFee,
    prescriptionDataUrls: order.prescriptionDataUrls,
    seniorIdDataUrl: null,
    otherDocDataUrl: null,
    // The order's own paymentProofDataUrl (uploaded against the medicine
    // subtotal paid to the pharmacy) lives on the MedsOrder, not this Ride —
    // this field is only for the Pabili store-QR flow (see REQUEST_RIDE).
    paymentProofDataUrl: null,
    bookedByParentId: null,
    specialPickupRequested: false,
    specialPickupFee: 0,
    tipOffer: 0,
    paymentAcknowledged: false,
    driverOriginGps: null,
    pendingApproval: null,
    outOfAreaKm: 0,
    outOfAreaFee: 0,
    pabiliBoughtIndexes: [],
    cancelledBy: null,
    cancellationReason: null,
    cancellationNote: null,
    cancelledAt: null,
  }
}

// Everything dispatch needs to rank candidates by distance. Optional
// throughout so a caller with no pickup pin still gets sensible queue-order
// behaviour rather than an error.
interface DispatchContext {
  pickupGps?: GeoCoords | null
  terminals?: Terminal[]
  orgs?: TodaOrganization[]
  // Drivers already on a trip — they are not candidates, however close.
  busyDriverIds?: Set<string>
}

// Finds who should be offered this ride next. Three rules, in order:
//
//   1. The passenger's favourite (or the driver they picked off the nearby
//      list for this booking) gets first crack, if eligible and not already
//      offered-and-passed.
//   2. If the pickup is AT a terminal, the line at that terminal decides —
//      whoever is #1 in the pila, then #2, and so on. This is the rule
//      everyone standing there already agreed to by queueing, and it is not
//      something a few metres of GPS drift should be able to overturn.
//   3. Otherwise — a pickup away from any terminal — the nearest driver
//      wins, counting both queued drivers and members who are online with no
//      passenger. Distance is what the passenger actually waits through.
//
// A Pabili errand pulls the drivers who opted into pabiliPriority to the
// front of whichever order applies, since they have specifically said they
// want first crack at that work. Returns a "nobody left" result once
// everyone is exhausted, which callers treat as an immediate open-to-all
// (see isRideVisibleToDriver in lib/tracking.ts). Whoever is offered and
// does not answer within queueOfferTimeoutMs is passed over and the offer
// moves to the next one down — see skipCurrentOffer.
function nextQueueOffer(
  priorityTodaOrgId: string | null,
  priorityQueueLog: QueueOfferLogEntry[],
  drivers: Driver[],
  favoriteDriverId: string | null = null,
  isPabili = false,
  ctx: DispatchContext = {},
): { offeredDriverId: string | null; offeredAt: string | null } {
  const alreadyOffered = new Set(priorityQueueLog.map((entry) => entry.driverId))
  const favorite = favoriteDriverId ? drivers.find((d) => d.id === favoriteDriverId) : null
  if (
    favorite &&
    !alreadyOffered.has(favorite.id) &&
    favorite.verificationStatus === 'approved' &&
    favorite.accessStatus === 'active'
  ) {
    return { offeredDriverId: favorite.id, offeredAt: new Date().toISOString() }
  }
  if (!priorityTodaOrgId) return { offeredDriverId: null, offeredAt: null }
  const queue = getTodaQueue(priorityTodaOrgId, drivers)
  // Free members come after the queued ones at equal distance: standing in
  // the line should still count for something when neither is closer.
  const free = getFreeTodaDrivers(priorityTodaOrgId, drivers, ctx.busyDriverIds ?? new Set())
  const terminals = ctx.terminals ?? []
  const pickupGps = ctx.pickupGps ?? null
  // Is the passenger standing at a terminal? If so, that terminal's own line
  // is the order — not distance.
  const pickupTerminal = nearestTerminal(terminals, pickupGps)
  const atTerminal =
    pickupTerminal !== null &&
    pickupGps !== null &&
    pickupTerminal.gps !== null &&
    haversineDistanceMeters(pickupTerminal.gps, pickupGps) <= TERMINAL_PROXIMITY_METERS &&
    pickupTerminal.todaOrgId === priorityTodaOrgId
  const byDistance = atTerminal
    ? [
        // getTodaQueue is already oldest-join-first, so filtering it keeps
        // the line intact: #1 at this terminal is offered first, then #2.
        ...queue.filter((d) => d.homeTerminalId === pickupTerminal.id),
        // Then the rest of the TODA, nearest first — a line that runs dry
        // must not strand the booking.
        ...orderByDispatchDistance(
          [...queue.filter((d) => d.homeTerminalId !== pickupTerminal.id), ...free],
          pickupGps,
          terminals,
          ctx.orgs ?? [],
        ),
      ]
    : orderByDispatchDistance([...queue, ...free], pickupGps, terminals, ctx.orgs ?? [])
  // Array.prototype.sort is stable (ES2019+), so this only pulls
  // pabiliPriority drivers ahead — it doesn't disturb the distance order
  // within either group.
  const orderedQueue = isPabili
    ? [...byDistance].sort((a, b) => Number(b.pabiliPriority) - Number(a.pabiliPriority))
    : byDistance
  const next = orderedQueue.find((d) => !alreadyOffered.has(d.id))
  return next ? { offeredDriverId: next.id, offeredAt: new Date().toISOString() } : { offeredDriverId: null, offeredAt: null }
}

// Records that the currently-offered driver passed on this ride (either by
// explicitly declining or by not responding within QUEUE_OFFER_TIMEOUT_MS),
// then advances the offer to whoever's next (favorite, then terminal queue).
function skipCurrentOffer(
  ride: Ride,
  drivers: Driver[],
  outcome: QueueOfferOutcome,
  favoriteDriverId: string | null = null,
  ctx: DispatchContext = {},
): Ride {
  if (!ride.priorityQueueOfferedDriverId) return ride
  const skippedDriver = drivers.find((d) => d.id === ride.priorityQueueOfferedDriverId)
  const logEntry: QueueOfferLogEntry = {
    driverId: ride.priorityQueueOfferedDriverId,
    driverName: skippedDriver?.name ?? 'Driver',
    outcome,
    at: new Date().toISOString(),
  }
  const priorityQueueLog = [...ride.priorityQueueLog, logEntry]
  const { offeredDriverId, offeredAt } = nextQueueOffer(
    ride.priorityTodaOrgId,
    priorityQueueLog,
    drivers,
    favoriteDriverId,
    ride.serviceType !== 'ride',
    { ...ctx, pickupGps: ctx.pickupGps ?? ride.pickup.gps ?? null },
  )
  return { ...ride, priorityQueueLog, priorityQueueOfferedDriverId: offeredDriverId, priorityQueueOfferedAt: offeredAt }
}

// An SOS is escalated to Admin and Super Admin the moment it is raised, so
// it leaves a permanent trace in the log history they both read — not only a
// live banner that disappears once someone resolves it.
// Logged as 'admin' on purpose. ActivityLogActorRole covers the operator
// roles that can change things, and every Log History card filters on
// 'admin' — so that is the shelf this has to sit on to be seen by the people
// it is escalated to. Who actually pressed the button is carried in
// actorName, which is the line the card renders.
function sosLogEntry(originator: string, summary: string, todaOrgId: string | null = null): ActivityLogEntry {
  return {
    id: `actlog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    actorRole: 'admin',
    actorName: originator,
    todaOrgId,
    action: '🆘 Emergency SOS raised',
    summary,
    at: new Date().toISOString(),
  }
}

function makeAlert(
  rideId: string,
  triggeredBy: string,
  type: SosAlertType,
  notes: string,
  guardianNotifiedPhone: string | null = null,
): SosAlert {
  return {
    id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    rideId,
    triggeredBy,
    type,
    status: 'open',
    notes,
    createdAt: new Date().toISOString(),
    guardianNotifiedPhone,
  }
}

// Drivers already committed to a trip. Dispatch skips them: proximity is
// only useful when the driver is actually free to turn towards the pickup.
const BUSY_RIDE_STATUSES: Ride['status'][] = ['accepted', 'driver_arriving', 'ongoing']
function busyDriverIds(rides: Ride[]): Set<string> {
  return new Set(
    rides.filter((r) => r.driverId && BUSY_RIDE_STATUSES.includes(r.status)).map((r) => r.driverId!),
  )
}

// The state a dispatch decision is made against, gathered in one place so
// every call site ranks candidates the same way.
function dispatchCtx(state: RideState, pickupGps: GeoCoords | null) {
  return {
    pickupGps,
    terminals: state.terminals,
    orgs: state.todaOrganizations,
    busyDriverIds: busyDriverIds(state.rides),
  }
}

function reducer(state: RideState, action: RideAction): RideState {
  switch (action.type) {
    case 'REQUEST_RIDE': {
      const priorityTodaOrgId = getPriorityTodaOrgId(action.pickup)
      const { offeredDriverId, offeredAt } = nextQueueOffer(
        priorityTodaOrgId,
        [],
        state.drivers,
        action.requestedDriverId ?? findFavoriteDriverId(state, action.passengerId),
        action.serviceType !== 'ride',
        dispatchCtx(state, action.pickup.gps ?? null),
      )
      const pabiliServiceFee = action.serviceType !== 'ride' ? state.pabiliServiceFee : 0
      // Priced by where the trip starts, and by the TODA answering it if
      // that TODA has its own schedule. See resolveTariff.
      const rideTariff = resolveTariff(
        state.tariffSettings,
        state.cityTariffs,
        state.todaTariffs,
        action.pickup.city,
        priorityTodaOrgId,
      )
      const oneWayFare = estimateFare(action.pickup, action.dropoff, rideTariff, {
        isStudent: action.isStudentRide,
        isPwdSenior: action.isPwdSeniorRide,
        passengerCount: action.passengerCount,
      })
      const baseFare =
        action.serviceType !== 'ride'
          ? errandBaseFare(oneWayFare, state.pabiliFareMode, state.pabiliFixedFare)
          : oneWayFare
      // Special pickup: the driver detours from the terminal to the
      // passenger's exact gps instead of waiting for them there — a
      // one-time detour, charged on its own.
      const terminalGps = getTerminalGps(state.todaOrganizations.find((o) => o.id === priorityTodaOrgId))
      const specialPickupFee = action.specialPickupRequested
        ? estimateSpecialPickupFee(terminalGps, action.pickupGps, rideTariff)
        : 0
      const ride: Ride = {
        id: `ride-${Date.now()}`,
        passengerId: action.passengerId,
        passengerName: action.passengerName,
        passengerPhone: action.passengerPhone,
        driverId: null,
        driverName: null,
        pickup: action.pickup,
        dropoff: action.dropoff,
        fareEstimate: baseFare + pabiliServiceFee + specialPickupFee,
        status: 'requested' as RideStatus,
        requestedAt: new Date().toISOString(),
        acceptedAt: null,
        startedAt: null,
        startedAwayFromPickupMeters: null,
        completedAt: null,
        driverPosition: null,
        passengerPosition: null,
        pickupGps: action.pickupGps,
        driverLiveGps: null,
        driverLiveGpsAt: null,
        passengerLiveGps: null,
        passengerLiveGpsAt: null,
        legProgress: 0,
        locationLog: [],
        paymentMethod: action.paymentMethod,
        payment: null,
        isStudentRide: action.isStudentRide,
        isPwdSeniorRide: action.isPwdSeniorRide,
        routeAlert: false,
        deviationOffset: null,
        safetyPhotos: action.initialPhotos,
        priorityTodaOrgId,
        priorityQueueOfferedDriverId: offeredDriverId,
        priorityQueueOfferedAt: offeredAt,
        priorityQueueLog: [],
        passengerCount: action.passengerCount,
        driverRating: null,
        driverReviewText: null,
        todaRating: null,
        todaReviewText: null,
        ratedAt: null,
        serviceType: action.serviceType,
        pabiliItems: action.serviceType !== 'ride' ? action.pabiliItems : null,
        packageNote: action.serviceType === 'padala' ? action.packageNote : null,
        pabiliTip: action.serviceType !== 'ride' ? action.tip : 0,
        pabiliServiceFee,
        prescriptionDataUrls: action.serviceType === 'buy_medicine' ? action.prescriptionDataUrls : [],
        seniorIdDataUrl: action.serviceType === 'buy_medicine' ? action.seniorIdDataUrl : null,
        otherDocDataUrl: action.serviceType === 'buy_medicine' ? action.otherDocDataUrl : null,
        paymentProofDataUrl: action.paymentProofDataUrl,
        bookedByParentId: action.bookedByParentId,
        specialPickupRequested: action.specialPickupRequested,
        specialTrip: action.specialTrip,
        bookedAtTerminal: action.bookedAtTerminal,
        destinationPending: action.destinationPending,
        specialPickupFee,
        tipOffer: 0,
        paymentAcknowledged: false,
        driverOriginGps: null,
    pendingApproval: null,
    outOfAreaKm: 0,
    outOfAreaFee: 0,
    pabiliBoughtIndexes: [],
        cancelledBy: null,
        cancellationReason: null,
        cancellationNote: null,
        cancelledAt: null,
      }
      // Already aboard, already moving. Putting this through 'requested'
      // would ask a passenger halfway down the highway to wait for a driver
      // to accept a ride he is currently giving them — and would show the
      // family watching a tricycle setting out to fetch someone it is
      // already carrying.
      const boardedDriver = action.boardedWithDriverId
        ? state.drivers.find((d) => d.id === action.boardedWithDriverId)
        : null
      // A plate with no account behind it still gets recorded.
      //
      // Not every tricycle on the road is registered here, and a passenger
      // riding in an unregistered one is exactly who most needs somebody to
      // know where they are. There is no driver phone to compare movement
      // against, so this can never start by itself — the passenger asked
      // for it by typing the plate, which is consent enough and the only
      // signal available.
      const boardedAtAll = !!boardedDriver || !!action.unregisteredPlate
      const recorded: Ride = boardedAtAll
        ? {
            ...ride,
            status: 'ongoing' as RideStatus,
            driverId: boardedDriver?.id ?? null,
            driverName:
              boardedDriver?.name ?? `TRC ${action.unregisteredPlate} — hindi rehistrado`,
            unregisteredPlate: boardedDriver ? null : action.unregisteredPlate,
            acceptedAt: new Date().toISOString(),
            startedAt: new Date().toISOString(),
            // Not on the way to the pickup — past it. The pickup is where
            // they got in, which is behind them.
            legProgress: 1,
            safetyRecord: true,
          }
        : ride
      return {
        ...state,
        rides: [recorded, ...state.rides],
        // Driving, so no longer waiting in the terminal line — the same
        // move ACCEPT_RIDE makes, for the same reason.
        drivers: boardedDriver
          ? state.drivers.map((d) => (d.id === boardedDriver.id ? { ...d, queueJoinedAt: null } : d))
          : state.drivers,
      }
    }
    case 'REQUEST_GROUP_RIDE': {
      const groupBookingId = `group-${Date.now()}`
      const priorityTodaOrgId = getPriorityTodaOrgId(action.pickup)
      // One offer for the whole group, not one per rider — they're boarding
      // the same tricycle, so a different driver picking up each of them
      // would defeat the point of booking together.
      const { offeredDriverId, offeredAt } = nextQueueOffer(
        priorityTodaOrgId,
        [],
        state.drivers,
        action.requestedDriverId ?? findFavoriteDriverId(state, action.bookedByPassengerId),
        false,
        dispatchCtx(state, action.pickup.gps ?? null),
      )
      const groupTariff = resolveTariff(
        state.tariffSettings,
        state.cityTariffs,
        state.todaTariffs,
        action.pickup.city,
        priorityTodaOrgId,
      )
      const fares = action.riders.map((r) =>
        estimateFare(action.pickup, r.dropoff, groupTariff, {
          isStudent: r.isStudentRide,
          isPwdSenior: r.isPwdSeniorRide,
          passengerCount: 1,
        }),
      )
      const totalFare = fares.reduce((sum, f) => sum + f, 0)
      const newRides: Ride[] = action.riders.map((r, i) => {
        const isBookerPays = action.paySplit === 'booker'
        const isPayer = isBookerPays && r.passengerId === action.bookedByPassengerId
        return {
          id: `ride-${Date.now()}-${i}`,
          passengerId: r.passengerId,
          passengerName: r.passengerName,
          passengerPhone: r.passengerPhone,
          driverId: null,
          driverName: null,
          pickup: action.pickup,
          dropoff: r.dropoff,
          fareEstimate: isBookerPays ? (isPayer ? totalFare : 0) : fares[i],
          status: 'requested' as RideStatus,
          requestedAt: new Date().toISOString(),
          acceptedAt: null,
          startedAt: null,
          startedAwayFromPickupMeters: null,
          completedAt: null,
          driverPosition: null,
          passengerPosition: null,
          pickupGps: action.pickupGps,
          driverLiveGps: null,
          driverLiveGpsAt: null,
          passengerLiveGps: null,
          passengerLiveGpsAt: null,
          legProgress: 0,
          locationLog: [],
          paymentMethod: action.paymentMethod,
          payment: null,
          isStudentRide: r.isStudentRide,
          isPwdSeniorRide: r.isPwdSeniorRide,
          routeAlert: false,
          deviationOffset: null,
          safetyPhotos: [],
          priorityTodaOrgId,
          priorityQueueOfferedDriverId: offeredDriverId,
          priorityQueueOfferedAt: offeredAt,
          priorityQueueLog: [],
          passengerCount: 1,
          driverRating: null,
          driverReviewText: null,
          todaRating: null,
          todaReviewText: null,
          ratedAt: null,
          serviceType: 'ride',
          pabiliItems: null,
          packageNote: null,
          pabiliTip: 0,
          pabiliServiceFee: 0,
          prescriptionDataUrls: [],
          seniorIdDataUrl: null,
          otherDocDataUrl: null,
          paymentProofDataUrl: null,
          bookedByParentId: null,
          groupBookingId,
          groupPayerId: isBookerPays ? action.bookedByPassengerId : null,
          specialPickupRequested: false,
          specialTrip: false,
          bookedAtTerminal: false,
          destinationPending: false,
          specialPickupFee: 0,
          tipOffer: 0,
          paymentAcknowledged: false,
          driverOriginGps: null,
          pendingApproval: null,
          outOfAreaKm: 0,
          outOfAreaFee: 0,
          pabiliBoughtIndexes: [],
          cancelledBy: null,
          cancellationReason: null,
          cancellationNote: null,
          cancelledAt: null,
        }
      })
      return { ...state, rides: [...newRides, ...state.rides] }
    }
    // A driver taking the ride, from wherever they actually are. The ride is
    // theirs on the spot.
    //
    // This used to be an offer: nothing was assigned until the passenger
    // approved the fare it produced, because a driver parked two towns over
    // adds an out-of-area fee to a trip that was quoted without one. The
    // protection was real and the cost of it was worse — every acceptance
    // stopped dead waiting for someone to look at their phone, and a
    // passenger who has just booked a tricycle and been told one is coming
    // does not expect to be asked a second question before it sets off. Most
    // acceptances add nothing at all: the driver is inside the area and the
    // approval card exists only to say the fare has not changed.
    //
    // The fee still applies and is still itemised in the fare breakdown, so
    // nothing is hidden — it is shown rather than asked. A passenger who does
    // not want it can still cancel, which is the same answer declining gave
    // them, one step later.
    case 'DRIVER_PROPOSE_ACCEPT': {
      const ride = state.rides.find((r) => r.id === action.rideId)
      const driver = state.drivers.find((d) => d.id === action.driverId)
      if (!ride || !driver || ride.status !== 'requested' || ride.pendingApproval) return state
      const terminalGps = getTerminalGps(state.todaOrganizations.find((o) => o.id === ride.priorityTodaOrgId))
      const area = estimateOutOfAreaBreakdown(action.originGps, terminalGps, state.todaRadiusKm, state.outOfAreaPerKm)
      return {
        ...state,
        rides: state.rides.map((r) =>
          r.id === action.rideId
            ? {
                ...r,
                status: 'driver_arriving',
                driverId: action.driverId,
                driverName: driver.name,
                acceptedAt: new Date().toISOString(),
                driverPosition: DRIVER_BASE_COORDS,
                passengerPosition: r.pickup.coords,
                legProgress: 0,
                driverOriginGps: action.originGps,
                passengerDeclinedFare: false,
                fareEstimate: r.fareEstimate + area.fee,
                outOfAreaKm: Number(area.extraKm.toFixed(2)),
                outOfAreaFee: area.fee,
                pendingApproval: null,
              }
            : r,
        ),
        // Their turn in the terminal queue is spent — the same bookkeeping
        // the approval step used to do.
        drivers: state.drivers.map((d) => (d.id === action.driverId ? { ...d, queueJoinedAt: null } : d)),
      }
    }
    // The passenger agrees to the quoted total, and only now does the ride
    // become this driver's.
    case 'PASSENGER_APPROVE_FARE': {
      const ride = state.rides.find((r) => r.id === action.rideId)
      if (!ride?.pendingApproval) return state
      const offer = ride.pendingApproval
      return {
        ...state,
        rides: state.rides.map((r) =>
          r.id === action.rideId
            ? {
                ...r,
                status: 'driver_arriving',
                driverId: offer.driverId,
                driverName: offer.driverName,
                acceptedAt: new Date().toISOString(),
                driverPosition: DRIVER_BASE_COORDS,
                passengerPosition: r.pickup.coords,
                legProgress: 0,
                fareEstimate: offer.fareAfter,
                outOfAreaKm: offer.outOfAreaKm,
                outOfAreaFee: offer.outOfAreaFee,
                pendingApproval: null,
              }
            : r,
        ),
        drivers: state.drivers.map((d) => (d.id === offer.driverId ? { ...d, queueJoinedAt: null } : d)),
      }
    }
    // Turning the fare down is not turning the ride down: the request goes
    // back out, minus this driver, who has already had their answer.
    case 'PASSENGER_DECLINE_FARE': {
      const ride = state.rides.find((r) => r.id === action.rideId)
      if (!ride?.pendingApproval) return state
      const declinedId = ride.pendingApproval.driverId
      return {
        ...state,
        rides: state.rides.map((r) => {
          if (r.id !== action.rideId) return r
          const cleared = {
            ...r,
            pendingApproval: null,
            driverOriginGps: null,
            passengerDeclinedFare: true,
            declinedByDriverIds: (r.declinedByDriverIds ?? []).includes(declinedId)
              ? r.declinedByDriverIds
              : [...(r.declinedByDriverIds ?? []), declinedId],
          }
          // Hand the offer straight to the next candidate rather than
          // leaving it parked on the driver the passenger just refused.
          return skipCurrentOffer(
            cleared,
            state.drivers,
            'declined',
            findFavoriteDriverId(state, r.passengerId),
            dispatchCtx(state, r.pickup.gps ?? null),
          )
        }),
      }
    }
    // A new terminal. The id is the operator's own code and has to be unique
    // — two CLSU-02s on a radio is worse than none.
    case 'ADD_TERMINAL': {
      const id = action.terminal.id.trim()
      if (!id || state.terminals.some((t) => t.id.toLowerCase() === id.toLowerCase())) return state
      return { ...state, terminals: [...state.terminals, { ...action.terminal, id }] }
    }
    case 'REMOVE_TERMINAL':
      return { ...state, terminals: state.terminals.filter((t) => t.id !== action.terminalId) }
    // A landmark a TODA admin has pinned — same uniqueness rule as a
    // terminal, for the same reason.
    case 'ADD_LANDMARK': {
      const id = action.landmark.id.trim()
      if (!id || state.landmarks.some((l) => l.id.toLowerCase() === id.toLowerCase())) return state
      return { ...state, landmarks: [...state.landmarks, { ...action.landmark, id }] }
    }
    case 'REMOVE_LANDMARK':
      return {
        ...state,
        landmarks: state.landmarks.filter((l) => l.id !== action.landmarkId),
        // Only a seed-originated id needs tombstoning — a landmark an admin
        // added themselves was never going to be re-healed in anyway.
        deletedLandmarkIds: MOCK_LANDMARKS.some((l) => l.id === action.landmarkId)
          ? [...new Set([...state.deletedLandmarkIds, action.landmarkId])]
          : state.deletedLandmarkIds,
      }
    // A seeded landmark's pin dragged to where it actually belongs — same
    // move as SET_TERMINAL_GPS, for the same reason.
    case 'SET_LANDMARK_GPS':
      return {
        ...state,
        landmarks: state.landmarks.map((l) => (l.id === action.landmarkId ? { ...l, gps: action.gps } : l)),
      }
    // Name/category/aliases/gps edited together from the admin panel's Save
    // — id stays fixed so nothing that already points at this landmark
    // (a search result cache, a past ride's destination) breaks.
    case 'UPDATE_LANDMARK':
      return {
        ...state,
        landmarks: state.landmarks.map((l) =>
          l.id === action.landmarkId ? { ...action.landmark, id: l.id } : l,
        ),
      }
    // Where the gate actually is, as placed on a map by someone who knows.
    case 'SET_TERMINAL_GPS':
      return {
        ...state,
        terminals: state.terminals.map((t) => (t.id === action.terminalId ? { ...t, gps: action.gps } : t)),
      }
    case 'SET_TERMINAL_ACTIVE':
      return {
        ...state,
        terminals: state.terminals.map((t) =>
          t.id === action.terminalId ? { ...t, isActive: action.isActive } : t,
        ),
      }
    case 'SET_TODA_RADIUS_KM':
      return { ...state, todaRadiusKm: Math.max(0, Number(action.km) || 0) }
    case 'SET_OUT_OF_AREA_PER_KM':
      return { ...state, outOfAreaPerKm: Math.max(0, Math.round(action.amount)) }
    case 'REPORT_DRIVER_GPS':
      // Where this tricycle is right now, published by the driver's own phone
      // while they are on duty. Before this existed the only position a
      // driver had was the one written when they joined the terminal queue,
      // which meant a tricycle halfway across town still showed as parked at
      // the rank — and meant the boarding rule, which asks whether a tricycle
      // moved with the passenger, was comparing against a point that could
      // not move.
      return {
        ...state,
        drivers: state.drivers.map((d) =>
          d.id === action.driverId
            ? { ...d, lastKnownGps: action.gps, lastKnownGpsAt: new Date().toISOString() }
            : d,
        ),
      }
    case 'ACCEPT_RIDE': {
      const driver = state.drivers.find((d) => d.id === action.driverId)
      return {
        ...state,
        rides: state.rides.map((r) =>
          r.id === action.rideId
            ? {
                ...r,
                status: 'driver_arriving',
                driverId: action.driverId,
                driverName: driver?.name ?? 'Driver',
                acceptedAt: new Date().toISOString(),
                driverPosition: DRIVER_BASE_COORDS,
                passengerPosition: r.pickup.coords,
                legProgress: 0,
              }
            : r,
        ),
        // Accepting a ride takes the driver off the terminal queue — busy
        // driving, not waiting in line — until COMPLETE_RIDE puts them
        // back at the end of the line.
        drivers: state.drivers.map((d) => (d.id === action.driverId ? { ...d, queueJoinedAt: null } : d)),
      }
    }
    case 'DECLINE_RIDE':
      // Two separate things happen on a decline, and they used to be one.
      //
      // The queue skip still only applies to the driver currently "up" —
      // passing the offer to the next in line is a terminal-queue move, not a
      // whole-ride cancellation.
      //
      // Recording WHO declined is unconditional, though. Without it, a driver
      // declining an open-to-all ride changed nothing at all and the request
      // stayed sitting in their list.
      return {
        ...state,
        rides: state.rides.map((r) => {
          if (r.id !== action.rideId) return r
          const declinedBy = r.declinedByDriverIds ?? []
          const withDecline = {
            ...r,
            declinedByDriverIds: declinedBy.includes(action.driverId)
              ? declinedBy
              : [...declinedBy, action.driverId],
          }
          return r.priorityQueueOfferedDriverId === action.driverId
            ? skipCurrentOffer(
                withDecline,
                state.drivers,
                'declined',
                findFavoriteDriverId(state, r.passengerId),
                dispatchCtx(state, r.pickup.gps ?? null),
              )
            : withDecline
        }),
      }
    // The trip starts where the driver actually is.
    //
    // The pickup pin is a guess made before anybody set off — typed into an
    // address form, or tapped on a map at a zoom where a finger covers a
    // block. The driver standing beside the passenger with a GPS fix is not a
    // guess, and when the two disagree the fix is the one telling the truth.
    // A pin a couple of kilometres out used to hold the whole trip: Start
    // stayed locked, the ride never became 'ongoing', and everything that
    // hangs off that — the passenger's own dot, the heading-up camera, the
    // tricycle advancing along the route — never happened either. One bad
    // coordinate, and the app looked completely dead.
    //
    // So the coordinate is corrected here rather than argued with. The booked
    // label is left alone: it is what the passenger asked for and what any
    // dispute will be read against. Only the point on the map moves, and how
    // far it moved is recorded beside it.
    case 'START_RIDE':
      return {
        ...state,
        rides: state.rides.map((r) => {
          if (r.id !== action.rideId) return r
          const movedMeters =
            action.driverGps && r.pickup.gps
              ? Math.round(haversineDistanceMeters(action.driverGps, r.pickup.gps))
              : null
          return {
            ...r,
            status: 'ongoing',
            startedAt: new Date().toISOString(),
            pickup: action.driverGps ? { ...r.pickup, gps: action.driverGps } : r.pickup,
            startedAwayFromPickupMeters: movedMeters,
            driverPosition: r.pickup.coords,
            passengerPosition: null,
            legProgress: 0,
            routeAlert: false,
            deviationOffset: null,
          }
        }),
      }
    case 'CLEAR_ALL_RIDES':
      // Rides and their alerts only. Accounts, TODAs, settings and everything
      // else a demo depends on stay exactly as they are — this is a reset of
      // the run, not of the app.
      return { ...state, rides: [], alerts: [] }
    case 'PASSENGER_CONFIRM_ARRIVAL':
      return {
        ...state,
        rides: state.rides.map((r) =>
          r.id === action.rideId
            ? {
                ...r,
                // Kept, not restamped: the label upgrade below dispatches a
                // second time once reverse geocoding answers.
                passengerArrivedAt: r.passengerArrivedAt ?? new Date().toISOString(),
                actualDropoff: action.actualDropoff ?? r.actualDropoff ?? null,
              }
            : r,
        ),
      }
    case 'COMPLETE_RIDE': {
      // For cash rides, the driver already confirmed receipt in the UI
      // before this fires (see ActiveTripCard); e-wallet/card rides settle
      // automatically. Either way, by the time this action reaches the
      // reducer the fare is considered paid.
      const ride = state.rides.find((r) => r.id === action.rideId)
      if (!ride) return state
      const drivingDriver = state.drivers.find((d) => d.id === ride.driverId)
      const drivingDriverToda = drivingDriver?.todaOrgId
        ? state.todaOrganizations.find((o) => o.id === drivingDriver.todaOrgId)
        : null
      // Platform fee and TODA commission only ever apply to the base fare —
      // a tip is the passenger's to give and goes to the driver in full.
      // No app fee on a terminal-QR ride: the platform did not find this
      // passenger a driver, they were already sitting in the tricycle.
      // A safety record is charged on the same terms as a terminal booking:
      // in both the app found nobody a driver, they were already sitting in
      // the tricycle. Whether that is free is the operator's decision, held
      // in one toggle.
      //
      // It matters that this is the SAME toggle the passenger-facing label
      // reads. The label promises "no charge" only when this is on, so the
      // two can never disagree — and a promise on the button that the
      // receipt then breaks is worse than charging openly.
      // What the driver is actually paid for. On a cash-on-delivery vendor
      // order the fare is the whole order total — the driver paid the store
      // for the goods and is repaid at the door — so only the fee part is
      // earnings; the goods pass straight through. (See codBreakdown in
      // lib/vendorOrders, which the driver's screens use for the same split.)
      // The payment's amount below stays the full sum that changed hands.
      const codOrder =
        ride.paymentMethod === 'cash'
          ? state.medsOrders.find((o) => o.linkedRideId === ride.id && o.paymentMethod === 'cash')
          : undefined
      const earnedFare = codOrder ? codOrder.deliveryFee + codOrder.serviceFee : ride.fareEstimate
      const platformFee =
        (ride.bookedAtTerminal || ride.safetyRecord) && state.terminalQrFeeWaived
          ? 0
          : Math.min(earnedFare, state.commissionPerRide)
      const todaCommission = Math.min(
        Math.max(0, earnedFare - platformFee),
        getActiveTodaCommission(drivingDriverToda),
      )
      const totalTip = ride.pabiliTip + (ride.tipOffer || 0)
      const driverPayout = Math.max(0, earnedFare - platformFee - todaCommission) + totalTip
      return {
        ...state,
        rides: state.rides.map((r) =>
          r.id === action.rideId
            ? {
                ...r,
                status: 'completed',
                completedAt: new Date().toISOString(),
                // What the driver marked as actually received, falling back
                // to the booked method when nothing was marked.
                paymentMethod: action.paidMethod ?? r.paymentMethod,
                payment: {
                  method: action.paidMethod ?? r.paymentMethod,
                  status: 'paid',
                  referenceNo: (action.paidMethod ?? r.paymentMethod) === 'cash' ? null : generateReferenceNo(),
                  amount: r.fareEstimate + totalTip,
                  driverPayout,
                  platformFee,
                  todaCommission,
                  tip: totalTip,
                  paidAt: new Date().toISOString(),
                },
              }
            : r,
        ),
        // Driver returns to the back of their TODA's terminal queue after
        // dropping off the passenger — the same "go to the end of the
        // line" rule as any real terminal. No-op for freelancers.
        drivers: state.drivers.map((d) =>
          d.id === ride.driverId && d.todaOrgId !== null ? { ...d, queueJoinedAt: new Date().toISOString() } : d,
        ),
      }
    }
    // Ticking an item off the shopping list, one at a time — the driver is
    // standing in the store doing exactly that.
    case 'SET_PABILI_ITEM_BOUGHT': {
      return {
        ...state,
        rides: state.rides.map((r) => {
          if (r.id !== action.rideId) return r
          const without = r.pabiliBoughtIndexes.filter((i) => i !== action.index)
          return { ...r, pabiliBoughtIndexes: action.bought ? [...without, action.index] : without }
        }),
      }
    }
    case 'CANCEL_RIDE':
      return {
        ...state,
        rides: state.rides.map((r) =>
          r.id === action.rideId
            ? { ...r, status: 'cancelled', cancelledBy: 'passenger', cancelledAt: new Date().toISOString() }
            : r,
        ),
      }
    // A ride the driver had already taken on and could not complete. Refused
    // once the trip is over: a finished ride is a record, not something to
    // reach back and undo.
    case 'DRIVER_CANCEL_RIDE': {
      const ride = state.rides.find((r) => r.id === action.rideId)
      if (!ride || ride.status === 'completed' || ride.status === 'cancelled') return state
      return {
        ...state,
        rides: state.rides.map((r) =>
          r.id === action.rideId
            ? {
                ...r,
                status: 'cancelled',
                cancelledBy: 'driver',
                cancellationReason: action.reason,
                cancellationNote: action.note,
                cancelledAt: new Date().toISOString(),
              }
            : r,
        ),
      }
    }
    case 'ADD_TIP_OFFER':
      if (action.amount <= 0) return state
      return {
        ...state,
        // Only meaningful while still waiting for a driver — a no-op once
        // one's already been offered/accepted, so a stale UI click can't
        // retroactively sweeten an already-settled ride.
        rides: state.rides.map((r) =>
          r.id === action.rideId && r.status === 'requested'
            ? { ...r, tipOffer: (r.tipOffer || 0) + action.amount }
            : r,
        ),
      }
    case 'ACKNOWLEDGE_RIDE_PAYMENT':
      // Only meaningful once the trip has actually ended — the payment
      // method stays locked in while a ride is still requested/en
      // route/ongoing (see TripMonitor's disabled buttons), so this is a
      // no-op against a stale click on a ride that isn't 'completed' yet.
      return {
        ...state,
        rides: state.rides.map((r) =>
          r.id === action.rideId && r.status === 'completed'
            ? {
                ...r,
                paymentMethod: action.method,
                payment: r.payment
                  ? {
                      ...r.payment,
                      method: action.method,
                      // Cash has no reference; an e-wallet's is what the
                      // driver reconciles against, so it is kept rather
                      // than overwritten with null on a later re-tap.
                      referenceNo: action.referenceNo ?? r.payment.referenceNo,
                    }
                  : r.payment,
                paymentAcknowledged: true,
              }
            : r,
        ),
      }
    case 'TICK_POSITIONS': {
      let changed = false
      const newAlerts: SosAlert[] = []
      const rides = state.rides.map((r) => {
        // Both of the below are pure simulation, so both stop when Super
        // Admin turns movement simulation off for a real road test — the
        // map then reflects only genuine GPS. The queue-offer timeout
        // further down is NOT gated: that's real dispatch behaviour and has
        // to keep running either way.
        const isDriverMoving =
          state.simulateMovementEnabled &&
          (r.status === 'driver_arriving' || r.status === 'ongoing') &&
          r.legProgress < 1
        // Passenger's simulated phone GPS keeps wobbling while they wait to
        // be picked up, even after the driver's own leg progress hits 100%
        // (arrived but trip not started yet).
        const isPassengerWaiting =
          state.simulateMovementEnabled && r.status === 'driver_arriving' && r.passengerPosition
        // The driver currently up in the terminal queue didn't respond in
        // time — treat it the same as an explicit decline and pass the
        // offer to the next driver in line.
        const isQueueOfferStale =
          r.status === 'requested' &&
          !r.pendingApproval &&
          r.priorityQueueOfferedDriverId !== null &&
          r.priorityQueueOfferedAt !== null &&
          Date.now() - new Date(r.priorityQueueOfferedAt).getTime() >= state.queueOfferTimeoutMs
        if (!isDriverMoving && !isPassengerWaiting && !isQueueOfferStale) return r
        changed = true

        let next = r

        if (isQueueOfferStale) {
          next = skipCurrentOffer(
            next,
            state.drivers,
            'timeout',
            findFavoriteDriverId(state, r.passengerId),
            dispatchCtx(state, r.pickup.gps ?? null),
          )
        }

        if (isDriverMoving) {
          const perTick = TICK_INTERVAL_MS / (Math.max(4, state.tripLegSeconds) * 1000)
          const nextProgress = Math.min(1, r.legProgress + perTick)

          let deviationOffset = r.deviationOffset
          let routeAlert = r.routeAlert
          if (r.status === 'ongoing' && r.isStudentRide && !routeAlert && Math.random() < DEVIATION_CHANCE_PER_TICK) {
            deviationOffset = randomOffset()
            routeAlert = true
            newAlerts.push(
              makeAlert(
                r.id,
                r.passengerId,
                'route_deviation',
                `${r.passengerName}'s trip drifted off the expected route between ${r.pickup.label} and ${r.dropoff.label}.`,
              ),
            )
          }

          const basePosition = lerp(legOrigin(r), legDestination(r), nextProgress)
          const position = deviationOffset
            ? { x: clampToMap(basePosition.x + deviationOffset.x), y: clampToMap(basePosition.y + deviationOffset.y) }
            : basePosition
          const ping = { ts: new Date().toISOString(), coords: position }
          next = {
            ...next,
            legProgress: nextProgress,
            driverPosition: position,
            locationLog: [...next.locationLog, ping].slice(-MAX_LOG_ENTRIES),
            routeAlert,
            deviationOffset,
          }
        }

        if (isPassengerWaiting && next.passengerPosition) {
          next = {
            ...next,
            passengerPosition: {
              x: clampToMap(next.passengerPosition.x + (Math.random() - 0.5) * 2 * PASSENGER_JITTER_STEP),
              y: clampToMap(next.passengerPosition.y + (Math.random() - 0.5) * 2 * PASSENGER_JITTER_STEP),
            },
          }
        }

        return next
      })
      // Also re-render while any ride is still waiting on a driver, so the
      // TODA-priority countdown ("opens to others in Xs") ticks down live
      // even when nothing else in the app is animating right now.
      const hasWaitingRides = state.rides.some((r) => r.status === 'requested')
      if (!changed && !hasWaitingRides) return state
      return { ...state, rides, alerts: newAlerts.length ? [...newAlerts, ...state.alerts] : state.alerts }
    }
    case 'UPDATE_DRIVER_LIVE_GPS':
      return {
        ...state,
        rides: state.rides.map((r) =>
          r.id === action.rideId
            ? { ...r, driverLiveGps: action.gps, driverLiveGpsAt: action.gps ? new Date().toISOString() : null }
            : r,
        ),
      }
    case 'UPDATE_PASSENGER_LIVE_GPS':
      return {
        ...state,
        rides: state.rides.map((r) =>
          r.id === action.rideId
            ? { ...r, passengerLiveGps: action.gps, passengerLiveGpsAt: action.gps ? new Date().toISOString() : null }
            : r,
        ),
      }
    case 'TRIGGER_SOS': {
      const ride = state.rides.find((r) => r.id === action.rideId)
      if (!ride) return state
      // No linked parent account to alert in-app? Fall back to whatever
      // guardian/emergency contact number this passenger registered.
      // A link the guardian has not consented to is not yet someone who is
      // watching the app, so their number stays the fallback until they are.
      const hasConsentedParent = state.parentLinks.some(
        (l) => l.studentPassengerId === ride.passengerId && l.consentGiven,
      )
      const passenger = state.passengers.find((p) => p.id === ride.passengerId)
      const guardianPhone = !hasConsentedParent ? (passenger?.guardianPhone ?? null) : null
      const notes = guardianPhone
        ? `SOS triggered on ${ride.passengerName}'s trip (${ride.pickup.label} → ${ride.dropoff.label}). No confirmed parent account — emergency contact notified at ${guardianPhone}.`
        : `SOS triggered on ${ride.passengerName}'s trip (${ride.pickup.label} → ${ride.dropoff.label}).`
      // Pressed again while the first is still open: one incident, one more
      // line in its log — not a second alert for the same emergency.
      const already = state.alerts.find((a) => a.rideId === action.rideId && a.type === 'sos' && isActiveAlert(a))
      if (already) {
        return {
          ...state,
          alerts: state.alerts.map((a) =>
            a.id === already.id ? appendEvent(a, 'repeat_press', `SOS pressed again by ${ride.passengerName}`, ride.passengerName, 'passenger') : a,
          ),
        }
      }
      const source: SosTriggerSource = action.source ?? 'passenger'
      const alert = buildIncident({
        base: { ...makeAlert(action.rideId, action.triggeredBy, 'sos', notes, guardianPhone), triggeredByRole: 'passenger', location: action.location ?? ride.passengerLiveGps ?? ride.driverLiveGps ?? null },
        source,
        ride,
        passenger: passenger ?? null,
        driver: null,
        drivers: state.drivers,
        parentLinks: state.parentLinks,
        settings: state.safetySettings,
      })
      return {
        ...state,
        alerts: [alert, ...state.alerts],
        activityLog: [
          sosLogEntry(`Passenger — ${ride.passengerName}`, notes),
          ...state.activityLog,
        ].slice(0, MAX_ACTIVITY_LOG_ENTRIES),
      }
    }
    case 'TRIGGER_PASSENGER_SOS': {
      const pax = state.passengers.find((p) => p.id === action.passengerId)
      if (!pax) return state
      const notes = action.notes?.trim() || `${pax.name} triggered an emergency SOS before boarding.`
      const alreadyPax = state.alerts.find((a) => a.triggeredBy === action.passengerId && !a.rideId && a.type === 'sos' && isActiveAlert(a))
      if (alreadyPax) {
        return {
          ...state,
          alerts: state.alerts.map((a) => (a.id === alreadyPax.id ? appendEvent(a, 'repeat_press', `SOS pressed again by ${pax.name}`, pax.name, 'passenger') : a)),
        }
      }
      const alert: SosAlert = buildIncident({
        base: {
          id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          rideId: null,
          triggeredBy: action.passengerId,
          type: 'sos',
          status: 'open',
          notes,
          createdAt: new Date().toISOString(),
          guardianNotifiedPhone: null,
          triggeredByRole: 'passenger',
          todaOrgId: null,
          location: action.location,
        },
        source: 'passenger',
        ride: null,
        passenger: pax,
        driver: null,
        drivers: state.drivers,
        parentLinks: state.parentLinks,
        settings: state.safetySettings,
      })
      return {
        ...state,
        alerts: [alert, ...state.alerts],
        activityLog: [
          sosLogEntry(`Passenger — ${pax.name}`, notes, null),
          ...state.activityLog,
        ].slice(0, MAX_ACTIVITY_LOG_ENTRIES),
      }
    }
    case 'TRIGGER_DRIVER_SOS': {
      const driver = state.drivers.find((d) => d.id === action.driverId)
      if (!driver) return state
      const notes = action.notes?.trim() || `${driver.name} (${driver.plateNumber}) triggered an emergency SOS.`
      const alreadyDrv = state.alerts.find((a) => a.triggeredBy === action.driverId && a.triggeredByRole === 'driver' && a.type === 'sos' && isActiveAlert(a))
      if (alreadyDrv) {
        return {
          ...state,
          alerts: state.alerts.map((a) => (a.id === alreadyDrv.id ? appendEvent(a, 'repeat_press', `SOS pressed again by ${driver.name}`, driver.name, 'driver') : a)),
        }
      }
      // The trip the driver is on right now, if any — copied onto the record
      // and used to tell the passenger in that seat.
      const driverRide =
        state.rides.find((r) => r.driverId === driver.id && (r.status === 'driver_arriving' || r.status === 'ongoing' || r.status === 'accepted')) ?? null
      const alert: SosAlert = buildIncident({
        base: {
          id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          rideId: null,
          triggeredBy: action.driverId,
          type: 'sos',
          status: 'open',
          notes,
          createdAt: new Date().toISOString(),
          guardianNotifiedPhone: null,
          triggeredByRole: 'driver',
          todaOrgId: driver.todaOrgId,
          location: action.location ?? driver.lastKnownGps ?? null,
        },
        source: action.source ?? 'driver',
        ride: driverRide,
        passenger: driverRide ? state.passengers.find((p) => p.id === driverRide.passengerId) ?? null : null,
        driver,
        drivers: state.drivers,
        parentLinks: state.parentLinks,
        settings: state.safetySettings,
      })
      return {
        ...state,
        alerts: [alert, ...state.alerts],
        activityLog: [
          sosLogEntry(`Driver — ${driver.name} (${driver.plateNumber})`, notes, driver.todaOrgId),
          ...state.activityLog,
        ].slice(0, MAX_ACTIVITY_LOG_ENTRIES),
      }
    }
    case 'RESOLVE_ALERT':
      return {
        ...state,
        alerts: state.alerts.map((a) =>
          a.id === action.alertId ? transitionAlert(a, 'resolved', action.actorName ?? 'Admin', action.actorRole ?? 'admin', action.notes) : a,
        ),
      }
    case 'ACKNOWLEDGE_ALERT':
      return {
        ...state,
        alerts: state.alerts.map((a) => (a.id === action.alertId ? transitionAlert(a, 'acknowledged', action.actorName, action.actorRole) : a)),
      }
    case 'SET_ALERT_RESPONDING':
      return {
        ...state,
        alerts: state.alerts.map((a) => (a.id === action.alertId ? transitionAlert(a, 'responding', action.actorName, action.actorRole) : a)),
      }
    case 'CANCEL_ALERT':
      return {
        ...state,
        alerts: state.alerts.map((a) => (a.id === action.alertId ? transitionAlert(a, 'cancelled', action.actorName, action.actorRole, action.notes) : a)),
      }
    case 'LOG_ALERT_EVENT':
      return {
        ...state,
        alerts: state.alerts.map((a) => (a.id === action.alertId ? appendEvent(a, action.kind, action.summary, action.actorName, action.actorRole) : a)),
      }
    case 'SET_NOTIFICATION_STATUS':
      return {
        ...state,
        alerts: state.alerts.map((a) =>
          a.id === action.alertId ? markNotificationDelivery(a, action.notificationId, action.status, action.note, action.actorName) : a,
        ),
      }
    case 'SET_SAFETY_SETTINGS':
      return { ...state, safetySettings: withSafetyDefaults({ ...state.safetySettings, ...action.patch }) }
    case 'SET_PASSENGER_EMERGENCY_CONTACTS':
      return {
        ...state,
        passengers: state.passengers.map((p) => (p.id === action.passengerId ? { ...p, emergencyContacts: action.contacts.slice(0, 3) } : p)),
      }
    case 'LOG_POSSIBLE_CRASH': {
      // The phone's sensors thought something happened and the person said
      // they are fine, or nobody answered. Kept for the safety analytics as
      // its own record type; a real escalation goes through TRIGGER_* with
      // source 'automatic_crash_detection' instead.
      const who =
        action.role === 'driver'
          ? state.drivers.find((d) => d.id === action.actorId)?.name ?? 'Driver'
          : state.passengers.find((p) => p.id === action.actorId)?.name ?? 'Passenger'
      const record: SosAlert = {
        id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        rideId: action.rideId,
        triggeredBy: action.actorId,
        type: 'possible_crash',
        status: action.outcome === 'ok' ? 'cancelled' : 'open',
        notes: action.outcome === 'ok' ? `Possible impact detected on ${who}'s phone — they confirmed they are OK.` : `Possible impact detected on ${who}'s phone — no answer within the timeout.`,
        createdAt: new Date().toISOString(),
        guardianNotifiedPhone: null,
        triggeredByRole: action.role,
        todaOrgId: action.role === 'driver' ? state.drivers.find((d) => d.id === action.actorId)?.todaOrgId ?? null : null,
        location: action.location,
        triggerSource: 'automatic_crash_detection',
        severity: 'medium',
        automaticDetection: true,
        possibleCrashDetected: true,
        cancelledAt: action.outcome === 'ok' ? new Date().toISOString() : null,
        events: [
          { id: `sosev-${Date.now()}`, at: new Date().toISOString(), kind: action.outcome === 'ok' ? 'crash_ok' : 'triggered', summary: action.outcome === 'ok' ? `${who} answered "I'm OK"` : 'No answer to the possible-accident prompt', actorName: who, actorRole: action.role },
        ],
        notifications: [],
      }
      return { ...state, alerts: [record, ...state.alerts] }
    }
    case 'APPROVE_DRIVER':
      return {
        ...state,
        drivers: state.drivers.map((d) =>
          d.id === action.driverId
            ? { ...d, verificationStatus: 'approved', online: true, rejectionReason: null, appealMessage: null, appealedAt: null }
            : d,
        ),
      }
    case 'REJECT_DRIVER':
      return {
        ...state,
        drivers: state.drivers.map((d) =>
          d.id === action.driverId
            ? {
                ...d,
                verificationStatus: 'rejected',
                online: false,
                rejectionReason: action.reason,
                appealMessage: null,
                appealedAt: null,
              }
            : d,
        ),
      }
    case 'APPEAL_DRIVER_REJECTION':
      return {
        ...state,
        drivers: state.drivers.map((d) =>
          d.id === action.driverId
            ? {
                ...d,
                verificationStatus: 'pending',
                appealMessage: action.message,
                appealedAt: new Date().toISOString(),
                pendingNote: null,
                pendingNoteDeadline: null,
              }
            : d,
        ),
      }
    // A pending applicant re-uploading a document (following up on Admin's
    // "approve as noted" requirements) clears the old note/deadline — the
    // specific thing Admin flagged has just been addressed, so this goes
    // back to a plain "under review" state instead of still showing a stale
    // complaint/clock alongside the freshly-replaced file.
    case 'RESUBMIT_DRIVER_DOCUMENT':
      return {
        ...state,
        drivers: state.drivers.map((d) =>
          d.id === action.driverId && d.verificationStatus === 'pending'
            ? {
                ...d,
                documents: {
                  ...d.documents,
                  [action.docType]: { submitted: true, dataUrl: action.dataUrl },
                },
                pendingNote: null,
                pendingNoteDeadline: null,
              }
            : d,
        ),
      }
    case 'HYDRATE':
      // Everything from elsewhere is taken as newer — except an ending this
      // device has already seen. See mergeIncomingRides: a cancelled or
      // completed ride cannot be walked back by a client whose copy predates
      // it, which is what made "Cancel trip" appear to do nothing while
      // another phone kept ticking the same ride.
      //
      // Accounts are unioned rather than replaced — a sign-up this device
      // has must survive a copy of the world that predates it. See
      // mergeById. A store's feed posts likewise — see mergeVendorPosts.
      {
        // A tombstoned id stays purged even when the incoming copy — or
        // this device's own memory — still carries it: unioning ids alone
        // (mergeVendorPosts) can't tell a stale duplicate from a sign-up in
        // flight, so the explicit purge list is what actually wins.
        const removedPharmacyIds = [
          ...new Set([...(state.removedPharmacyIds ?? []), ...(action.state.removedPharmacyIds ?? [])]),
        ]
        const removedSet = new Set(removedPharmacyIds)
        // Same tombstone rule for landmarks: a delete made on one device
        // must not be resurrected by a copy from another device that still
        // carries the seed landmark it deleted.
        const deletedLandmarkIds = [
          ...new Set([...(state.deletedLandmarkIds ?? []), ...(action.state.deletedLandmarkIds ?? [])]),
        ]
        const deletedLandmarkSet = new Set(deletedLandmarkIds)
        return {
          ...action.state,
          rides: mergeIncomingRides(state.rides, action.state.rides),
          passengers: mergeById(state.passengers, action.state.passengers),
          parents: mergeById(state.parents, action.state.parents),
          pharmacies: mergeVendorPosts(state.pharmacies, action.state.pharmacies).filter((p) => !removedSet.has(p.id)),
          removedPharmacyIds,
          landmarks: mergeById(state.landmarks, action.state.landmarks).filter((l) => !deletedLandmarkSet.has(l.id)),
          deletedLandmarkIds,
        }
      }
    case 'REMOVE_PHARMACY':
      return {
        ...state,
        pharmacies: state.pharmacies.filter((p) => p.id !== action.pharmacyId),
        removedPharmacyIds: [...new Set([...state.removedPharmacyIds, action.pharmacyId])],
      }
    case 'SET_COMMISSION':
      return { ...state, commissionPerRide: Math.max(0, action.amount) }
    // One case for every account type rather than four near-identical
    // profile updates: a PIN reset touches exactly one field, and routing it
    // through the full profile updaters would mean rebuilding whole records
    // from a recovery screen that only ever knew the new PIN.
    case 'RESET_ACCOUNT_PIN': {
      const swap = <T extends { id: string }>(list: T[], apply: (item: T) => T) =>
        list.map((item) => (item.id === action.id ? apply(item) : item))
      switch (action.kind) {
        case 'passenger':
          return { ...state, passengers: swap(state.passengers, (p) => ({ ...p, pin: action.pin })) }
        case 'parent':
          return { ...state, parents: swap(state.parents, (p) => ({ ...p, pin: action.pin })) }
        case 'driver':
          return { ...state, drivers: swap(state.drivers, (d) => ({ ...d, pin: action.pin })) }
        case 'toda':
          return {
            ...state,
            todaOrganizations: swap(state.todaOrganizations, (o) => ({ ...o, adminPin: action.pin })),
          }
        case 'pharmacy':
          return { ...state, pharmacies: swap(state.pharmacies, (p) => ({ ...p, adminPin: action.pin })) }
        case 'operator':
          return { ...state, operators: swap(state.operators, (o) => ({ ...o, adminPin: action.pin })) }
        case 'franchise':
          return { ...state, franchises: swap(state.franchises, (o) => ({ ...o, adminPin: action.pin })) }
      }
      return state
    }
    case 'SUSPEND_ACCOUNT':
      return { ...state, accountSuspensions: [action.suspension, ...state.accountSuspensions] }
    case 'LIFT_SUSPENSION':
      return {
        ...state,
        accountSuspensions: state.accountSuspensions.map((s) =>
          s.id === action.suspensionId ? { ...s, liftedAt: new Date().toISOString() } : s,
        ),
      }
    case 'SEND_ADMIN_NOTE':
      return { ...state, adminNotes: [action.note, ...state.adminNotes] }
    case 'SEND_SUPPORT_MESSAGE':
      return { ...state, supportMessages: [action.message, ...state.supportMessages] }
    case 'SET_SUPPORT_MESSAGE_STATUS':
      return {
        ...state,
        supportMessages: state.supportMessages.map((m) =>
          m.id === action.id ? { ...m, status: action.status } : m,
        ),
      }
    case 'PUBLISH_ANNOUNCEMENT':
      return { ...state, announcements: [action.announcement, ...state.announcements] }
    case 'SET_ANNOUNCEMENT_ACTIVE':
      return {
        ...state,
        announcements: state.announcements.map((a) =>
          a.id === action.announcementId ? { ...a, active: action.active } : a,
        ),
      }
    case 'REMOVE_ANNOUNCEMENT':
      return { ...state, announcements: state.announcements.filter((a) => a.id !== action.announcementId) }
    case 'SET_BANNER_AD_SLOT': {
      const bannerAds = state.bannerAds.map((ad, i) => (i === action.index ? action.ad : ad))
      return { ...state, bannerAds }
    }
    case 'SET_PABILI_ENABLED':
      return { ...state, pabiliEnabled: action.enabled }
    case 'SET_REWARDS_ENABLED':
      return { ...state, rewardsEnabled: action.enabled }
    case 'SET_MEDS_ENABLED':
      return { ...state, medsEnabled: action.enabled }
    case 'SET_VENDORS_ENABLED':
      return { ...state, vendorsEnabled: action.enabled }
    case 'SET_PARTNER_BANNER_ENABLED':
      return { ...state, partnerBannerEnabled: action.enabled }
    case 'SET_SIMULATED_OTP_ENABLED':
      return { ...state, simulatedOtpEnabled: action.enabled }
    case 'ADD_EMERGENCY_HOTLINE':
      return { ...state, emergencyHotlines: [action.hotline, ...state.emergencyHotlines] }
    case 'UPDATE_EMERGENCY_HOTLINE':
      return {
        ...state,
        emergencyHotlines: state.emergencyHotlines.map((h) => (h.id === action.id ? { ...h, ...action.updates } : h)),
      }
    case 'REMOVE_EMERGENCY_HOTLINE':
      return { ...state, emergencyHotlines: state.emergencyHotlines.filter((h) => h.id !== action.id) }
    case 'SET_SIMULATE_MOVEMENT_ENABLED':
      return { ...state, simulateMovementEnabled: action.enabled }
    case 'SET_LIVE_GPS_ENABLED':
      return { ...state, liveGpsEnabled: action.enabled }
    case 'SET_OPEN_DRIVER_SIGNUP':
      return { ...state, openDriverSignup: action.enabled }
    case 'SET_DOCUMENT_GRACE_DAYS':
      return { ...state, documentGraceDays: Math.max(1, Math.round(action.days)) }
    case 'SET_PUBLIC_BASE_URL':
      // Trailing slash stripped so callers can append paths without
      // producing a double slash.
      return { ...state, publicBaseUrl: action.url.trim().replace(/\/+$/, '') }
    case 'SET_PILOT_TODA_NAME':
      return { ...state, pilotTodaName: action.name.trim() }
    case 'JOIN_TERMINAL_QUEUE': {
      const joiningDriver = state.drivers.find((d) => d.id === action.driverId)
      const joiningOrg = joiningDriver?.todaOrgId
        ? state.todaOrganizations.find((o) => o.id === joiningDriver.todaOrgId)
        : null
      // If the org has a registered terminal GPS, the driver must actually
      // be there (within TERMINAL_PROXIMITY_METERS) to join — the UI is
      // responsible for capturing driverGps via the real Geolocation API
      // before dispatching this; this check is defense-in-depth so nothing
      // can bypass it by dispatching without a valid position.
      const withinRange =
        !joiningOrg?.terminalGps ||
        (action.driverGps && haversineDistanceMeters(action.driverGps, joiningOrg.terminalGps) <= TERMINAL_PROXIMITY_METERS)
      return {
        ...state,
        drivers: state.drivers.map((d) =>
          d.id === action.driverId &&
          d.todaOrgId !== null &&
          d.queueJoinedAt === null &&
          d.accessStatus === 'active' &&
          withinRange
            ? { ...d, queueJoinedAt: new Date().toISOString(), lastKnownGps: action.driverGps ?? d.lastKnownGps ?? null }
            : d,
        ),
      }
    }
    // Changing which terminal you work out of takes you out of the line you
    // were in: the place you were holding was at the other terminal.
    case 'SET_DRIVER_HOME_TERMINAL':
      return {
        ...state,
        drivers: state.drivers.map((d) =>
          d.id === action.driverId ? { ...d, homeTerminalId: action.terminalId, queueJoinedAt: null } : d,
        ),
      }
    case 'LEAVE_TERMINAL_QUEUE':
      return {
        ...state,
        drivers: state.drivers.map((d) => (d.id === action.driverId ? { ...d, queueJoinedAt: null } : d)),
      }
    case 'SET_QUEUE_OFFER_TIMEOUT':
      // A hold shorter than a couple of seconds is not a chance to answer,
      // it is a flicker — the floor keeps the setting honest.
      return { ...state, queueOfferTimeoutMs: Math.max(2000, action.ms) }
    case 'SET_DRIVER_PAYMENT_ACCOUNT':
      return {
        ...state,
        drivers: state.drivers.map((d) =>
          d.id === action.driverId
            ? { ...d, [action.wallet === 'gcash' ? 'gcashAccount' : 'mayaAccount']: action.details }
            : d,
        ),
      }
    case 'SET_TERMINAL_QR_FEE_WAIVED':
      return { ...state, terminalQrFeeWaived: action.waived }
    case 'SET_TRIP_LEG_SECONDS':
      // Shorter than a couple of ticks and the tricycle teleports.
      return { ...state, tripLegSeconds: Math.max(4, action.seconds) }
    case 'SET_PILA_BANNER':
      return { ...state, pilaBannerDataUrl: action.dataUrl }
    case 'SET_RIDE_DESTINATION':
      return {
        ...state,
        rides: state.rides.map((r) => {
          if (r.id !== action.rideId) return r
          const fare = estimateFare(
            r.pickup,
            action.dropoff,
            resolveTariff(
              state.tariffSettings,
              state.cityTariffs,
              state.todaTariffs,
              r.pickup.city,
              r.priorityTodaOrgId,
            ),
            {
            isStudent: r.isStudentRide,
            isPwdSenior: r.isPwdSeniorRide,
            passengerCount: r.passengerCount,
          })
          return { ...r, dropoff: action.dropoff, fareEstimate: fare, destinationPending: false }
        }),
      }
    case 'SET_REQUESTED_DRIVER':
      return {
        ...state,
        requestedDrivers: { ...state.requestedDrivers, [action.passengerId]: action.driverId },
      }
    case 'RECORD_PLATFORM_FEE_PAYMENT':
      // Newest first — a statement is read from the most recent settlement
      // backwards, not forwards from the first one ever made.
      return { ...state, platformFeePayments: [action.payment, ...state.platformFeePayments] }
    case 'REQUEST_DRIVER_WITHDRAWAL':
      // Newest first, same as the statement above and for the same reason.
      return { ...state, driverWithdrawals: [action.withdrawal, ...state.driverWithdrawals] }
    case 'SETTLE_DRIVER_WITHDRAWAL':
      return {
        ...state,
        driverWithdrawals: state.driverWithdrawals.map((w) =>
          w.id === action.withdrawalId && w.status === 'pending'
            ? {
                ...w,
                status: action.status,
                reference: action.reference,
                note: action.note,
                settledAt: new Date().toISOString(),
              }
            : w,
        ),
      }
    case 'SET_PLATFORM_GCASH_ACCOUNT':
      return { ...state, platformGcashAccount: action.account }
    case 'SET_TODA_QUEUE_WINDOW':
      return { ...state, todaQueueWindowMs: Math.max(5000, action.ms) }
    case 'SET_SPECIAL_PICKUP_ESCALATION_MS':
      return { ...state, specialPickupEscalationMs: Math.max(5000, action.ms) }
    case 'SET_FAVORITE_DRIVER':
      return {
        ...state,
        passengers: state.passengers.map((p) =>
          p.id === action.passengerId ? { ...p, favoriteDriverId: action.driverId } : p,
        ),
      }
    case 'SET_PARENT_FAVORITE_DRIVER':
      return {
        ...state,
        parents: state.parents.map((p) => (p.id === action.parentId ? { ...p, favoriteDriverId: action.driverId } : p)),
      }
    case 'PROPOSE_TODA_COMMISSION':
      // A new proposal resets both sign-offs — a changed rate needs fresh
      // approval, not a rubber-stamp of whatever was approved before.
      return {
        ...state,
        todaOrganizations: state.todaOrganizations.map((o) =>
          o.id === action.todaOrgId
            ? {
                ...o,
                proposedCommissionPerRide: action.amount === null ? null : Math.max(0, action.amount),
                commissionApprovedByMembers: false,
                commissionApprovedByAdmin: false,
              }
            : o,
        ),
      }
    case 'SET_TODA_COMMISSION_MEMBER_APPROVAL':
      return {
        ...state,
        todaOrganizations: state.todaOrganizations.map((o) =>
          o.id === action.todaOrgId ? { ...o, commissionApprovedByMembers: action.approved } : o,
        ),
      }
    case 'SET_TODA_COMMISSION_ADMIN_APPROVAL':
      return {
        ...state,
        todaOrganizations: state.todaOrganizations.map((o) =>
          o.id === action.todaOrgId ? { ...o, commissionApprovedByAdmin: action.approved } : o,
        ),
      }
    case 'ADD_DUES_RECORD': {
      const records: DuesRecord[] = action.driverIds.map((driverId, i) => ({
        id: `dues-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        driverId,
        todaOrgId: action.todaOrgId,
        type: action.duesType,
        label: action.label,
        amount: action.amount,
        dueDate: action.dueDate,
        paidAt: null,
      }))
      return { ...state, duesRecords: [...records, ...state.duesRecords] }
    }
    case 'MARK_DUES_PAID':
      return {
        ...state,
        duesRecords: state.duesRecords.map((d) =>
          d.id === action.duesRecordId ? { ...d, paidAt: new Date().toISOString() } : d,
        ),
      }
    case 'REQUEST_MEMBERSHIP_ACTION': {
      const request: MembershipRequest = {
        id: `mreq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        driverId: action.driverId,
        todaOrgId: action.todaOrgId,
        requestType: action.requestType,
        reason: action.reason,
        status: 'pending',
        requestedAt: new Date().toISOString(),
        resolvedAt: null,
      }
      return { ...state, membershipRequests: [request, ...state.membershipRequests] }
    }
    case 'RESOLVE_MEMBERSHIP_REQUEST': {
      const request = state.membershipRequests.find((r) => r.id === action.requestId)
      if (!request || request.status !== 'pending') return state
      const nextDrivers = action.approve
        ? state.drivers.map((d) =>
            d.id === request.driverId
              ? {
                  ...d,
                  accessStatus: (request.requestType === 'terminate' ? 'terminated' : 'paused') as DriverAccessStatus,
                  accessNote: `${request.requestType === 'terminate' ? 'Terminated' : 'Held'} at the request of your TODA: ${request.reason}`,
                  queueJoinedAt: null,
                }
              : d,
          )
        : state.drivers
      return {
        ...state,
        drivers: nextDrivers,
        membershipRequests: state.membershipRequests.map((r) =>
          r.id === action.requestId
            ? { ...r, status: action.approve ? 'approved' : 'rejected', resolvedAt: new Date().toISOString() }
            : r,
        ),
      }
    }
    case 'SET_DRIVER_ACCESS':
      return {
        ...state,
        drivers: state.drivers.map((d) =>
          d.id === action.driverId
            ? {
                ...d,
                accessStatus: action.accessStatus,
                accessNote: action.accessNote,
                queueJoinedAt: action.accessStatus === 'active' ? d.queueJoinedAt : null,
              }
            : d,
        ),
      }
    case 'SET_DRIVER_PABILI_PRIORITY':
      return {
        ...state,
        drivers: state.drivers.map((d) =>
          d.id === action.driverId ? { ...d, pabiliPriority: action.enabled } : d,
        ),
      }
    case 'SET_DRIVER_ONLINE':
      return {
        ...state,
        drivers: state.drivers.map((d) =>
          d.id === action.driverId
            ? {
                ...d,
                online: action.online,
                // Going offline is leaving the line. A driver who has gone
                // home must not still be holding a place other drivers are
                // queued behind — the same clearing ACCEPT_RIDE does when a
                // driver takes a fare.
                queueJoinedAt: action.online ? d.queueJoinedAt : null,
              }
            : d,
        ),
      }
    case 'UPDATE_PASSENGER_PROFILE':
      return {
        ...state,
        passengers: state.passengers.map((p) =>
          p.id === action.passengerId
            ? {
                ...p,
                name: action.name,
                phone: action.phone,
                email: action.email,
                pin: action.pin,
                paymentDetail: action.paymentDetail,
                password: action.password,
                guardianPhone: action.guardianPhone,
              }
            : p,
        ),
      }
    case 'UPDATE_DRIVER_PROFILE':
      return {
        ...state,
        drivers: state.drivers.map((d) =>
          d.id === action.driverId
            ? {
                ...d,
                name: action.name,
                phone: action.phone,
                email: action.email,
                pin: action.pin,
                paymentDetail: action.paymentDetail,
                password: action.password,
                emergencyContact: action.emergencyContact,
              }
            : d,
        ),
      }
    case 'UPDATE_PARENT_PROFILE':
      return {
        ...state,
        parents: state.parents.map((p) =>
          p.id === action.parentId
            ? {
                ...p,
                name: action.name,
                phone: action.phone,
                email: action.email,
                pin: action.pin,
                paymentDetail: action.paymentDetail,
                password: action.password,
                emergencyContact: action.emergencyContact,
              }
            : p,
        ),
      }
    case 'UPDATE_PHARMACY_PROFILE':
      return {
        ...state,
        pharmacies: state.pharmacies.map((p) =>
          p.id === action.pharmacyId
            ? {
                ...p,
                name: action.name,
                contactPhone: action.phone,
                email: action.email,
                adminPin: action.pin,
                paymentDetail: action.paymentDetail,
                password: action.password,
                emergencyContact: action.emergencyContact,
              }
            : p,
        ),
      }
    case 'SET_DUES_GRACE_PERIOD_DAYS':
      return { ...state, duesGracePeriodDays: Math.max(1, action.days) }
    case 'SET_TRIP_HISTORY_RETENTION_DAYS':
      return { ...state, tripHistoryRetentionDays: Math.max(1, action.days) }
    case 'SET_DRIVER_PENDING_NOTE':
      return {
        ...state,
        drivers: state.drivers.map((d) =>
          d.id === action.driverId ? { ...d, pendingNote: action.note, pendingNoteDeadline: action.deadline } : d,
        ),
      }
    // A TODA named by a driver at signup. No officers, no PIN, nothing to
    // approve yet — just the name, so the next driver from the same
    // association can pick it from the list instead of typing a variant of it.
    // Upsert: the editor reopens a saved boundary by id, so saving again
    // replaces it instead of leaving two copies of the same area.
    case 'SAVE_BOUNDARY': {
      if (action.boundary.points.length < 3) return state
      const exists = state.boundaries.some((b) => b.id === action.boundary.id)
      return {
        ...state,
        boundaries: exists
          ? state.boundaries.map((b) => (b.id === action.boundary.id ? action.boundary : b))
          : [...state.boundaries, action.boundary],
      }
    }
    case 'DELETE_BOUNDARY':
      return { ...state, boundaries: state.boundaries.filter((b) => b.id !== action.boundaryId) }
    case 'ADD_UNREGISTERED_TODA': {
      const name = action.name.trim()
      if (!name) return state
      const existing = state.todaOrganizations.find((o) => o.name.trim().toLowerCase() === name.toLowerCase())
      if (existing) return state
      const org: TodaOrganization = {
        id: action.id,
        name,
        terminalLocationId: null,
        proposedCommissionPerRide: null,
        commissionApprovedByMembers: false,
        commissionApprovedByAdmin: false,
        adminPin: '',
        officers: [],
        province: action.province,
        city: action.city,
        barangay: action.barangay,
        addressDetail: '',
        terminalGps: null,
        verificationStatus: 'unregistered',
        registrationNote: null,
        registrationNoteDeadline: null,
        rating: 0,
        ratingCount: 0,
        saasPlan: 'starter',
        monthlyPlatformFee: SAAS_PLAN_FEES.starter,
        perBookingFee: 0,
        operatorId: null,
      }
      return { ...state, todaOrganizations: [...state.todaOrganizations, org] }
    }
    case 'REGISTER_TODA_ORGANIZATION': {
      // A registration for a name drivers have already been signing up under
      // claims that record rather than starting a second one beside it. The
      // id is what every existing member points at, so keeping it is what
      // makes them members of the accredited org automatically.
      const claimed = state.todaOrganizations.find(
        (o) => o.id === action.id && o.verificationStatus === 'unregistered',
      )
      if (claimed) {
        return {
          ...state,
          todaOrganizations: state.todaOrganizations.map((o) =>
            o.id === claimed.id
              ? {
                  ...o,
                  name: action.name,
                  adminPin: action.adminPin,
                  officers: action.officers,
                  province: action.province,
                  city: action.city,
                  barangay: action.barangay,
                  addressDetail: action.addressDetail,
                  terminalGps: action.terminalGps,
                  verificationStatus: 'pending' as const,
                }
              : o,
          ),
        }
      }
      const org: TodaOrganization = {
        id: action.id,
        name: action.name,
        terminalLocationId: null,
        proposedCommissionPerRide: null,
        commissionApprovedByMembers: false,
        commissionApprovedByAdmin: false,
        adminPin: action.adminPin,
        contactPhone: action.contactPhone ?? null,
        officers: action.officers,
        province: action.province,
        city: action.city,
        barangay: action.barangay,
        addressDetail: action.addressDetail,
        terminalGps: action.terminalGps,
        verificationStatus: 'pending',
        registrationNote: null,
        registrationNoteDeadline: null,
        rating: 0,
        ratingCount: 0,
        // New self-registered TODAs start as Level-1 SaaS Partners on the
        // cheapest tier, reporting directly to HQ — matches the roadmap's
        // "earn the right to franchise" progression.
        saasPlan: 'starter',
        monthlyPlatformFee: SAAS_PLAN_FEES.starter,
        perBookingFee: 0,
        operatorId: null,
      }
      return { ...state, todaOrganizations: [...state.todaOrganizations, org] }
    }
    case 'APPROVE_TODA_ORG':
      return {
        ...state,
        todaOrganizations: state.todaOrganizations.map((o) =>
          o.id === action.todaOrgId ? { ...o, verificationStatus: 'approved' } : o,
        ),
      }
    case 'REJECT_TODA_ORG':
      return {
        ...state,
        todaOrganizations: state.todaOrganizations.map((o) =>
          o.id === action.todaOrgId ? { ...o, verificationStatus: 'rejected' } : o,
        ),
      }
    case 'SET_TODA_ORG_PENDING_NOTE':
      return {
        ...state,
        todaOrganizations: state.todaOrganizations.map((o) =>
          o.id === action.todaOrgId
            ? { ...o, registrationNote: action.note, registrationNoteDeadline: action.deadline }
            : o,
        ),
      }
    case 'SET_TODA_SAAS_PLAN':
      return {
        ...state,
        todaOrganizations: state.todaOrganizations.map((o) =>
          o.id === action.todaOrgId
            ? { ...o, saasPlan: action.plan, monthlyPlatformFee: SAAS_PLAN_FEES[action.plan], perBookingFee: action.perBookingFee }
            : o,
        ),
      }
    case 'SET_TODA_OPERATOR':
      return {
        ...state,
        todaOrganizations: state.todaOrganizations.map((o) =>
          o.id === action.todaOrgId ? { ...o, operatorId: action.operatorId } : o,
        ),
      }
    case 'REGISTER_OPERATOR': {
      const operator: Operator = {
        id: action.id,
        name: action.name,
        contactPerson: action.contactPerson,
        contactPhone: action.contactPhone,
        adminPin: action.adminPin,
        province: action.province,
        city: action.city,
        email: null,
        barangay: '',
        addressDetail: '',
        businessRegistrationNo: null,
        activationFee: null,
        monthlyPlatformFee: 0,
        perBookingFee: 0,
        franchiseId: null,
        verificationStatus: 'pending',
        registrationNote: null,
      }
      return { ...state, operators: [...state.operators, operator] }
    }
    case 'UPDATE_OPERATOR_PROFILE':
      return {
        ...state,
        operators: state.operators.map((o) =>
          o.id === action.operatorId
            ? {
                ...o,
                contactPerson: action.contactPerson,
                contactPhone: action.contactPhone,
                email: action.email,
                province: action.province,
                city: action.city,
                barangay: action.barangay,
                addressDetail: action.addressDetail,
                businessRegistrationNo: action.businessRegistrationNo,
              }
            : o,
        ),
      }
    case 'APPROVE_OPERATOR':
      return {
        ...state,
        operators: state.operators.map((o) =>
          o.id === action.operatorId ? { ...o, verificationStatus: 'approved' } : o,
        ),
      }
    case 'REJECT_OPERATOR':
      return {
        ...state,
        operators: state.operators.map((o) =>
          o.id === action.operatorId ? { ...o, verificationStatus: 'rejected' } : o,
        ),
      }
    case 'SET_OPERATOR_FEES':
      return {
        ...state,
        operators: state.operators.map((o) =>
          o.id === action.operatorId
            ? {
                ...o,
                activationFee: action.activationFee,
                monthlyPlatformFee: action.monthlyPlatformFee,
                perBookingFee: action.perBookingFee,
              }
            : o,
        ),
      }
    case 'SET_OPERATOR_FRANCHISE':
      return {
        ...state,
        operators: state.operators.map((o) =>
          o.id === action.operatorId ? { ...o, franchiseId: action.franchiseId } : o,
        ),
      }
    case 'SET_OPERATOR_LOGO':
      return {
        ...state,
        operators: state.operators.map((o) =>
          o.id === action.operatorId ? { ...o, logoDataUrl: action.logoDataUrl } : o,
        ),
      }
    case 'SET_OPERATOR_BANNER':
      return {
        ...state,
        operators: state.operators.map((o) =>
          o.id === action.operatorId ? { ...o, bannerDataUrl: action.bannerDataUrl } : o,
        ),
      }
    case 'REGISTER_FRANCHISE': {
      const franchise: Franchise = {
        id: action.id,
        name: action.name,
        contactPerson: action.contactPerson,
        contactPhone: action.contactPhone,
        adminPin: action.adminPin,
        province: action.province,
        city: action.city,
        email: null,
        barangay: '',
        addressDetail: '',
        businessRegistrationNo: null,
        initialFranchiseFee: null,
        monthlyTechnologyFee: 0,
        royaltyPct: null,
        verificationStatus: 'pending',
        registrationNote: null,
      }
      return { ...state, franchises: [...state.franchises, franchise] }
    }
    case 'UPDATE_FRANCHISE_PROFILE':
      return {
        ...state,
        franchises: state.franchises.map((f) =>
          f.id === action.franchiseId
            ? {
                ...f,
                contactPerson: action.contactPerson,
                contactPhone: action.contactPhone,
                email: action.email,
                province: action.province,
                city: action.city,
                barangay: action.barangay,
                addressDetail: action.addressDetail,
                businessRegistrationNo: action.businessRegistrationNo,
              }
            : f,
        ),
      }
    case 'APPROVE_FRANCHISE':
      return {
        ...state,
        franchises: state.franchises.map((f) =>
          f.id === action.franchiseId ? { ...f, verificationStatus: 'approved' } : f,
        ),
      }
    case 'REJECT_FRANCHISE':
      return {
        ...state,
        franchises: state.franchises.map((f) =>
          f.id === action.franchiseId ? { ...f, verificationStatus: 'rejected' } : f,
        ),
      }
    case 'SET_FRANCHISE_FEES':
      return {
        ...state,
        franchises: state.franchises.map((f) =>
          f.id === action.franchiseId
            ? {
                ...f,
                initialFranchiseFee: action.initialFranchiseFee,
                monthlyTechnologyFee: action.monthlyTechnologyFee,
                royaltyPct: action.royaltyPct,
              }
            : f,
        ),
      }
    case 'SET_TODA_TERMINAL_GPS':
      return {
        ...state,
        todaOrganizations: state.todaOrganizations.map((o) =>
          o.id === action.todaOrgId ? { ...o, terminalGps: action.gps } : o,
        ),
      }
    case 'SET_TODA_TERMINAL_ADDRESS':
      return {
        ...state,
        todaOrganizations: state.todaOrganizations.map((o) =>
          o.id === action.todaOrgId
            ? {
                ...o,
                province: action.province,
                city: action.city,
                barangay: action.barangay,
                addressDetail: action.addressDetail,
              }
            : o,
        ),
      }
    case 'SET_TARIFF_SETTINGS':
      return { ...state, tariffSettings: action.settings }
    case 'SET_CITY_TARIFF': {
      const next = { ...state.cityTariffs }
      if (action.settings) next[action.city] = action.settings
      else delete next[action.city]
      return { ...state, cityTariffs: next }
    }
    case 'SET_TODA_TARIFF': {
      const next = { ...state.todaTariffs }
      if (action.settings) next[action.todaOrgId] = action.settings
      else delete next[action.todaOrgId]
      return { ...state, todaTariffs: next }
    }
    case 'SET_PABILI_FARE_MODE':
      return { ...state, pabiliFareMode: action.mode }
    case 'SET_PABILI_FIXED_FARE':
      return { ...state, pabiliFixedFare: Math.max(0, Math.round(action.amount)) }
    case 'SET_PABILI_SERVICE_FEE':
      return { ...state, pabiliServiceFee: Math.max(0, action.amount) }
    case 'ADD_EXPENSE': {
      if (!Number.isFinite(action.amount) || action.amount <= 0) return state
      const expense: ExpenseRecord = {
        id: action.id,
        category: action.category,
        amount: action.amount,
        description: action.description,
        recordedAt: new Date().toISOString(),
        recordedBy: action.recordedBy,
      }
      return { ...state, expenses: [expense, ...state.expenses] }
    }
    case 'DELETE_EXPENSE':
      return { ...state, expenses: state.expenses.filter((e) => e.id !== action.expenseId) }
    case 'TOGGLE_COMPLIANCE_ITEM':
      return {
        ...state,
        complianceChecked: { ...state.complianceChecked, [action.itemId]: action.done },
      }
    case 'SET_COMPLIANCE_NOTE':
      return {
        ...state,
        complianceReview: {
          ...state.complianceReview,
          [action.itemId]: { note: action.note, deadlineAt: action.deadlineAt },
        },
      }
    case 'ADD_CAPITAL_CONTRIBUTION': {
      if (!Number.isFinite(action.amount) || action.amount <= 0) return state
      if (!Number.isFinite(action.shares) || action.shares <= 0) return state
      const contribution: CapitalContribution = {
        id: action.id,
        stockholderName: action.stockholderName,
        shares: action.shares,
        amount: action.amount,
        contributedAt: new Date().toISOString(),
        recordedBy: action.recordedBy,
      }
      return { ...state, capitalContributions: [contribution, ...state.capitalContributions] }
    }
    case 'DELETE_CAPITAL_CONTRIBUTION':
      return {
        ...state,
        capitalContributions: state.capitalContributions.filter((c) => c.id !== action.contributionId),
      }
    case 'ADD_ACCOUNTING_OFFICER': {
      if (!action.name.trim() || !action.email.trim()) return state
      const officer: AccountingOfficer = {
        id: action.id,
        name: action.name.trim(),
        email: action.email.trim().toLowerCase(),
        position: action.position,
        otherPositionLabel: action.position === 'Other' ? action.otherPositionLabel : null,
        addedAt: new Date().toISOString(),
      }
      return { ...state, accountingOfficers: [officer, ...state.accountingOfficers] }
    }
    case 'REMOVE_ACCOUNTING_OFFICER':
      return {
        ...state,
        accountingOfficers: state.accountingOfficers.filter((o) => o.id !== action.officerId),
      }
    case 'UPDATE_ACCOUNTING_OFFICER': {
      if (!action.name.trim() || !action.email.trim()) return state
      return {
        ...state,
        accountingOfficers: state.accountingOfficers.map((o) =>
          o.id === action.officerId
            ? {
                ...o,
                name: action.name.trim(),
                email: action.email.trim().toLowerCase(),
                position: action.position,
                otherPositionLabel: action.position === 'Other' ? action.otherPositionLabel : null,
              }
            : o,
        ),
      }
    }
    case 'ADD_EQUITY_ALLOCATION': {
      if (!action.holderName.trim() || !Number.isFinite(action.percentage) || action.percentage <= 0) return state
      const allocation: EquityAllocation = {
        id: action.id,
        holderName: action.holderName.trim(),
        category: action.category,
        otherCategoryLabel: action.category === 'Other' ? action.otherCategoryLabel : null,
        percentage: action.percentage,
        notes: action.notes,
        addedAt: new Date().toISOString(),
      }
      return { ...state, equityAllocations: [allocation, ...state.equityAllocations] }
    }
    case 'UPDATE_EQUITY_ALLOCATION': {
      if (!action.holderName.trim() || !Number.isFinite(action.percentage) || action.percentage <= 0) return state
      return {
        ...state,
        equityAllocations: state.equityAllocations.map((a) =>
          a.id === action.allocationId
            ? {
                ...a,
                holderName: action.holderName.trim(),
                category: action.category,
                otherCategoryLabel: action.category === 'Other' ? action.otherCategoryLabel : null,
                percentage: action.percentage,
                notes: action.notes,
              }
            : a,
        ),
      }
    }
    case 'REMOVE_EQUITY_ALLOCATION':
      return {
        ...state,
        equityAllocations: state.equityAllocations.filter((a) => a.id !== action.allocationId),
      }
    case 'ADD_INVESTOR': {
      if (!action.investorName.trim() || !Number.isFinite(action.investmentAmount) || action.investmentAmount <= 0)
        return state
      const investor: Investor = {
        id: action.id,
        investorName: action.investorName.trim(),
        investmentDate: action.investmentDate,
        investmentAmount: action.investmentAmount,
        investmentRound: action.investmentRound.trim(),
        preMoneyValuation: action.preMoneyValuation,
        postMoneyValuation: action.postMoneyValuation,
        sharePercentage: action.sharePercentage,
        shareClass: action.shareClass,
        agreementReference: action.agreementReference,
        status: action.status,
        notes: action.notes,
        addedAt: new Date().toISOString(),
      }
      return { ...state, investors: [investor, ...state.investors] }
    }
    case 'UPDATE_INVESTOR': {
      if (!action.investorName.trim() || !Number.isFinite(action.investmentAmount) || action.investmentAmount <= 0)
        return state
      return {
        ...state,
        investors: state.investors.map((inv) =>
          inv.id === action.investorId
            ? {
                ...inv,
                investorName: action.investorName.trim(),
                investmentDate: action.investmentDate,
                investmentAmount: action.investmentAmount,
                investmentRound: action.investmentRound.trim(),
                preMoneyValuation: action.preMoneyValuation,
                postMoneyValuation: action.postMoneyValuation,
                sharePercentage: action.sharePercentage,
                shareClass: action.shareClass,
                agreementReference: action.agreementReference,
                status: action.status,
                notes: action.notes,
              }
            : inv,
        ),
      }
    }
    case 'REMOVE_INVESTOR':
      return { ...state, investors: state.investors.filter((inv) => inv.id !== action.investorId) }
    case 'ADD_FOUNDER_CONTRIBUTION': {
      if (!action.founderName.trim() || !action.description.trim() || !Number.isFinite(action.estimatedValue) || action.estimatedValue <= 0)
        return state
      const contribution: FounderContribution = {
        id: action.id,
        founderName: action.founderName.trim(),
        date: action.date,
        contributionType: action.contributionType.trim(),
        description: action.description.trim(),
        kind: action.kind,
        estimatedValue: action.estimatedValue,
        supportingDocDataUrl: action.supportingDocDataUrl,
        status: 'pending',
        approvedValue: null,
        approvedBy: null,
        approvalDate: null,
        addedAt: new Date().toISOString(),
      }
      return { ...state, founderContributions: [contribution, ...state.founderContributions] }
    }
    case 'UPDATE_FOUNDER_CONTRIBUTION': {
      if (!action.founderName.trim() || !action.description.trim() || !Number.isFinite(action.estimatedValue) || action.estimatedValue <= 0)
        return state
      return {
        ...state,
        founderContributions: state.founderContributions.map((c) =>
          c.id === action.contributionId
            ? {
                ...c,
                founderName: action.founderName.trim(),
                date: action.date,
                contributionType: action.contributionType.trim(),
                description: action.description.trim(),
                kind: action.kind,
                estimatedValue: action.estimatedValue,
                supportingDocDataUrl: action.supportingDocDataUrl,
              }
            : c,
        ),
      }
    }
    case 'SET_FOUNDER_CONTRIBUTION_STATUS':
      return {
        ...state,
        founderContributions: state.founderContributions.map((c) =>
          c.id === action.contributionId
            ? {
                ...c,
                status: action.status,
                approvedValue: action.status === 'approved' ? action.approvedValue : null,
                approvedBy: action.status === 'pending' ? null : action.approvedBy,
                approvalDate: action.status === 'pending' ? null : new Date().toISOString(),
              }
            : c,
        ),
      }
    case 'REMOVE_FOUNDER_CONTRIBUTION':
      return {
        ...state,
        founderContributions: state.founderContributions.filter((c) => c.id !== action.contributionId),
      }
    case 'SET_SOCIAL_IMPACT_FUND_PCT':
      return { ...state, socialImpactFundPct: Math.max(0, Math.min(100, action.pct)) }
    case 'ADD_SOCIAL_IMPACT_TRANSACTION': {
      if (!action.description.trim() || !Number.isFinite(action.amount) || action.amount <= 0) return state
      const transaction: SocialImpactTransaction = {
        id: action.id,
        date: action.date,
        description: action.description.trim(),
        amount: action.amount,
        projectId: action.projectId,
        category: action.category,
        status: action.status,
        approvedBy: action.approvedBy,
        supportingDocDataUrl: action.supportingDocDataUrl,
        addedAt: new Date().toISOString(),
      }
      return { ...state, socialImpactTransactions: [transaction, ...state.socialImpactTransactions] }
    }
    case 'SET_SOCIAL_IMPACT_TRANSACTION_STATUS':
      return {
        ...state,
        socialImpactTransactions: state.socialImpactTransactions.map((t) =>
          t.id === action.transactionId ? { ...t, status: action.status, approvedBy: action.approvedBy } : t,
        ),
      }
    case 'REMOVE_SOCIAL_IMPACT_TRANSACTION':
      return {
        ...state,
        socialImpactTransactions: state.socialImpactTransactions.filter((t) => t.id !== action.transactionId),
      }
    case 'ADD_ROTARY_PROJECT': {
      if (!action.projectName.trim()) return state
      const project: RotaryProject = {
        id: action.id,
        projectName: action.projectName.trim(),
        partner: action.partner.trim(),
        description: action.description.trim(),
        category: action.category,
        approvedBudget: action.approvedBudget,
        socialImpactFundAllocation: action.socialImpactFundAllocation,
        additionalFunding: action.additionalFunding,
        status: action.status,
        startDate: action.startDate,
        endDate: action.endDate,
        addedAt: new Date().toISOString(),
      }
      return { ...state, rotaryProjects: [project, ...state.rotaryProjects] }
    }
    case 'UPDATE_ROTARY_PROJECT': {
      if (!action.projectName.trim()) return state
      return {
        ...state,
        rotaryProjects: state.rotaryProjects.map((p) =>
          p.id === action.projectId
            ? {
                ...p,
                projectName: action.projectName.trim(),
                partner: action.partner.trim(),
                description: action.description.trim(),
                category: action.category,
                approvedBudget: action.approvedBudget,
                socialImpactFundAllocation: action.socialImpactFundAllocation,
                additionalFunding: action.additionalFunding,
                status: action.status,
                startDate: action.startDate,
                endDate: action.endDate,
              }
            : p,
        ),
      }
    }
    case 'REMOVE_ROTARY_PROJECT':
      return { ...state, rotaryProjects: state.rotaryProjects.filter((p) => p.id !== action.projectId) }
    case 'ADD_DISTRIBUTION': {
      if (!action.recipient.trim() || !Number.isFinite(action.amount) || action.amount <= 0) return state
      const distribution: Distribution = {
        id: action.id,
        recipient: action.recipient.trim(),
        distributionType: action.distributionType,
        amount: action.amount,
        date: action.date,
        source: action.source.trim(),
        reference: action.reference,
        status: action.status,
        approvedBy: action.approvedBy,
        addedAt: new Date().toISOString(),
      }
      return { ...state, distributions: [distribution, ...state.distributions] }
    }
    case 'UPDATE_DISTRIBUTION': {
      if (!action.recipient.trim() || !Number.isFinite(action.amount) || action.amount <= 0) return state
      return {
        ...state,
        distributions: state.distributions.map((d) =>
          d.id === action.distributionId
            ? {
                ...d,
                recipient: action.recipient.trim(),
                distributionType: action.distributionType,
                amount: action.amount,
                date: action.date,
                source: action.source.trim(),
                reference: action.reference,
                status: action.status,
                approvedBy: action.approvedBy,
              }
            : d,
        ),
      }
    }
    case 'REMOVE_DISTRIBUTION':
      return { ...state, distributions: state.distributions.filter((d) => d.id !== action.distributionId) }
    case 'ADD_RCC_INCENTIVE': {
      if (!action.description.trim() || !Number.isFinite(action.amount) || action.amount <= 0) return state
      const incentive: RccIncentive = {
        id: action.id,
        partner: action.partner.trim(),
        basis: action.basis,
        description: action.description.trim(),
        amount: action.amount,
        date: action.date,
        status: action.status,
        approvedBy: action.approvedBy,
        addedAt: new Date().toISOString(),
      }
      return { ...state, rccIncentives: [incentive, ...state.rccIncentives] }
    }
    case 'UPDATE_RCC_INCENTIVE': {
      if (!action.description.trim() || !Number.isFinite(action.amount) || action.amount <= 0) return state
      return {
        ...state,
        rccIncentives: state.rccIncentives.map((r) =>
          r.id === action.incentiveId
            ? {
                ...r,
                partner: action.partner.trim(),
                basis: action.basis,
                description: action.description.trim(),
                amount: action.amount,
                date: action.date,
                status: action.status,
                approvedBy: action.approvedBy,
              }
            : r,
        ),
      }
    }
    case 'REMOVE_RCC_INCENTIVE':
      return { ...state, rccIncentives: state.rccIncentives.filter((r) => r.id !== action.incentiveId) }
    case 'UPDATE_CORPORATE_REGISTRATION':
      return { ...state, corporateRegistration: { ...action.info, updatedAt: new Date().toISOString() } }
    case 'ADD_STOCKHOLDER': {
      if (!action.name.trim() || !Number.isFinite(action.sharesSubscribed) || action.sharesSubscribed <= 0) return state
      const stockholder: Stockholder = {
        id: action.id,
        name: action.name.trim(),
        nationality: action.nationality.trim(),
        address: action.address.trim(),
        stockholderType: action.stockholderType,
        sharesSubscribed: action.sharesSubscribed,
        amountSubscribed: action.amountSubscribed,
        amountPaid: action.amountPaid,
        dateSubscribed: action.dateSubscribed,
        certificateNo: action.certificateNo,
        addedAt: new Date().toISOString(),
      }
      return { ...state, stockholders: [stockholder, ...state.stockholders] }
    }
    case 'UPDATE_STOCKHOLDER': {
      if (!action.name.trim() || !Number.isFinite(action.sharesSubscribed) || action.sharesSubscribed <= 0) return state
      return {
        ...state,
        stockholders: state.stockholders.map((s) =>
          s.id === action.stockholderId
            ? {
                ...s,
                name: action.name.trim(),
                nationality: action.nationality.trim(),
                address: action.address.trim(),
                stockholderType: action.stockholderType,
                sharesSubscribed: action.sharesSubscribed,
                amountSubscribed: action.amountSubscribed,
                amountPaid: action.amountPaid,
                dateSubscribed: action.dateSubscribed,
                certificateNo: action.certificateNo,
              }
            : s,
        ),
      }
    }
    case 'REMOVE_STOCKHOLDER':
      return { ...state, stockholders: state.stockholders.filter((s) => s.id !== action.stockholderId) }
    case 'ADD_TODA_CONTRIBUTION': {
      if (!Number.isFinite(action.amount) || action.amount <= 0) return state
      const contribution: TodaContribution = {
        id: action.id,
        todaOrgId: action.todaOrgId,
        contributorName: action.contributorName,
        purpose: action.purpose,
        amount: action.amount,
        contributedAt: new Date().toISOString(),
        recordedBy: action.recordedBy,
      }
      return { ...state, todaContributions: [contribution, ...state.todaContributions] }
    }
    case 'DELETE_TODA_CONTRIBUTION':
      return {
        ...state,
        todaContributions: state.todaContributions.filter((c) => c.id !== action.contributionId),
      }
    case 'ADD_TODA_EXPENSE': {
      if (!Number.isFinite(action.amount) || action.amount <= 0) return state
      const expense: TodaExpenseRecord = {
        id: action.id,
        todaOrgId: action.todaOrgId,
        category: action.category,
        amount: action.amount,
        description: action.description,
        recordedAt: new Date().toISOString(),
        recordedBy: action.recordedBy,
      }
      return { ...state, todaExpenses: [expense, ...state.todaExpenses] }
    }
    case 'DELETE_TODA_EXPENSE':
      return { ...state, todaExpenses: state.todaExpenses.filter((e) => e.id !== action.expenseId) }
    case 'SAVE_PASSENGER_LOCATION':
      return {
        ...state,
        passengers: state.passengers.map((p) =>
          p.id === action.passengerId
            ? {
                ...p,
                // Home/School/Work are single-slot — saving a new one under
                // that label replaces it. Favorite is the exception: it
                // accumulates (a rider can have many favorite places), so an
                // existing Favorite is never displaced by a new one.
                // Home/School/Work are single-slot — saving under that label
                // replaces it. Favorite accumulates, but not blindly: saving
                // a place that is already a favourite updates that entry
                // instead of adding a second, identical one to the list.
                savedLocations: [
                  ...p.savedLocations.filter((s) =>
                    action.label === 'Favorite'
                      ? !(s.label === 'Favorite' && s.location.id === action.location.id)
                      : s.label !== action.label,
                  ),
                  { id: action.id, label: action.label, location: action.location },
                ],
              }
            : p,
        ),
      }
    case 'REMOVE_PASSENGER_LOCATION':
      return {
        ...state,
        passengers: state.passengers.map((p) =>
          p.id === action.passengerId
            ? { ...p, savedLocations: p.savedLocations.filter((s) => s.id !== action.savedLocationId) }
            : p,
        ),
      }
    case 'RATE_RIDE': {
      const ride = state.rides.find((r) => r.id === action.rideId)
      // Only a completed, not-yet-rated ride can be rated — once, not
      // editable, same as most real ride-hailing apps.
      if (!ride || ride.status !== 'completed' || ride.ratedAt || !ride.driverId) return state
      const drivingDriver = state.drivers.find((d) => d.id === ride.driverId)
      const drivingDriverToda = drivingDriver?.todaOrgId
        ? state.todaOrganizations.find((o) => o.id === drivingDriver.todaOrgId)
        : null
      return {
        ...state,
        rides: state.rides.map((r) =>
          r.id === action.rideId
            ? {
                ...r,
                driverRating: action.driverRating,
                driverReviewText: action.driverReviewText || null,
                todaRating: action.todaRating,
                todaReviewText: action.todaReviewText || null,
                ratedAt: new Date().toISOString(),
              }
            : r,
        ),
        drivers: state.drivers.map((d) =>
          d.id === ride.driverId
            ? {
                ...d,
                rating:
                  Math.round(
                    ((d.rating * d.ratingCount + action.driverRating) / (d.ratingCount + 1)) * 10,
                  ) / 10,
                ratingCount: d.ratingCount + 1,
              }
            : d,
        ),
        todaOrganizations:
          action.todaRating !== null && drivingDriverToda
            ? state.todaOrganizations.map((o) =>
                o.id === drivingDriverToda.id
                  ? {
                      ...o,
                      rating:
                        Math.round(
                          ((o.rating * o.ratingCount + action.todaRating!) / (o.ratingCount + 1)) * 10,
                        ) / 10,
                      ratingCount: o.ratingCount + 1,
                    }
                  : o,
              )
            : state.todaOrganizations,
      }
    }
    case 'REPORT_DRIVER': {
      const report: DriverReport = {
        id: action.id,
        rideId: action.rideId,
        passengerId: action.passengerId,
        passengerName: action.passengerName,
        driverId: action.driverId,
        driverName: action.driverName,
        reason: action.reason,
        details: action.details,
        createdAt: new Date().toISOString(),
        status: 'open',
      }
      return { ...state, driverReports: [report, ...state.driverReports] }
    }
    case 'RESOLVE_DRIVER_REPORT':
      return {
        ...state,
        driverReports: state.driverReports.map((r) =>
          r.id === action.reportId ? { ...r, status: 'reviewed' } : r,
        ),
      }
    case 'ADD_SAFETY_PHOTO': {
      const photo = {
        id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        dataUrl: action.dataUrl,
        takenBy: action.takenBy,
        takenAt: new Date().toISOString(),
      }
      return {
        ...state,
        rides: state.rides.map((r) =>
          r.id === action.rideId
            ? { ...r, safetyPhotos: [...r.safetyPhotos, photo].slice(-MAX_PHOTOS_PER_RIDE) }
            : r,
        ),
      }
    }
    case 'REGISTER_DRIVER': {
      // Approved on the spot while the pilot flag is on — see openDriverSignup.
      const driver: Driver = {
        id: `drv-${Date.now()}`,
        name: action.name,
        plateNumber: action.plateNumber,
        licenseNo: action.licenseNo,
        licenseExpiry: action.licenseExpiry,
        pin: action.pin,
        rating: 0,
        ratingCount: 0,
        online: false,
        verificationStatus: state.openDriverSignup ? 'approved' : 'pending',
        // Stamped now, from the setting as it stands today, so a driver is
        // held to the date they were actually given.
        documentsDueBy: DOCUMENT_TYPES.every((t) => action.documents[t].submitted)
          ? null
          : new Date(Date.now() + state.documentGraceDays * 24 * 60 * 60 * 1000).toISOString(),
        documents: action.documents,
        todaOrgId: action.todaOrgId,
        province: action.province,
        city: action.city,
        barangay: action.barangay,
        addressDetail: action.addressDetail,
        phone: action.phone,
        email: action.email,
        facebook: action.facebook,
        queueJoinedAt: null,
        accessStatus: 'active',
        accessNote: null,
        pendingNote: null,
        pendingNoteDeadline: null,
        pabiliPriority: false,
        rejectionReason: null,
        appealMessage: null,
        appealedAt: null,
      }
      // A rider a vendor pre-registered (see DriverInvite.pharmacyId) is
      // that vendor's trusted rider from the moment they finish signing up
      // — the vendor should not have to find them in the list afterwards.
      const usedInvite = action.inviteId ? state.driverInvites.find((inv) => inv.id === action.inviteId) : undefined
      const vendorId = usedInvite?.pharmacyId ?? null
      return {
        ...state,
        drivers: [...state.drivers, driver],
        driverInvites: action.inviteId
          ? state.driverInvites.map((inv) =>
              inv.id === action.inviteId ? { ...inv, usedByDriverId: driver.id } : inv,
            )
          : state.driverInvites,
        pharmacies: vendorId
          ? state.pharmacies.map((p) =>
              p.id === vendorId && !(p.trustedDriverIds ?? []).includes(driver.id)
                ? { ...p, trustedDriverIds: [...(p.trustedDriverIds ?? []), driver.id] }
                : p,
            )
          : state.pharmacies,
      }
    }
    case 'CREATE_DRIVER_INVITE': {
      const invite: DriverInvite = {
        id: action.id,
        todaOrgId: action.todaOrgId,
        name: action.name,
        phone: action.phone,
        email: action.email,
        pharmacyId: action.pharmacyId ?? null,
        plateNumber: action.plateNumber ?? null,
        createdAt: new Date().toISOString(),
        usedByDriverId: null,
      }
      return { ...state, driverInvites: [invite, ...state.driverInvites] }
    }
    case 'REMOVE_DRIVER_INVITE':
      return {
        ...state,
        driverInvites: state.driverInvites.filter((inv) => inv.id !== action.inviteId || inv.usedByDriverId !== null),
      }
    case 'REGISTER_PASSENGER': {
      if (action.age < MINOR_AGE_LIMIT) return state
      const passenger: Passenger = {
        id: action.id,
        name: action.name,
        age: action.age,
        isStudent: action.isStudent,
        isPwdSenior: false,
        phone: action.phone,
        email: action.email,
        pin: action.pin,
        province: action.province,
        city: action.city,
        barangay: action.barangay,
        addressDetail: action.addressDetail,
        guardianPhone: action.guardianPhone,
        guardianName: action.guardianName,
        guardianRelationship: action.guardianRelationship,
        favoriteDriverId: null,
        savedLocations: [],
      }
      return { ...state, passengers: [...state.passengers, passenger] }
    }
    // A student signing up for themselves named their parent/guardian. That
    // guardian becomes a real Parent record linked to the student, so they
    // show up in the Parent directory and in Admin's parent monitoring like
    // any other — the difference is that they have not confirmed anything
    // yet, which is exactly what consentGiven: false records.
    case 'REGISTER_GUARDIAN_FOR_STUDENT': {
      const student = state.passengers.find((p) => p.id === action.studentPassengerId)
      if (!student || !action.name.trim() || !action.phone.trim()) return state
      // One household, one parent record: a second child naming the same
      // number must join the existing parent rather than clone them.
      const digits = (v: string) => v.replace(/\D/g, '')
      const existing = state.parents.find((p) => digits(p.phone) === digits(action.phone))
      const parentId = existing?.id ?? action.parentId
      // A student may name both parents — most have two — so the bar is one
      // link per PARENT, not one per student. It still refuses the same
      // person twice, which is what re-submitting a form would produce.
      if (
        existing &&
        state.parentLinks.some((l) => l.studentPassengerId === student.id && l.parentId === existing.id)
      ) {
        return state
      }
      const link: ParentLink = {
        parentId,
        studentPassengerId: student.id,
        relationship: action.relationship,
        consentGiven: false,
        proofOfAuthorityDataUrl: null,
        consentedAt: new Date().toISOString(),
      }
      if (existing) {
        return { ...state, parentLinks: [...state.parentLinks, link] }
      }
      const parent: Parent = {
        id: parentId,
        name: action.name.trim(),
        phone: action.phone.trim(),
        email: null,
        // No PIN: the student set this up, not the guardian. They can claim
        // the account with a one-time code to their own number.
        pin: null,
        province: action.province,
        city: action.city,
        barangay: action.barangay,
        addressDetail: action.addressDetail,
        favoriteDriverId: null,
      }
      return {
        ...state,
        parents: [...state.parents, parent],
        parentLinks: [...state.parentLinks, link],
      }
    }
    case 'REGISTER_PARENT_WITH_CHILD': {
      if (action.childAge >= MINOR_AGE_LIMIT) return state
      // One household, one parent record — the same rule
      // REGISTER_GUARDIAN_FOR_STUDENT already keeps. It matters more now
      // that a passenger can add several children in one sign-up: without
      // it, three children produced three parents with the same name and
      // number, and each child's trips answered to a different one.
      const sameDigits = (a: string, b: string) => a.replace(/D/g, '') === b.replace(/D/g, '')
      const existingParent = state.parents.find((p) => sameDigits(p.phone, action.parentPhone))
      const parentId = existingParent?.id ?? action.parentId
      const parent: Parent = {
        id: parentId,
        name: action.parentName,
        phone: action.parentPhone,
        email: action.parentEmail,
        pin: action.parentPin,
        province: action.province,
        city: action.city,
        barangay: action.barangay,
        addressDetail: action.addressDetail,
        favoriteDriverId: null,
      }
      const child: Passenger = {
        id: action.childId,
        name: action.childName,
        age: action.childAge,
        isStudent: true,
        isPwdSenior: false,
        phone: action.childPhone,
        // Registered by a parent, not self-registered — no login identity
        // of their own (mirrors pax-2 in MOCK_PASSENGERS).
        email: null,
        pin: null,
        province: action.province,
        city: action.city,
        barangay: action.barangay,
        addressDetail: action.addressDetail,
        guardianPhone: null,
        favoriteDriverId: null,
        savedLocations: [],
      }
      const link: ParentLink = {
        parentId: parent.id,
        studentPassengerId: child.id,
        relationship: action.relationship,
        consentGiven: true,
        proofOfAuthorityDataUrl: action.proofOfAuthorityDataUrl,
        consentedAt: new Date().toISOString(),
      }
      return {
        ...state,
        // Only a genuinely new parent joins the list; a second child added by
        // the same person joins the parent already there.
        parents: existingParent ? state.parents : [...state.parents, parent],
        passengers: [...state.passengers, child],
        parentLinks: [...state.parentLinks, link],
      }
    }
    case 'ADD_ACTIVITY_LOG_ENTRY': {
      const entry: ActivityLogEntry = {
        id: action.id,
        actorRole: action.actorRole,
        actorName: action.actorName,
        todaOrgId: action.todaOrgId,
        action: action.action,
        summary: action.summary,
        at: action.at,
      }
      return { ...state, activityLog: [entry, ...state.activityLog].slice(0, MAX_ACTIVITY_LOG_ENTRIES) }
    }
    case 'ADD_ADVERTISER': {
      const advertiser: Advertiser = {
        id: action.id,
        businessName: action.businessName,
        category: action.category,
        province: action.province,
        city: action.city,
        barangay: action.barangay,
        addressDetail: action.addressDetail,
        contactName: action.contactName,
        contactPhone: action.contactPhone,
        contactEmail: action.contactEmail,
        plan: action.plan,
        monthlyValue: action.monthlyValue,
        status: action.status,
        joinedAt: new Date().toISOString(),
        notes: action.notes,
      }
      return { ...state, advertisers: [advertiser, ...state.advertisers] }
    }
    case 'UPDATE_ADVERTISER':
      return {
        ...state,
        advertisers: state.advertisers.map((a) =>
          a.id === action.advertiserId
            ? {
                ...a,
                businessName: action.businessName,
                category: action.category,
                province: action.province,
                city: action.city,
                barangay: action.barangay,
                addressDetail: action.addressDetail,
                contactName: action.contactName,
                contactPhone: action.contactPhone,
                contactEmail: action.contactEmail,
                plan: action.plan,
                monthlyValue: action.monthlyValue,
                status: action.status,
                notes: action.notes,
              }
            : a,
        ),
      }
    case 'REMOVE_ADVERTISER':
      return { ...state, advertisers: state.advertisers.filter((a) => a.id !== action.advertiserId) }
    case 'ADD_CAMPAIGN': {
      const campaign: Campaign = {
        id: action.id,
        name: action.name,
        description: action.description,
        type: action.campaignType,
        targetAudience: action.targetAudience,
        startDate: action.startDate,
        endDate: action.endDate,
        rewardCoins: action.rewardCoins,
        rewardNote: action.rewardNote,
        budget: action.budget,
        dailyLimit: action.dailyLimit,
        weeklyLimit: action.weeklyLimit,
        monthlyLimit: action.monthlyLimit,
        status: action.status,
        advertiserId: action.advertiserId,
        reach: 0,
        clicks: 0,
        shares: 0,
        participants: 0,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      }
      return { ...state, campaigns: [campaign, ...state.campaigns] }
    }
    case 'UPDATE_CAMPAIGN':
      return {
        ...state,
        campaigns: state.campaigns.map((c) =>
          c.id === action.campaignId
            ? {
                ...c,
                name: action.name,
                description: action.description,
                type: action.campaignType,
                targetAudience: action.targetAudience,
                startDate: action.startDate,
                endDate: action.endDate,
                rewardCoins: action.rewardCoins,
                rewardNote: action.rewardNote,
                budget: action.budget,
                dailyLimit: action.dailyLimit,
                weeklyLimit: action.weeklyLimit,
                monthlyLimit: action.monthlyLimit,
                status: action.status,
                advertiserId: action.advertiserId,
                updatedAt: new Date().toISOString(),
              }
            : c,
        ),
      }
    case 'SET_CAMPAIGN_STATUS':
      return {
        ...state,
        campaigns: state.campaigns.map((c) =>
          c.id === action.campaignId ? { ...c, status: action.status, updatedAt: new Date().toISOString() } : c,
        ),
      }
    case 'UPDATE_CAMPAIGN_METRICS':
      return {
        ...state,
        campaigns: state.campaigns.map((c) =>
          c.id === action.campaignId
            ? {
                ...c,
                reach: action.reach,
                clicks: action.clicks,
                shares: action.shares,
                participants: action.participants,
                updatedAt: new Date().toISOString(),
              }
            : c,
        ),
      }
    case 'REMOVE_CAMPAIGN':
      return { ...state, campaigns: state.campaigns.filter((c) => c.id !== action.campaignId) }
    case 'ADD_PROMO_OFFER': {
      const offer: PromoOffer = {
        id: action.id,
        title: action.title,
        description: action.description,
        kind: action.kind,
        discountType: action.discountType,
        discountValue: action.discountValue,
        code: action.code,
        startDate: action.startDate,
        endDate: action.endDate,
        usageLimit: action.usageLimit,
        timesRedeemed: 0,
        status: action.status,
        createdAt: new Date().toISOString(),
      }
      return { ...state, promoOffers: [offer, ...state.promoOffers] }
    }
    case 'UPDATE_PROMO_OFFER':
      return {
        ...state,
        promoOffers: state.promoOffers.map((o) =>
          o.id === action.offerId
            ? {
                ...o,
                title: action.title,
                description: action.description,
                kind: action.kind,
                discountType: action.discountType,
                discountValue: action.discountValue,
                code: action.code,
                startDate: action.startDate,
                endDate: action.endDate,
                usageLimit: action.usageLimit,
                status: action.status,
              }
            : o,
        ),
      }
    case 'SET_PROMO_OFFER_STATUS':
      return {
        ...state,
        promoOffers: state.promoOffers.map((o) => (o.id === action.offerId ? { ...o, status: action.status } : o)),
      }
    case 'REMOVE_PROMO_OFFER':
      return { ...state, promoOffers: state.promoOffers.filter((o) => o.id !== action.offerId) }
    case 'SET_REWARD_RULES':
      return { ...state, rewardRules: action.rules }
    case 'ADD_COIN_TRANSACTION': {
      const tx: CoinTransaction = {
        id: action.id,
        actorType: action.actorType,
        actorId: action.actorId,
        actorName: action.actorName,
        direction: action.direction,
        source: action.source,
        amount: action.amount,
        campaignId: action.campaignId,
        note: action.note,
        recordedBy: action.recordedBy,
        at: new Date().toISOString(),
      }
      return { ...state, coinTransactions: [tx, ...state.coinTransactions] }
    }
    case 'REMOVE_COIN_TRANSACTION':
      return {
        ...state,
        coinTransactions: state.coinTransactions.filter((t) => t.id !== action.transactionId),
      }
    case 'ADD_RIDE_CREDIT_TIER':
      return {
        ...state,
        rideCreditTiers: [...state.rideCreditTiers, { id: action.id, coins: action.coins, pesoValue: action.pesoValue }],
      }
    case 'UPDATE_RIDE_CREDIT_TIER':
      return {
        ...state,
        rideCreditTiers: state.rideCreditTiers.map((t) =>
          t.id === action.tierId ? { ...t, coins: action.coins, pesoValue: action.pesoValue } : t,
        ),
      }
    case 'REMOVE_RIDE_CREDIT_TIER':
      return { ...state, rideCreditTiers: state.rideCreditTiers.filter((t) => t.id !== action.tierId) }
    case 'ADD_REFERRAL': {
      const referral: Referral = {
        id: action.id,
        code: action.code,
        referrerId: action.referrerId,
        referrerName: action.referrerName,
        referrerType: action.referrerType,
        referredName: action.referredName,
        referredPassengerId: action.referredPassengerId,
        registeredAt: action.referredPassengerId ? new Date().toISOString() : null,
        verifiedAt: null,
        firstRideAt: null,
        status: 'pending',
        coinsAwarded: 0,
        campaignId: action.campaignId,
        createdAt: new Date().toISOString(),
      }
      return { ...state, referrals: [referral, ...state.referrals] }
    }
    case 'SET_REFERRAL_STATUS':
      return {
        ...state,
        referrals: state.referrals.map((r) =>
          r.id === action.referralId
            ? {
                ...r,
                status: action.status,
                coinsAwarded: action.coinsAwarded,
                verifiedAt: action.status === 'qualified' || action.status === 'rewarded' ? (r.verifiedAt ?? new Date().toISOString()) : r.verifiedAt,
              }
            : r,
        ),
      }
    case 'REMOVE_REFERRAL':
      return { ...state, referrals: state.referrals.filter((r) => r.id !== action.referralId) }
    case 'SET_INCOME_PROMOTION_SETTINGS':
      return { ...state, incomePromotionSettings: action.settings }
    case 'ADD_PARTNERSHIP_REVENUE': {
      const entry: PartnershipRevenueEntry = {
        id: action.id,
        partnerName: action.partnerName,
        description: action.description,
        amount: action.amount,
        recordedAt: new Date().toISOString(),
        recordedBy: action.recordedBy,
      }
      return { ...state, partnershipRevenue: [entry, ...state.partnershipRevenue] }
    }
    case 'REMOVE_PARTNERSHIP_REVENUE':
      return { ...state, partnershipRevenue: state.partnershipRevenue.filter((e) => e.id !== action.entryId) }
    case 'SET_ADSENSE_SETTINGS':
      return { ...state, adSenseSettings: action.settings }
    case 'CREATE_MEDS_ORDER': {
      const subtotal = action.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
      const hasRxItem = action.items.some(
        (item) => state.medicineProducts.find((p) => p.id === item.productId)?.category === 'rx',
      )
      const pricedFromMenu = action.pricedFromMenu ?? false
      // A priced-from-menu order has no separate quote-accept step for the
      // customer to pay at (see VENDOR_ACCEPT_MENU_ORDER) — an online method
      // is simulated as paid immediately, right here, same "Prototype ·
      // Simulated data" treatment CUSTOMER_ACCEPT_QUOTE gives a pharmacy
      // order once its quote is accepted. A regular quote-pipeline order is
      // unaffected: paidOnline only ever flips true there once accepted.
      const paidOnline = pricedFromMenu && action.paymentMethod !== 'cash'
      // A vendor's delivery is priced like every ride: the TODA fare from the
      // store to the door plus the admin's per-ride booking fee. Pharmacy
      // orders keep their flat defaults.
      const orderPharmacy = state.pharmacies.find((p) => p.id === action.pharmacyId)
      const fare = orderPharmacy && orderPharmacy.businessType !== 'pharmacy'
        ? vendorDeliveryFareQuote(state, orderPharmacy, action.deliveryAddress)
        : { todaFare: DEFAULT_MEDS_DELIVERY_FEE, bookingFee: DEFAULT_MEDS_SERVICE_FEE }
      const order: MedsOrder = {
        id: `meds-${Date.now()}`,
        customerId: action.customerId,
        customerName: action.customerName,
        pharmacyId: action.pharmacyId,
        items: action.items,
        subtotal,
        deliveryFee: fare.todaFare,
        serviceFee: fare.bookingFee,
        total: subtotal + fare.todaFare + fare.bookingFee,
        paymentMethod: action.paymentMethod,
        status: 'pending_confirmation',
        rejectionReason: null,
        prescriptionDataUrls: action.prescriptionDataUrls,
        prescriptionStatus: hasRxItem ? 'pending' : 'not_required',
        receiptDataUrl: null,
        deliveryAddress: action.deliveryAddress,
        deliveryMode: action.deliveryMode,
        linkedRideId: null,
        paymentProofDataUrl: null,
        paidOnline,
        paymentReference: paidOnline ? `ONLINE-${Date.now()}` : null,
        requestedAt: new Date().toISOString(),
        quotedAt: null,
        confirmedAt: null,
        messages: [],
        contactPhone: action.contactPhone ?? null,
        pricedFromMenu,
      }
      return { ...state, medsOrders: [order, ...state.medsOrders] }
    }
    // Pharmacy prices the order (defaulting to each product's catalog price,
    // but free to override any line item for this specific request — e.g.
    // brand substitution, a price change since the catalog was last
    // updated) and sends it back to the customer as a quote. Requires the
    // prescription (if one was needed) to already be reviewed — mirrors the
    // driver document-verification gate elsewhere in this app.
    case 'PHARMACY_SEND_QUOTE': {
      const order = state.medsOrders.find((o) => o.id === action.orderId)
      if (!order || order.status !== 'pending_confirmation' || order.prescriptionStatus === 'pending') return state
      const subtotal = action.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
      return {
        ...state,
        medsOrders: state.medsOrders.map((o) =>
          o.id === action.orderId
            ? {
                ...o,
                items: action.items,
                subtotal,
                total: subtotal + o.deliveryFee + o.serviceFee,
                status: 'quoted',
                receiptDataUrl: action.receiptDataUrl,
                quotedAt: new Date().toISOString(),
              }
            : o,
        ),
      }
    }
    // See VENDOR_ACCEPT_MENU_ORDER's action-type comment — goes straight to
    // 'confirmed' the same way CUSTOMER_ACCEPT_QUOTE does, but triggered by
    // the vendor rather than the customer, since there's no quote here for a
    // customer to accept. PHARMACY_PROCESS_MEDS_ORDER picks it up from here
    // exactly as it would a quoted-and-accepted pharmacy order.
    case 'VENDOR_ACCEPT_MENU_ORDER': {
      const order = state.medsOrders.find((o) => o.id === action.orderId)
      if (!order || order.status !== 'pending_confirmation' || !order.pricedFromMenu) return state
      // Draw down today's stock count (see MedicineProduct.stockCount) by
      // what was just accepted — a vendor tracking servings this way never
      // has to remember to close an item by hand once it runs out.
      const orderedQtyByProduct = new Map(order.items.map((item) => [item.productId, item.quantity]))
      return {
        ...state,
        medsOrders: state.medsOrders.map((o) =>
          o.id === action.orderId ? { ...o, status: 'confirmed', confirmedAt: new Date().toISOString() } : o,
        ),
        medicineProducts: state.medicineProducts.map((p) => {
          const qty = orderedQtyByProduct.get(p.id)
          if (!qty || p.stockCount == null) return p
          const remaining = Math.max(0, p.stockCount - qty)
          return { ...p, stockCount: remaining, inStock: remaining > 0 ? p.inStock : false }
        }),
      }
    }
    case 'VENDOR_SEND_QUOTE': {
      const order = state.medsOrders.find((o) => o.id === action.orderId)
      if (!order || order.status !== 'pending_confirmation' || !order.pricedFromMenu) return state
      const deliveryFee = Math.max(0, Math.round(action.deliveryFee))
      // The booking fee is the platform's per-ride fee as the admin has it
      // set at the moment of quoting — not the placeholder the order was
      // created with.
      const serviceFee = Math.max(0, Math.round(state.commissionPerRide))
      return {
        ...state,
        medsOrders: state.medsOrders.map((o) =>
          o.id === action.orderId
            ? {
                ...o,
                deliveryFee,
                serviceFee,
                total: o.subtotal + deliveryFee + serviceFee,
                status: 'quoted',
                quotedAt: new Date().toISOString(),
              }
            : o,
        ),
      }
    }
    case 'PHARMACY_REJECT_MEDS_ORDER':
      return {
        ...state,
        medsOrders: state.medsOrders.map((o) =>
          o.id === action.orderId && (o.status === 'pending_confirmation' || o.status === 'quoted')
            ? { ...o, status: 'rejected', rejectionReason: action.reason }
            : o,
        ),
      }
    case 'CANCEL_MEDS_ORDER':
      return {
        ...state,
        medsOrders: state.medsOrders.map((o) =>
          o.id === action.orderId &&
          (o.status === 'pending_confirmation' || o.status === 'quoted' || o.status === 'confirmed')
            ? { ...o, status: 'cancelled' }
            : o,
        ),
      }
    case 'VENDOR_SWITCH_TO_OTHER_DELIVERY': {
      const order = state.medsOrders.find((o) => o.id === action.orderId)
      if (!order || order.status !== 'dispatched' || !order.linkedRideId) return state
      const ride = state.rides.find((r) => r.id === order.linkedRideId)
      // Only while nobody has accepted yet — once a driver is on the way,
      // pulling the ride out from under them is a cancellation, not a
      // delivery-method switch. That's still DRIVER_CANCEL_RIDE/CANCEL_RIDE's job.
      if (!ride || ride.status !== 'requested') return state
      return {
        ...state,
        rides: state.rides.map((r) =>
          r.id === ride.id ? { ...r, status: 'cancelled', cancelledBy: 'vendor', cancelledAt: new Date().toISOString() } : r,
        ),
        medsOrders: state.medsOrders.map((o) =>
          o.id === action.orderId ? { ...o, status: 'confirmed', linkedRideId: null, deliveryMode: 'vendor_other' } : o,
        ),
      }
    }
    case 'VENDOR_MARK_DELIVERED_OTHER':
      return {
        ...state,
        medsOrders: state.medsOrders.map((o) =>
          o.id === action.orderId && o.status === 'confirmed' && o.deliveryMode === 'vendor_other'
            ? { ...o, status: 'delivered' }
            : o,
        ),
      }
    case 'SEND_MEDS_ORDER_MESSAGE': {
      const order = state.medsOrders.find((o) => o.id === action.orderId)
      if (!order || !action.text.trim()) return state
      const message: OrderMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sender: action.sender,
        text: action.text.trim(),
        sentAt: new Date().toISOString(),
      }
      return {
        ...state,
        medsOrders: state.medsOrders.map((o) => (o.id === action.orderId ? { ...o, messages: [...o.messages, message] } : o)),
      }
    }
    case 'REVIEW_MEDS_PRESCRIPTION':
      return {
        ...state,
        medsOrders: state.medsOrders.map((o) =>
          o.id === action.orderId
            ? {
                ...o,
                prescriptionStatus: action.approved ? 'approved' : 'rejected',
                rejectionReason: action.approved ? o.rejectionReason : action.reason,
              }
            : o,
        ),
      }
    // The customer accepts the pharmacy's quote and checks out — this is
    // the gate the pharmacy waits behind: PHARMACY_PROCESS_MEDS_ORDER
    // refuses to run until an order reaches 'confirmed'. An online method
    // (gcash/maya/card) is treated as paid immediately (same "Prototype ·
    // Simulated data" spirit as the rest of the app — no real gateway, just
    // an instant recorded confirmation); cash stays unpaid here and is
    // still collected/confirmed at delivery via the linked Ride's existing
    // payment flow, unchanged.
    case 'CUSTOMER_ACCEPT_QUOTE': {
      const order = state.medsOrders.find((o) => o.id === action.orderId)
      if (!order || order.status !== 'quoted') return state
      const paidOnline = action.paymentMethod !== 'cash'
      // A vendor order draws down today's servings the moment the customer
      // approves — that is when the kitchen starts on it (see
      // MedicineProduct.stockCount; the same draw-down VENDOR_ACCEPT_MENU_ORDER
      // does for the quote-less path).
      const orderedQtyByProduct = order.pricedFromMenu ? new Map(order.items.map((item) => [item.productId, item.quantity])) : null
      return {
        ...state,
        medicineProducts: orderedQtyByProduct
          ? state.medicineProducts.map((p) => {
              const qty = orderedQtyByProduct.get(p.id)
              if (!qty || p.stockCount == null) return p
              const remaining = Math.max(0, p.stockCount - qty)
              return { ...p, stockCount: remaining, inStock: remaining > 0 ? p.inStock : false }
            })
          : state.medicineProducts,
        medsOrders: state.medsOrders.map((o) =>
          o.id === action.orderId
            ? {
                ...o,
                paymentMethod: action.paymentMethod,
                status: 'confirmed',
                paidOnline,
                paymentReference: paidOnline ? `ONLINE-${Date.now()}` : null,
                paymentProofDataUrl: action.paymentProofDataUrl,
                deliveryMode: action.deliveryMode,
                confirmedAt: new Date().toISOString(),
              }
            : o,
        ),
      }
    }
    // Only runs once the customer has checked out (status 'confirmed') —
    // dispatches a real Ride right away for 'pharmacy_books' orders, or
    // leaves the order at 'ready_for_pickup' for the customer to dispatch
    // themselves via MEDS_ORDER_BOOK_OWN_RIDE for 'self_book' orders.
    case 'PHARMACY_PROCESS_MEDS_ORDER': {
      const order = state.medsOrders.find((o) => o.id === action.orderId)
      const pharmacy = order ? state.pharmacies.find((p) => p.id === order.pharmacyId) : undefined
      if (!order || !pharmacy || order.status !== 'confirmed') return state
      if (order.deliveryMode === 'self_book') {
        return {
          ...state,
          medsOrders: state.medsOrders.map((o) => (o.id === action.orderId ? { ...o, status: 'ready_for_pickup' } : o)),
        }
      }
      const ride = buildMedsDeliveryRide(state, order, pharmacy, { preferredDriverId: action.preferredDriverId ?? null })
      return {
        ...state,
        rides: [ride, ...state.rides],
        medsOrders: state.medsOrders.map((o) => (o.id === action.orderId ? { ...o, status: 'dispatched', linkedRideId: ride.id } : o)),
      }
    }
    case 'MEDS_ORDER_BOOK_OWN_RIDE': {
      const order = state.medsOrders.find((o) => o.id === action.orderId)
      const pharmacy = order ? state.pharmacies.find((p) => p.id === order.pharmacyId) : undefined
      if (!order || !pharmacy || order.status !== 'ready_for_pickup') return state
      const ride = buildMedsDeliveryRide(state, order, pharmacy, action.overrides)
      return {
        ...state,
        rides: [ride, ...state.rides],
        medsOrders: state.medsOrders.map((o) =>
          o.id === action.orderId
            ? {
                ...o,
                status: 'dispatched',
                linkedRideId: ride.id,
                // A redirected drop-off is now where this order is actually
                // going — leaving the old address on the record would have
                // the pharmacy's copy disagreeing with the driver's.
                deliveryAddress: ride.dropoff,
              }
            : o,
        ),
      }
    }
    // The vendor's own booking: an order that arrived by phone or at the
    // counter, given a driver through the same pipeline an in-app order
    // takes. It is born 'dispatched' with its ride — there is nothing to
    // accept or quote, the vendor already has the order in hand — so it lands
    // in the vendor's "Out for delivery" tracking straight away, and the
    // driver sees exactly what a customer-placed vendor order looks like.
    // "Add a sample order" on the vendor portal: an already-accepted order
    // from a made-up customer, built from the vendor's own menu and dropped
    // a few streets from the store, so Book Rider can be tried without a
    // second phone placing a real order. It goes through dispatch exactly
    // like a real one — a driver will be offered it — so it is labelled as a
    // sample everywhere it shows.
    case 'ADD_VENDOR_SAMPLE_ORDER': {
      const pharmacy = state.pharmacies.find((p) => p.id === action.pharmacyId)
      if (!pharmacy) return state
      const menu = state.medicineProducts.filter((p) => p.pharmacyId === pharmacy.id && p.visible !== false && p.inStock)
      const picks = (menu.length > 0 ? menu : state.medicineProducts.filter((p) => p.pharmacyId === pharmacy.id)).slice(0, 2)
      const items: MedsOrderItem[] =
        picks.length > 0
          ? picks.map((p, i) => ({ productId: p.id, name: p.name, quantity: i === 0 ? 2 : 1, unitPrice: p.price, note: null }))
          : [{ productId: 'sample', name: 'Sample meal', quantity: 1, unitPrice: 100, note: null }]
      const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
      const storeGps = pharmacy.locationGps ?? { lat: 15.7940977, lng: 120.9905849 }
      // ~700 m north-east of the store: close enough to be a real delivery,
      // far enough that the map shows two distinct pins.
      const dropGps = { lat: storeGps.lat + 0.005, lng: storeGps.lng + 0.004 }
      const now = new Date().toISOString()
      const deliveryAddress: MockLocation = {
        id: `sample-drop-${Date.now()}`,
        label: `Sample delivery — near ${pharmacy.barangay || 'Poblacion'}, ${pharmacy.city}`,
        coords: { x: Math.min(95, pharmacy.coords.x + 8), y: Math.min(95, pharmacy.coords.y + 6) },
        gps: dropGps,
        province: pharmacy.province,
        city: pharmacy.city,
        barangay: pharmacy.barangay,
      }
      const fare = vendorDeliveryFareQuote(state, pharmacy, deliveryAddress)
      const order: MedsOrder = {
        id: `meds-sample-${Date.now()}`,
        customerId: `sample-${Date.now()}`,
        customerName: 'Sample Customer (demo)',
        pharmacyId: pharmacy.id,
        items,
        subtotal,
        deliveryFee: fare.todaFare,
        serviceFee: fare.bookingFee,
        total: subtotal + fare.todaFare + fare.bookingFee,
        paymentMethod: 'cash',
        status: 'confirmed',
        rejectionReason: null,
        prescriptionDataUrls: [],
        prescriptionStatus: 'not_required',
        receiptDataUrl: null,
        deliveryAddress,
        deliveryMode: 'pharmacy_books',
        linkedRideId: null,
        paymentProofDataUrl: null,
        paidOnline: false,
        paymentReference: null,
        requestedAt: now,
        quotedAt: null,
        confirmedAt: now,
        messages: [],
        contactPhone: '0917-000-0000',
        pricedFromMenu: true,
      }
      return { ...state, medsOrders: [order, ...state.medsOrders] }
    }
    case 'VENDOR_BOOK_DELIVERY': {
      const pharmacy = state.pharmacies.find((p) => p.id === action.pharmacyId)
      if (!pharmacy || !action.customerName.trim()) return state
      const now = new Date().toISOString()
      const goods = Math.max(0, Math.round(action.goodsAmount))
      const paidToVendor = action.collection === 'paid'
      const fare = vendorDeliveryFareQuote(state, pharmacy, action.deliveryAddress)
      const order: MedsOrder = {
        id: `meds-${Date.now()}`,
        // No account behind a walk-in customer — a synthetic id keeps every
        // "my orders" filter (customerId === session id) from ever matching.
        customerId: `walkin-${Date.now()}`,
        customerName: action.customerName.trim(),
        pharmacyId: pharmacy.id,
        items: [{ productId: 'vendor-booked', name: action.itemsSummary.trim() || 'Order', quantity: 1, unitPrice: goods, note: null }],
        subtotal: goods,
        deliveryFee: fare.todaFare,
        serviceFee: fare.bookingFee,
        total: goods + fare.todaFare + fare.bookingFee,
        // 'gcash' here only means "settled with the vendor already" — it is
        // what makes buildMedsDeliveryRide charge the driver's fare as fees
        // only, instead of goods + fees collected on the doorstep.
        paymentMethod: paidToVendor ? 'gcash' : 'cash',
        status: 'dispatched',
        rejectionReason: null,
        prescriptionDataUrls: [],
        prescriptionStatus: 'not_required',
        receiptDataUrl: null,
        deliveryAddress: action.deliveryAddress,
        deliveryMode: 'pharmacy_books',
        linkedRideId: null,
        paymentProofDataUrl: null,
        paidOnline: paidToVendor,
        paymentReference: paidToVendor ? `VENDOR-${Date.now()}` : null,
        requestedAt: now,
        quotedAt: null,
        confirmedAt: now,
        messages: [],
        contactPhone: action.contactPhone.trim() || null,
        pricedFromMenu: true,
        vendorBooked: true,
      }
      const ride = buildMedsDeliveryRide(state, order, pharmacy, { preferredDriverId: action.preferredDriverId ?? null })
      return {
        ...state,
        rides: [ride, ...state.rides],
        medsOrders: [{ ...order, linkedRideId: ride.id }, ...state.medsOrders],
      }
    }
    case 'REGISTER_PHARMACY': {
      const pharmacy: Pharmacy = {
        id: action.id,
        name: action.name,
        businessType: action.businessType,
        adminPin: action.adminPin,
        contactPhone: action.contactPhone,
        province: action.province,
        city: action.city,
        barangay: action.barangay,
        addressDetail: action.addressDetail,
        coords: action.coords,
        locationGps: action.locationGps,
        isOpen: true,
        // Self-service signups go live immediately, same as the seeded
        // pharmacies — no Admin-approval workflow built for MEDS yet.
        verificationStatus: 'approved',
        gcashAccount: null,
        mayaAccount: null,
      }
      return { ...state, pharmacies: [...state.pharmacies, pharmacy] }
    }
    case 'UPDATE_PHARMACY_PAYMENT_ACCOUNT': {
      return {
        ...state,
        pharmacies: state.pharmacies.map((p) =>
          p.id === action.pharmacyId
            ? { ...p, [action.method === 'gcash' ? 'gcashAccount' : 'mayaAccount']: action.details }
            : p,
        ),
      }
    }
    case 'SET_VENDOR_BANNER_THUMB':
      return {
        ...state,
        pharmacies: state.pharmacies.map((p) =>
          p.id === action.pharmacyId ? { ...p, bannerThumbDataUrl: action.dataUrl, bannerThumbKey: action.key } : p,
        ),
      }
    case 'UPDATE_VENDOR_BRANDING': {
      return {
        ...state,
        pharmacies: state.pharmacies.map((p) =>
          p.id === action.pharmacyId
            ? {
                ...p,
                coverPhotoDataUrl: action.coverPhotoDataUrl,
                coverPhotoPosition: action.coverPhotoPosition,
                bannerBackgroundDataUrl: action.bannerBackgroundDataUrl,
                logoDataUrl: action.logoDataUrl,
                themeColor: action.themeColor,
                tagline: action.tagline,
              }
            : p,
        ),
      }
    }
    case 'UPDATE_PHARMACY_LOCATION': {
      return {
        ...state,
        pharmacies: state.pharmacies.map((p) =>
          p.id === action.pharmacyId ? { ...p, locationGps: action.locationGps } : p,
        ),
      }
    }
    // One review per customer: rating the same store again replaces what
    // they said before rather than stacking a second vote, so a regular
    // customer counts once in the average like everyone else.
    case 'RATE_PHARMACY': {
      const rating = Math.max(1, Math.min(5, Math.round(action.rating)))
      const review: StoreReview = {
        customerId: action.customerId,
        customerName: action.customerName,
        rating,
        text: action.text?.trim() || null,
        at: new Date().toISOString(),
      }
      return {
        ...state,
        pharmacies: state.pharmacies.map((p) =>
          p.id === action.pharmacyId
            ? { ...p, storeReviews: [review, ...(p.storeReviews ?? []).filter((r) => r.customerId !== action.customerId)] }
            : p,
        ),
      }
    }
    // The vendor's feed. Newest first, and only the latest twenty are kept:
    // each post can carry a photo, and the feed lives inside the shared
    // state every phone downloads.
    case 'ADD_VENDOR_POST': {
      const text = action.text.trim()
      if (!text && !action.photoDataUrl) return state
      const post: VendorPost = {
        id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        text,
        photoDataUrl: action.photoDataUrl,
        sharePhotoDataUrl: action.sharePhotoDataUrl ?? null,
        productId: action.productId,
        createdAt: new Date().toISOString(),
      }
      return {
        ...state,
        pharmacies: state.pharmacies.map((p) => {
          if (p.id !== action.pharmacyId) return p
          // The newest MAX_VENDOR_POSTS stay; whatever falls off is
          // tombstoned so a device still holding it does not restore it
          // (see mergeVendorPosts).
          const all = [post, ...(p.posts ?? [])]
          const kept = all.slice(0, MAX_VENDOR_POSTS)
          const dropped = all.slice(MAX_VENDOR_POSTS).map((old) => old.id)
          return {
            ...p,
            posts: kept,
            removedPostIds: dropped.length ? [...new Set([...(p.removedPostIds ?? []), ...dropped])].slice(-50) : p.removedPostIds,
          }
        }),
      }
    }
    case 'SET_VENDOR_POST_SHARE_PHOTO':
      return {
        ...state,
        pharmacies: state.pharmacies.map((p) =>
          p.id !== action.pharmacyId
            ? p
            : { ...p, posts: (p.posts ?? []).map((post) => (post.id === action.postId ? { ...post, sharePhotoDataUrl: action.dataUrl } : post)) },
        ),
      }
    case 'REMOVE_VENDOR_POST':
      return {
        ...state,
        pharmacies: state.pharmacies.map((p) =>
          p.id === action.pharmacyId
            ? {
                ...p,
                posts: (p.posts ?? []).filter((post) => post.id !== action.postId),
                // The tombstone — see mergeVendorPosts.
                removedPostIds: [...new Set([...(p.removedPostIds ?? []), action.postId])].slice(-50),
              }
            : p,
        ),
      }
    // A reaction toggles: tap once to like, again to take it back. One
    // entry per account either way.
    case 'REACT_VENDOR_POST': {
      const key = action.reaction === 'like' ? 'likes' : 'hearts'
      return {
        ...state,
        pharmacies: state.pharmacies.map((p) =>
          p.id !== action.pharmacyId
            ? p
            : {
                ...p,
                posts: (p.posts ?? []).map((post) => {
                  if (post.id !== action.postId) return post
                  const current = post[key] ?? []
                  const next = current.includes(action.actorId)
                    ? current.filter((id) => id !== action.actorId)
                    : [...current, action.actorId]
                  return { ...post, [key]: next }
                }),
              },
        ),
      }
    }
    case 'COMMENT_VENDOR_POST': {
      const text = action.text.trim()
      if (!text) return state
      const comment: VendorPostComment = {
        id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        authorId: action.authorId,
        authorName: action.authorName,
        text: text.slice(0, 500),
        createdAt: new Date().toISOString(),
      }
      return {
        ...state,
        pharmacies: state.pharmacies.map((p) =>
          p.id !== action.pharmacyId
            ? p
            : {
                ...p,
                posts: (p.posts ?? []).map((post) =>
                  // Capped so a busy post cannot grow the shared state
                  // without bound; the newest fifty stay.
                  post.id === action.postId ? { ...post, comments: [...(post.comments ?? []), comment].slice(-50) } : post,
                ),
              },
        ),
      }
    }
    case 'TOGGLE_PHARMACY_TRUSTED_DRIVER': {
      return {
        ...state,
        pharmacies: state.pharmacies.map((p) => {
          if (p.id !== action.pharmacyId) return p
          const current = p.trustedDriverIds ?? []
          const trustedDriverIds = current.includes(action.driverId)
            ? current.filter((id) => id !== action.driverId)
            : [...current, action.driverId]
          return { ...p, trustedDriverIds }
        }),
      }
    }
    case 'ADD_MEDICINE_PRODUCT': {
      const product: MedicineProduct = {
        id: action.id,
        pharmacyId: action.pharmacyId,
        name: action.name,
        genericName: action.genericName,
        category: action.category,
        price: action.price,
        inStock: true,
        menuCategory: action.menuCategory ?? null,
        photoDataUrl: action.photoDataUrl ?? null,
        description: action.description ?? null,
        badge: action.badge ?? null,
        stockCount: action.stockCount ?? null,
      }
      return { ...state, medicineProducts: [...state.medicineProducts, product] }
    }
    case 'UPDATE_MEDICINE_PRODUCT':
      return {
        ...state,
        medicineProducts: state.medicineProducts.map((p) =>
          p.id === action.productId
            ? {
                ...p,
                name: action.name,
                genericName: action.genericName,
                category: action.category,
                price: action.price,
                menuCategory: action.menuCategory,
                photoDataUrl: action.photoDataUrl,
                description: action.description,
                badge: action.badge,
                stockCount: action.stockCount,
              }
            : p,
        ),
      }
    case 'REMOVE_MEDICINE_PRODUCT':
      return {
        ...state,
        medicineProducts: state.medicineProducts.filter((p) => p.id !== action.productId),
      }
    case 'REORDER_MEDICINE_PRODUCTS': {
      const rank = new Map(action.orderedIds.map((id, i) => [id, i]))
      return {
        ...state,
        medicineProducts: state.medicineProducts.map((p) => (rank.has(p.id) ? { ...p, sortIndex: rank.get(p.id)! } : p)),
      }
    }
    case 'TOGGLE_MEDICINE_PRODUCT_STOCK':
      return {
        ...state,
        medicineProducts: state.medicineProducts.map((p) =>
          p.id === action.productId ? { ...p, inStock: !p.inStock } : p,
        ),
      }
    case 'TOGGLE_MEDICINE_PRODUCT_VISIBILITY':
      return {
        ...state,
        medicineProducts: state.medicineProducts.map((p) =>
          p.id === action.productId ? { ...p, visible: p.visible === false } : p,
        ),
      }
    case 'SET_MEDICINE_PRODUCT_STOCK_COUNT':
      return {
        ...state,
        medicineProducts: state.medicineProducts.map((p) =>
          p.id === action.productId
            ? { ...p, stockCount: action.stockCount, inStock: action.stockCount === 0 ? false : p.inStock }
            : p,
        ),
      }
    default:
      return state
  }
}

interface RideContextValue extends RideState {
  requestRide: (args: {
    passengerId: string
    passengerName: string
    passengerPhone?: string | null
    pickup: MockLocation
    dropoff: MockLocation
    paymentMethod: PaymentMethod
    isStudentRide: boolean
    isPwdSeniorRide: boolean
    pickupGps: GeoCoords | null
    passengerCount: number
    serviceType?: ServiceType
    pabiliItems?: string | null
    packageNote?: string | null
    tip?: number
    bookedByParentId?: string | null
    specialPickupRequested?: boolean
    specialTrip?: boolean
    requestedDriverId?: string | null
    bookedAtTerminal?: boolean
    destinationPending?: boolean
    boardedWithDriverId?: string | null
    unregisteredPlate?: string | null
    initialPhotos?: RidePhoto[]
    prescriptionDataUrls?: string[]
    seniorIdDataUrl?: string | null
    otherDocDataUrl?: string | null
    paymentProofDataUrl?: string | null
  }) => void
  requestGroupRide: (args: {
    bookedByPassengerId: string
    pickup: MockLocation
    pickupGps: GeoCoords | null
    paymentMethod: PaymentMethod
    requestedDriverId?: string | null
    paySplit: 'separate' | 'booker'
    riders: {
      passengerId: string
      passengerName: string
      passengerPhone: string | null
      dropoff: MockLocation
      isStudentRide: boolean
      isPwdSeniorRide: boolean
    }[]
  }) => void
  reportDriverGps: (driverId: string, gps: GeoCoords) => void
  acceptRide: (rideId: string, driverId: string) => void
  declineRide: (rideId: string, driverId: string) => void
  startRide: (rideId: string, driverGps?: GeoCoords | null) => void
  // The passenger saying they are off — hands the ride to the driver for
  // payment confirmation rather than completing it.
  confirmPassengerArrival: (rideId: string, actualDropoff?: Ride['actualDropoff']) => void
  clearAllRides: () => void
  completeRide: (rideId: string, paidMethod?: PaymentMethod) => void
  cancelRide: (rideId: string) => void
  setPabiliItemBought: (rideId: string, index: number, bought: boolean) => void
  driverCancelRide: (rideId: string, reason: RideCancellationReason, note: string | null) => void
  addTipOffer: (rideId: string, amount: number) => void
  acknowledgeRidePayment: (rideId: string, method: PaymentMethod, referenceNo?: string | null) => void
  updateDriverLiveGps: (rideId: string, gps: GeoCoords | null) => void
  updatePassengerLiveGps: (rideId: string, gps: GeoCoords | null) => void
  triggerSos: (rideId: string, triggeredBy: string, source?: SosTriggerSource, location?: GeoCoords | null) => void
  triggerDriverSos: (driverId: string, location: GeoCoords | null, notes?: string | null, source?: SosTriggerSource) => void
  triggerPassengerSos: (passengerId: string, location: GeoCoords | null, notes?: string | null) => void
  resolveAlert: (alertId: string, actorName?: string, actorRole?: SosEvent['actorRole'], notes?: string | null) => void
  acknowledgeAlert: (alertId: string, actorName: string, actorRole: SosEvent['actorRole']) => void
  setAlertResponding: (alertId: string, actorName: string, actorRole: SosEvent['actorRole']) => void
  cancelAlert: (alertId: string, actorName: string, actorRole: SosEvent['actorRole'], notes?: string | null) => void
  logAlertEvent: (alertId: string, kind: SosEventKind, summary: string, actorName: string, actorRole: SosEvent['actorRole']) => void
  setSafetySettings: (patch: Partial<SafetySettings>) => void
  setPassengerEmergencyContacts: (passengerId: string, contacts: EmergencyContact[]) => void
  logPossibleCrash: (args: { actorId: string; role: SosTriggeredByRole; rideId: string | null; location: GeoCoords | null; outcome: 'ok' | 'timeout' }) => void
  // The one-tap "Send SMS" action on a queued contact notification (see
  // SafetyIncidentCard) — a person triggers this, nothing sends on its own.
  // Awaits the real Semaphore call in lib/sosSmsApi.ts, then records what
  // happened via SET_NOTIFICATION_STATUS.
  sendContactSms: (alertId: string, notificationId: string, actorName: string) => Promise<void>
  approveDriver: (driverId: string) => void
  rejectDriver: (driverId: string, reason?: string | null) => void
  appealDriverRejection: (driverId: string, message: string) => void
  resubmitDriverDocument: (driverId: string, docType: DocumentType, dataUrl: string) => void
  addSafetyPhoto: (rideId: string, dataUrl: string, takenBy: string) => void
  setCommission: (amount: number) => void
  resetAccountPin: (kind: RecoveryKind, id: string, pin: string) => void
  suspendAccount: (input: { kind: AccountKind; accountId: string; accountName: string; reason: string; days: number }) => void
  liftSuspension: (suspensionId: string) => void
  sendAdminNote: (input: { kind: AccountKind; accountId: string; accountName: string; message: string }) => void
  sendSupportMessage: (input: {
    name: string
    email: string
    phone: string
    category: SupportCategory
    message: string
    fromRole: string | null
  }) => void
  setSupportMessageStatus: (id: string, status: 'new' | 'handled') => void
  publishAnnouncement: (input: {
    title: string
    body: string
    category: AnnouncementCategory
    audience: AnnouncementAudience
  }) => void
  setAnnouncementActive: (announcementId: string, active: boolean) => void
  removeAnnouncement: (announcementId: string) => void
  setBannerAdSlot: (index: number, ad: BannerAd | null) => void
  setPabiliEnabled: (enabled: boolean) => void
  setRewardsEnabled: (enabled: boolean) => void
  setMedsEnabled: (enabled: boolean) => void
  setVendorsEnabled: (enabled: boolean) => void
  setPartnerBannerEnabled: (enabled: boolean) => void
  setSimulatedOtpEnabled: (enabled: boolean) => void
  setPublicBaseUrl: (url: string) => void
  setPilotTodaName: (name: string) => void
  setSimulateMovementEnabled: (enabled: boolean) => void
  setLiveGpsEnabled: (enabled: boolean) => void
  setOpenDriverSignup: (enabled: boolean) => void
  setDocumentGraceDays: (days: number) => void
  addEmergencyHotline: (args: Omit<EmergencyHotline, 'id' | 'addedAt'>) => void
  updateEmergencyHotline: (id: string, updates: Partial<Omit<EmergencyHotline, 'id'>>) => void
  removeEmergencyHotline: (id: string) => void
  joinTerminalQueue: (driverId: string, driverGps: GeoCoords | null) => void
  leaveTerminalQueue: (driverId: string) => void
  setDriverHomeTerminal: (driverId: string, terminalId: string | null) => void
  setDriverPaymentAccount: (
    driverId: string,
    wallet: 'gcash' | 'maya',
    details: PaymentAccountDetails | null,
  ) => void
  setTerminalQrFeeWaived: (waived: boolean) => void
  setTripLegSeconds: (seconds: number) => void
  setPilaBanner: (dataUrl: string | null) => void
  setRideDestination: (rideId: string, dropoff: MockLocation) => void
  setRequestedDriver: (passengerId: string, driverId: string | null) => void
  recordPlatformFeePayment: (payment: PlatformFeePayment) => void
  requestDriverWithdrawal: (withdrawal: DriverWithdrawal) => void
  settleDriverWithdrawal: (
    withdrawalId: string,
    status: 'paid' | 'rejected',
    reference: string | null,
    note: string | null,
  ) => void
  setPlatformGcashAccount: (account: PaymentAccountDetails) => void
  setTodaQueueWindowMs: (ms: number) => void
  setQueueOfferTimeoutMs: (ms: number) => void
  setSpecialPickupEscalationMs: (ms: number) => void
  setFavoriteDriver: (passengerId: string, driverId: string | null) => void
  setParentFavoriteDriver: (parentId: string, driverId: string | null) => void
  proposeTodaCommission: (todaOrgId: string, amount: number | null) => void
  setTodaCommissionMemberApproval: (todaOrgId: string, approved: boolean) => void
  setTodaCommissionAdminApproval: (todaOrgId: string, approved: boolean) => void
  addDuesRecord: (args: {
    todaOrgId: string
    driverIds: string[]
    duesType: DuesType
    label: string
    amount: number
    dueDate: string
  }) => void
  markDuesPaid: (duesRecordId: string) => void
  requestMembershipAction: (args: {
    todaOrgId: string
    driverId: string
    requestType: MembershipRequestType
    reason: string
  }) => void
  resolveMembershipRequest: (requestId: string, approve: boolean) => void
  setDriverAccess: (driverId: string, accessStatus: DriverAccessStatus, accessNote: string | null) => void
  setDriverPabiliPriority: (driverId: string, enabled: boolean) => void
  setDriverOnline: (driverId: string, online: boolean) => void
  updatePassengerProfile: (
    passengerId: string,
    updates: {
      name: string
      phone: string
      email: string | null
      pin: string | null
      paymentDetail: string | null
      password: string | null
      guardianPhone: string | null
    },
  ) => void
  updateDriverProfile: (
    driverId: string,
    updates: {
      name: string
      phone: string
      email: string | null
      pin: string
      paymentDetail: string | null
      password: string | null
      emergencyContact: string | null
    },
  ) => void
  updateParentProfile: (
    parentId: string,
    updates: {
      name: string
      phone: string
      email: string | null
      pin: string | null
      paymentDetail: string | null
      password: string | null
      emergencyContact: string | null
    },
  ) => void
  updatePharmacyProfile: (
    pharmacyId: string,
    updates: {
      name: string
      phone: string
      email: string | null
      pin: string
      paymentDetail: string | null
      password: string | null
      emergencyContact: string | null
    },
  ) => void
  setDuesGracePeriodDays: (days: number) => void
  setTripHistoryRetentionDays: (days: number) => void
  setDriverPendingNote: (driverId: string, note: string | null, deadline?: string | null) => void
  registerTodaOrganization: (args: {
    name: string
    officers: TodaOfficer[]
    province: string
    city: string
    barangay: string
    addressDetail: string
    terminalGps: GeoCoords | null
    adminPin: string
    contactPhone?: string | null
  }) => string
  approveTodaOrg: (todaOrgId: string) => void
  rejectTodaOrg: (todaOrgId: string) => void
  setTodaOrgPendingNote: (todaOrgId: string, note: string | null, deadline?: string | null) => void
  setTodaSaasPlan: (todaOrgId: string, plan: SaasPlan, perBookingFee: number) => void
  setTodaOperator: (todaOrgId: string, operatorId: string | null) => void
  registerOperator: (args: {
    name: string
    contactPerson: string
    contactPhone: string
    province: string
    city: string
    adminPin: string
  }) => string
  approveOperator: (operatorId: string) => void
  rejectOperator: (operatorId: string) => void
  setOperatorFees: (operatorId: string, activationFee: number | null, monthlyPlatformFee: number, perBookingFee: number) => void
  setOperatorFranchise: (operatorId: string, franchiseId: string | null) => void
  setOperatorLogo: (operatorId: string, logoDataUrl: string | null) => void
  setOperatorBanner: (operatorId: string, bannerDataUrl: string | null) => void
  updateOperatorProfile: (
    operatorId: string,
    updates: {
      contactPerson: string
      contactPhone: string
      email: string | null
      province: string
      city: string
      barangay: string
      addressDetail: string
      businessRegistrationNo: string | null
    },
  ) => void
  registerFranchise: (args: {
    name: string
    contactPerson: string
    contactPhone: string
    province: string
    city: string
    adminPin: string
  }) => string
  approveFranchise: (franchiseId: string) => void
  rejectFranchise: (franchiseId: string) => void
  setFranchiseFees: (
    franchiseId: string,
    initialFranchiseFee: number | null,
    monthlyTechnologyFee: number,
    royaltyPct: number | null,
  ) => void
  updateFranchiseProfile: (
    franchiseId: string,
    updates: {
      contactPerson: string
      contactPhone: string
      email: string | null
      province: string
      city: string
      barangay: string
      addressDetail: string
      businessRegistrationNo: string | null
    },
  ) => void
  setTodaTerminalGps: (todaOrgId: string, gps: GeoCoords) => void
  setTodaTerminalAddress: (
    todaOrgId: string,
    args: { province: string; city: string; barangay: string; addressDetail: string },
  ) => void
  setTariffSettings: (settings: TariffSettings) => void
  setCityTariff: (city: string, settings: TariffSettings | null) => void
  setTodaTariff: (todaOrgId: string, settings: TariffSettings | null) => void
  setPabiliServiceFee: (amount: number) => void
  setPabiliFareMode: (mode: PabiliFareMode) => void
  setPabiliFixedFare: (amount: number) => void
  addTerminal: (terminal: Terminal) => void
  removeTerminal: (terminalId: string) => void
  addLandmark: (landmark: Landmark) => void
  removeLandmark: (landmarkId: string) => void
  setLandmarkGps: (landmarkId: string, gps: GeoCoords) => void
  updateLandmark: (landmarkId: string, landmark: Omit<Landmark, 'id'>) => void
  setTerminalGps: (terminalId: string, gps: GeoCoords) => void
  setTerminalActive: (terminalId: string, isActive: boolean) => void
  setTodaRadiusKm: (km: number) => void
  setOutOfAreaPerKm: (amount: number) => void
  driverProposeAccept: (rideId: string, driverId: string, originGps: GeoCoords | null) => void
  approveProposedFare: (rideId: string) => void
  declineProposedFare: (rideId: string) => void
  addExpense: (args: { category: ExpenseCategory; amount: number; description: string; recordedBy: string }) => void
  deleteExpense: (expenseId: string) => void
  toggleComplianceItem: (itemId: string, done: boolean) => void
  setComplianceNote: (itemId: string, note: string | null, deadlineAt?: string | null) => void
  addCapitalContribution: (args: {
    stockholderName: string
    shares: number
    amount: number
    recordedBy: string
  }) => void
  deleteCapitalContribution: (contributionId: string) => void
  addAccountingOfficer: (args: {
    name: string
    email: string
    position: AccountingOfficerPosition
    otherPositionLabel?: string | null
  }) => void
  removeAccountingOfficer: (officerId: string) => void
  updateAccountingOfficer: (
    officerId: string,
    args: { name: string; email: string; position: AccountingOfficerPosition; otherPositionLabel?: string | null },
  ) => void
  addEquityAllocation: (args: {
    holderName: string
    category: EquityHolderCategory
    otherCategoryLabel?: string | null
    percentage: number
    notes?: string | null
  }) => void
  updateEquityAllocation: (
    allocationId: string,
    args: {
      holderName: string
      category: EquityHolderCategory
      otherCategoryLabel?: string | null
      percentage: number
      notes?: string | null
    },
  ) => void
  removeEquityAllocation: (allocationId: string) => void
  addInvestor: (args: {
    investorName: string
    investmentDate: string
    investmentAmount: number
    investmentRound: string
    preMoneyValuation?: number | null
    postMoneyValuation?: number | null
    sharePercentage: number
    shareClass: ShareClass
    agreementReference?: string | null
    status: InvestorStatus
    notes?: string | null
  }) => void
  updateInvestor: (
    investorId: string,
    args: {
      investorName: string
      investmentDate: string
      investmentAmount: number
      investmentRound: string
      preMoneyValuation?: number | null
      postMoneyValuation?: number | null
      sharePercentage: number
      shareClass: ShareClass
      agreementReference?: string | null
      status: InvestorStatus
      notes?: string | null
    },
  ) => void
  removeInvestor: (investorId: string) => void
  addFounderContribution: (args: {
    founderName: string
    date: string
    contributionType: string
    description: string
    kind: FounderContributionKind
    estimatedValue: number
    supportingDocDataUrl?: string | null
  }) => void
  updateFounderContribution: (
    contributionId: string,
    args: {
      founderName: string
      date: string
      contributionType: string
      description: string
      kind: FounderContributionKind
      estimatedValue: number
      supportingDocDataUrl?: string | null
    },
  ) => void
  setFounderContributionStatus: (
    contributionId: string,
    status: FounderContributionStatus,
    approvedValue: number | null,
    approvedBy: string,
  ) => void
  removeFounderContribution: (contributionId: string) => void
  setSocialImpactFundPct: (pct: number) => void
  addSocialImpactTransaction: (args: {
    date: string
    description: string
    amount: number
    projectId?: string | null
    category: SocialImpactTransactionCategory
    status: SocialImpactTransactionStatus
    approvedBy?: string | null
    supportingDocDataUrl?: string | null
  }) => void
  setSocialImpactTransactionStatus: (
    transactionId: string,
    status: SocialImpactTransactionStatus,
    approvedBy: string,
  ) => void
  removeSocialImpactTransaction: (transactionId: string) => void
  addRotaryProject: (args: {
    projectName: string
    partner: string
    description: string
    category: RotaryProjectCategory
    approvedBudget: number
    socialImpactFundAllocation: number
    additionalFunding: number
    status: RotaryProjectStatus
    startDate?: string | null
    endDate?: string | null
  }) => void
  updateRotaryProject: (
    projectId: string,
    args: {
      projectName: string
      partner: string
      description: string
      category: RotaryProjectCategory
      approvedBudget: number
      socialImpactFundAllocation: number
      additionalFunding: number
      status: RotaryProjectStatus
      startDate?: string | null
      endDate?: string | null
    },
  ) => void
  removeRotaryProject: (projectId: string) => void
  addDistribution: (args: {
    recipient: string
    distributionType: DistributionType
    amount: number
    date: string
    source: string
    reference?: string | null
    status: DistributionStatus
    approvedBy?: string | null
  }) => void
  updateDistribution: (
    distributionId: string,
    args: {
      recipient: string
      distributionType: DistributionType
      amount: number
      date: string
      source: string
      reference?: string | null
      status: DistributionStatus
      approvedBy?: string | null
    },
  ) => void
  removeDistribution: (distributionId: string) => void
  addRccIncentive: (args: {
    partner: string
    basis: RccIncentiveBasis
    description: string
    amount: number
    date: string
    status: RccIncentiveStatus
    approvedBy?: string | null
  }) => void
  updateRccIncentive: (
    incentiveId: string,
    args: {
      partner: string
      basis: RccIncentiveBasis
      description: string
      amount: number
      date: string
      status: RccIncentiveStatus
      approvedBy?: string | null
    },
  ) => void
  removeRccIncentive: (incentiveId: string) => void
  updateCorporateRegistration: (info: CorporateRegistrationInfo) => void
  addStockholder: (args: {
    name: string
    nationality: string
    address: string
    stockholderType: StockholderType
    sharesSubscribed: number
    amountSubscribed: number
    amountPaid: number
    dateSubscribed?: string | null
    certificateNo?: string | null
  }) => void
  updateStockholder: (
    stockholderId: string,
    args: {
      name: string
      nationality: string
      address: string
      stockholderType: StockholderType
      sharesSubscribed: number
      amountSubscribed: number
      amountPaid: number
      dateSubscribed?: string | null
      certificateNo?: string | null
    },
  ) => void
  removeStockholder: (stockholderId: string) => void
  addTodaContribution: (args: {
    todaOrgId: string
    contributorName: string
    purpose: string
    amount: number
    recordedBy: string
  }) => void
  deleteTodaContribution: (contributionId: string) => void
  addTodaExpense: (args: {
    todaOrgId: string
    category: TodaExpenseCategory
    amount: number
    description: string
    recordedBy: string
  }) => void
  deleteTodaExpense: (expenseId: string) => void
  savePassengerLocation: (passengerId: string, label: SavedLocationLabel, location: MockLocation) => void
  removePassengerLocation: (passengerId: string, savedLocationId: string) => void
  rateRide: (args: {
    rideId: string
    driverRating: number
    driverReviewText: string
    todaRating: number | null
    todaReviewText: string
  }) => void
  reportDriver: (args: {
    rideId: string
    passengerId: string
    passengerName: string
    driverId: string
    driverName: string
    reason: DriverReportReason
    details: string
  }) => void
  resolveDriverReport: (reportId: string) => void
  saveBoundary: (boundary: MapBoundary) => void
  deleteBoundary: (boundaryId: string) => void
  addUnregisteredToda: (name: string, province: string, city: string, barangay: string) => string
  registerDriver: (args: {
    name: string
    plateNumber: string
    licenseNo: string
    licenseExpiry: string
    pin: string
    documents: DriverDocuments
    todaOrgId: string | null
    province: string
    city: string
    barangay: string
    addressDetail: string
    phone: string
    email: string | null
    facebook: string | null
    inviteId?: string | null
  }) => void
  createDriverInvite: (args: {
    todaOrgId: string | null
    name: string
    phone: string
    email: string | null
    pharmacyId?: string | null
    plateNumber?: string | null
  }) => string
  removeDriverInvite: (inviteId: string) => void
  addVendorSampleOrder: (pharmacyId: string) => void
  registerPassenger: (args: {
    name: string
    age: number
    phone: string
    email: string | null
    pin: string
    province: string
    city: string
    barangay: string
    addressDetail: string
    guardianPhone: string | null
    guardianName: string | null
    guardianRelationship: string | null
    isStudent: boolean
  }) => string | null
  registerGuardianForStudent: (args: {
    studentPassengerId: string
    name: string
    phone: string
    relationship: string
    province: string
    city: string
    barangay: string
    addressDetail: string
  }) => string
  registerParentWithChild: (args: {
    parentName: string
    parentPhone: string
    parentEmail: string | null
    parentPin: string
    childName: string
    childAge: number
    childPhone: string
    relationship: string
    province: string
    city: string
    barangay: string
    addressDetail: string
    proofOfAuthorityDataUrl: string | null
  }) => { parentId: string; childId: string } | null
  logActivity: (args: {
    actorRole: ActivityLogActorRole
    actorName: string
    todaOrgId: string | null
    action: string
    summary: string
  }) => void
  addAdvertiser: (args: {
    businessName: string
    category: string
    province: string
    city: string
    barangay: string
    addressDetail: string
    contactName: string
    contactPhone: string
    contactEmail?: string | null
    plan: AdvertiserPlan
    monthlyValue: number
    status: AdvertiserStatus
    notes?: string | null
  }) => void
  updateAdvertiser: (
    advertiserId: string,
    args: {
      businessName: string
      category: string
      province: string
      city: string
      barangay: string
      addressDetail: string
      contactName: string
      contactPhone: string
      contactEmail?: string | null
      plan: AdvertiserPlan
      monthlyValue: number
      status: AdvertiserStatus
      notes?: string | null
    },
  ) => void
  removeAdvertiser: (advertiserId: string) => void
  addCampaign: (args: {
    name: string
    description: string
    campaignType: CampaignType
    targetAudience: CampaignAudience
    startDate: string
    endDate?: string | null
    rewardCoins: number
    rewardNote?: string | null
    budget: number
    dailyLimit?: number | null
    weeklyLimit?: number | null
    monthlyLimit?: number | null
    status: CampaignStatus
    advertiserId?: string | null
  }) => void
  updateCampaign: (
    campaignId: string,
    args: {
      name: string
      description: string
      campaignType: CampaignType
      targetAudience: CampaignAudience
      startDate: string
      endDate?: string | null
      rewardCoins: number
      rewardNote?: string | null
      budget: number
      dailyLimit?: number | null
      weeklyLimit?: number | null
      monthlyLimit?: number | null
      status: CampaignStatus
      advertiserId?: string | null
    },
  ) => void
  setCampaignStatus: (campaignId: string, status: CampaignStatus) => void
  updateCampaignMetrics: (
    campaignId: string,
    args: { reach: number; clicks: number; shares: number; participants: number },
  ) => void
  removeCampaign: (campaignId: string) => void
  addPromoOffer: (args: {
    title: string
    description: string
    kind: PromoOfferKind
    discountType: PromoDiscountType
    discountValue: number
    code?: string | null
    startDate: string
    endDate?: string | null
    usageLimit?: number | null
    status: PromoOfferStatus
  }) => void
  updatePromoOffer: (
    offerId: string,
    args: {
      title: string
      description: string
      kind: PromoOfferKind
      discountType: PromoDiscountType
      discountValue: number
      code?: string | null
      startDate: string
      endDate?: string | null
      usageLimit?: number | null
      status: PromoOfferStatus
    },
  ) => void
  setPromoOfferStatus: (offerId: string, status: PromoOfferStatus) => void
  removePromoOffer: (offerId: string) => void
  setRewardRules: (rules: RewardRules) => void
  addCoinTransaction: (args: {
    actorType: 'passenger' | 'driver'
    actorId: string
    actorName: string
    direction: CoinDirection
    source: CoinSource
    amount: number
    campaignId?: string | null
    note?: string | null
    recordedBy: string
  }) => void
  removeCoinTransaction: (transactionId: string) => void
  addRideCreditTier: (coins: number, pesoValue: number) => void
  updateRideCreditTier: (tierId: string, coins: number, pesoValue: number) => void
  removeRideCreditTier: (tierId: string) => void
  addReferral: (args: {
    code: string
    referrerId: string
    referrerName: string
    referrerType: 'passenger' | 'driver'
    referredName: string
    referredPassengerId?: string | null
    campaignId?: string | null
  }) => void
  setReferralStatus: (referralId: string, status: ReferralStatus, coinsAwarded: number) => void
  removeReferral: (referralId: string) => void
  setIncomePromotionSettings: (settings: IncomePromotionSettings) => void
  addPartnershipRevenue: (args: { partnerName: string; description: string; amount: number; recordedBy: string }) => void
  removePartnershipRevenue: (entryId: string) => void
  setAdSenseSettings: (settings: AdSenseSettings) => void
  createMedsOrder: (args: {
    customerId: string
    customerName: string
    pharmacyId: string
    items: MedsOrderItem[]
    deliveryAddress: MockLocation
    prescriptionDataUrls: string[]
    paymentMethod: PaymentMethod
    deliveryMode: 'pharmacy_books' | 'self_book'
    contactPhone?: string | null
    pricedFromMenu?: boolean
  }) => void
  sendMedsQuote: (orderId: string, items: MedsOrderItem[], receiptDataUrl: string | null) => void
  vendorAcceptMenuOrder: (orderId: string) => void
  vendorSendQuote: (orderId: string, deliveryFee: number) => void
  rejectMedsOrder: (orderId: string, reason: string) => void
  reviewMedsPrescription: (orderId: string, approved: boolean, reason: string | null) => void
  acceptMedsQuote: (
    orderId: string,
    paymentMethod: PaymentMethod,
    paymentProofDataUrl: string | null,
    deliveryMode: 'pharmacy_books' | 'self_book',
  ) => void
  cancelMedsOrder: (orderId: string) => void
  vendorSwitchToOtherDelivery: (orderId: string) => void
  vendorMarkDeliveredOther: (orderId: string) => void
  sendMedsOrderMessage: (orderId: string, sender: 'customer' | 'pharmacy', text: string) => void
  processMedsOrder: (orderId: string, preferredDriverId?: string | null) => void
  bookOwnMedsRide: (orderId: string, overrides?: MedsRideOverrides) => void
  vendorBookDelivery: (args: {
    pharmacyId: string
    customerName: string
    contactPhone: string
    deliveryAddress: MockLocation
    itemsSummary: string
    goodsAmount: number
    collection: 'cash' | 'paid'
    preferredDriverId?: string | null
  }) => void
  toggleMedicineProductStock: (productId: string) => void
  toggleMedicineProductVisibility: (productId: string) => void
  setMedicineProductStockCount: (productId: string, stockCount: number | null) => void
  registerPharmacy: (args: {
    name: string
    businessType: BusinessType
    contactPhone: string
    province: string
    city: string
    barangay: string
    addressDetail: string
    coords: Coords
    locationGps: GeoCoords | null
    adminPin: string
  }) => string
  addMedicineProduct: (args: {
    pharmacyId: string
    name: string
    genericName: string | null
    category: MedicineCategory
    price: number
    menuCategory?: string | null
    photoDataUrl?: string | null
    description?: string | null
    badge?: MenuItemBadge | null
    stockCount?: number | null
  }) => void
  updateMedicineProduct: (args: {
    productId: string
    name: string
    genericName: string | null
    category: MedicineCategory
    price: number
    menuCategory: string | null
    photoDataUrl: string | null
    description: string | null
    badge: MenuItemBadge | null
    stockCount: number | null
  }) => void
  removeMedicineProduct: (productId: string) => void
  reorderMedicineProducts: (orderedIds: string[]) => void
  updatePharmacyPaymentAccount: (pharmacyId: string, method: 'gcash' | 'maya', details: PaymentAccountDetails | null) => void
  updateVendorBranding: (args: {
    pharmacyId: string
    coverPhotoDataUrl: string | null
    coverPhotoPosition: { x: number; y: number; scale?: number } | null
    bannerBackgroundDataUrl: string | null
    logoDataUrl: string | null
    themeColor: string | null
    tagline: string | null
  }) => void
  updatePharmacyLocation: (pharmacyId: string, locationGps: GeoCoords) => void
  // The banner drawn as one picture for link previews — see lib/bannerThumb.
  setVendorBannerThumb: (pharmacyId: string, dataUrl: string | null, key: string | null) => void
  togglePharmacyTrustedDriver: (pharmacyId: string, driverId: string) => void
  ratePharmacy: (args: { pharmacyId: string; customerId: string; customerName: string; rating: number; text: string | null }) => void
  addVendorPost: (args: {
    pharmacyId: string
    text: string
    photoDataUrl: string | null
    sharePhotoDataUrl?: string | null
    productId: string | null
  }) => void
  // A share card drawn later for a post that was made without one.
  setVendorPostSharePhoto: (pharmacyId: string, postId: string, dataUrl: string) => void
  removeVendorPost: (pharmacyId: string, postId: string) => void
  // Purges a stray or duplicate store for good — see REMOVE_PHARMACY.
  removePharmacy: (pharmacyId: string) => void
  reactToVendorPost: (pharmacyId: string, postId: string, reaction: 'like' | 'heart', actorId: string) => void
  commentOnVendorPost: (args: { pharmacyId: string; postId: string; authorId: string; authorName: string; text: string }) => void
  // The TODA fare + admin booking fee for delivering from this store to that
  // address — see vendorDeliveryFareQuote. Null when the store is unknown.
  quoteVendorDeliveryFare: (pharmacyId: string, dropoff: MockLocation) => { todaFare: number; bookingFee: number } | null
}

const RideContext = createContext<RideContextValue | null>(null)

export function RideProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState)
  // Set while the next render is showing state that arrived from another
  // document, so the persistence effect below knows not to echo it back.
  const justHydratedRef = useRef(false)
  // The last blob handed to the adapter. Compared against the next one to
  // work out which rides/drivers/alerts actually changed.
  const lastSavedRef = useRef<StoredState | null>(null)

  // Pull the shared world once at startup. Without a backend configured this
  // resolves to null immediately and the app carries on with what was in
  // this browser — which is exactly the behaviour it has always had.
  useEffect(() => {
    let cancelled = false
    void getPersistence()
      .fetchShared()
      .then((shared) => {
        if (cancelled || !shared) return
        // Only a shared read that was actually applied unlocks saving. If it
        // cannot be hydrated, this document stays on what it started with —
        // possibly the seeds — and must keep that to itself (see
        // persistence.ts remoteReady): pushing it would erase the shared
        // world, which is what happened on 2026-09-06.
        try {
          assertUsableSharedState(shared)
          const hydrated = fromStored(shared as unknown as StoredState)
          // Normally the hydrated state is already in storage and must not
          // be echoed back. But if this device saved something before the
          // read landed (a post, a like — kept local only), the merged
          // state is new to the server and has to go out now, not on the
          // next edit that may never come.
          justHydratedRef.current = !getPersistence().hasLocalOnlyChanges()
          dispatch({ type: 'HYDRATE', state: hydrated })
          getPersistence().markSynced()
        } catch (err) {
          console.error('[TodaRide] The shared state could not be read; this device will not save to it until it can.', err)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (justHydratedRef.current) {
      // This state came from another document; it is already in storage.
      justHydratedRef.current = false
      return
    }
    try {
      const stored: StoredState = ({
          schemaVersion: STATE_SCHEMA_VERSION,
          rides: state.rides,
          alerts: state.alerts,
          drivers: state.drivers,
          passengers: state.passengers,
          parents: state.parents,
          parentLinks: state.parentLinks,
          commissionPerRide: state.commissionPerRide,
          terminalQrFeeWaived: state.terminalQrFeeWaived,
          tripLegSeconds: state.tripLegSeconds,
          pilaBannerDataUrl: state.pilaBannerDataUrl,
          requestedDrivers: state.requestedDrivers,
          platformFeePayments: state.platformFeePayments,
          driverWithdrawals: state.driverWithdrawals,
          platformGcashAccount: state.platformGcashAccount,
          todaQueueWindowMs: state.todaQueueWindowMs,
          queueOfferTimeoutMs: state.queueOfferTimeoutMs,
          specialPickupEscalationMs: state.specialPickupEscalationMs,
          todaOrganizations: state.todaOrganizations,
          terminals: state.terminals,
          landmarks: state.landmarks,
          deletedLandmarkIds: state.deletedLandmarkIds,
          boundaries: state.boundaries,
          clsuFleetQueued: state.clsuFleetQueued,
          duesRecords: state.duesRecords,
          membershipRequests: state.membershipRequests,
          duesGracePeriodDays: state.duesGracePeriodDays,
          tripHistoryRetentionDays: state.tripHistoryRetentionDays,
          tariffSettings: state.tariffSettings,
          cityTariffs: state.cityTariffs,
          todaTariffs: state.todaTariffs,
          driverReports: state.driverReports,
          pabiliServiceFee: state.pabiliServiceFee,
          pabiliFareMode: state.pabiliFareMode,
          pabiliFixedFare: state.pabiliFixedFare,
          todaRadiusKm: state.todaRadiusKm,
          outOfAreaPerKm: state.outOfAreaPerKm,
          expenses: state.expenses,
          complianceChecked: state.complianceChecked,
          capitalContributions: state.capitalContributions,
          todaContributions: state.todaContributions,
          todaExpenses: state.todaExpenses,
          complianceReview: state.complianceReview,
          driverInvites: state.driverInvites,
          accountingOfficers: state.accountingOfficers,
          equityAllocations: state.equityAllocations,
          investors: state.investors,
          founderContributions: state.founderContributions,
          socialImpactFundPct: state.socialImpactFundPct,
          socialImpactTransactions: state.socialImpactTransactions,
          rotaryProjects: state.rotaryProjects,
          distributions: state.distributions,
          rccIncentives: state.rccIncentives,
          corporateRegistration: state.corporateRegistration,
          stockholders: state.stockholders,
          activityLog: state.activityLog,
          advertisers: state.advertisers,
          campaigns: state.campaigns,
          promoOffers: state.promoOffers,
          rewardRules: state.rewardRules,
          coinTransactions: state.coinTransactions,
          rideCreditTiers: state.rideCreditTiers,
          referrals: state.referrals,
          incomePromotionSettings: state.incomePromotionSettings,
          partnershipRevenue: state.partnershipRevenue,
          adSenseSettings: state.adSenseSettings,
          pharmacies: state.pharmacies,
          removedPharmacyIds: state.removedPharmacyIds,
          medicineProducts: state.medicineProducts,
          medsOrders: state.medsOrders,
          operators: state.operators,
          franchises: state.franchises,
          accountSuspensions: state.accountSuspensions,
          adminNotes: state.adminNotes,
          announcements: state.announcements,
          supportMessages: state.supportMessages,
          bannerAds: state.bannerAds,
          pabiliEnabled: state.pabiliEnabled,
          rewardsEnabled: state.rewardsEnabled,
          medsEnabled: state.medsEnabled,
          vendorsEnabled: state.vendorsEnabled,
          partnerBannerEnabled: state.partnerBannerEnabled,
          simulatedOtpEnabled: state.simulatedOtpEnabled,
          publicBaseUrl: state.publicBaseUrl,
          pilotTodaName: state.pilotTodaName,
          simulateMovementEnabled: state.simulateMovementEnabled,
          emergencyHotlines: state.emergencyHotlines,
          safetySettings: state.safetySettings,
      } as unknown) as StoredState
      // Local first (instant, survives a dead signal), then the shared
      // tables if a backend is configured. lastSavedRef lets the adapter see
      // what changed since the previous write, so it sends only those rows
      // rather than every ride on every keystroke.
      getPersistence().save(
        stored as unknown as Record<string, unknown>,
        lastSavedRef.current as Record<string, unknown> | null,
      )
      lastSavedRef.current = stored
    } catch (err) {
      console.error(
        '[TodaRide] Could not save this change — it is in memory only. ' +
          'The usual cause is the 5MB localStorage quota, most often from uploaded banner-ad images.',
        err,
      )
    }
  }, [
    state.rides,
    state.alerts,
    state.drivers,
    state.passengers,
    state.parents,
    state.parentLinks,
    state.commissionPerRide,
    state.terminalQrFeeWaived,
    state.tripLegSeconds,
    state.pilaBannerDataUrl,
    state.requestedDrivers,
    state.platformFeePayments,
    state.driverWithdrawals,
    state.platformGcashAccount,
    state.todaQueueWindowMs,
    state.queueOfferTimeoutMs,
    state.specialPickupEscalationMs,
    state.todaOrganizations,
    state.terminals,
    // These four were stored (above) but missing here, so a landmark move,
    // rename, add or delete — or a store removal — only reached storage
    // when some unrelated state happened to change next. The admin saw
    // "not saving" on a dragged landmark pin.
    state.landmarks,
    state.deletedLandmarkIds,
    state.clsuFleetQueued,
    state.removedPharmacyIds,
    state.boundaries,
    state.duesRecords,
    state.membershipRequests,
    state.duesGracePeriodDays,
    state.tripHistoryRetentionDays,
    state.tariffSettings,
    state.cityTariffs,
    state.todaTariffs,
    state.driverReports,
    state.pabiliServiceFee,
    state.pabiliFareMode,
    state.pabiliFixedFare,
    state.todaRadiusKm,
    state.outOfAreaPerKm,
    state.expenses,
    state.complianceChecked,
    state.capitalContributions,
    state.todaContributions,
    state.todaExpenses,
    state.complianceReview,
    state.driverInvites,
    state.accountingOfficers,
    state.equityAllocations,
    state.investors,
    state.founderContributions,
    state.socialImpactFundPct,
    state.socialImpactTransactions,
    state.rotaryProjects,
    state.distributions,
    state.rccIncentives,
    state.corporateRegistration,
    state.stockholders,
    state.activityLog,
    state.advertisers,
    state.campaigns,
    state.promoOffers,
    state.rewardRules,
    state.coinTransactions,
    state.rideCreditTiers,
    state.referrals,
    state.incomePromotionSettings,
    state.partnershipRevenue,
    state.adSenseSettings,
    state.pharmacies,
    state.medicineProducts,
    state.medsOrders,
    state.operators,
    state.franchises,
    state.accountSuspensions,
    state.adminNotes,
    state.announcements,
    state.supportMessages,
    state.bannerAds,
    state.pabiliEnabled,
    state.rewardsEnabled,
    state.medsEnabled,
    state.vendorsEnabled,
    state.partnerBannerEnabled,
    state.simulatedOtpEnabled,
    state.publicBaseUrl,
    state.pilotTodaName,
    state.simulateMovementEnabled,
    state.emergencyHotlines,
    state.safetySettings,
  ])

  useEffect(() => {
    const clockId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

    // True only for the one document currently holding the lease. Claiming is
    // a write followed by a read-back: two documents can write at the same
    // moment, but only one value survives, so only one sees its own id.
    function ownsClock(): boolean {
      try {
        const raw = localStorage.getItem(SIM_CLOCK_KEY)
        const lease = raw ? (JSON.parse(raw) as { id: string; ts: number }) : null
        const expired = !lease || Date.now() - lease.ts > SIM_CLOCK_LEASE_MS
        if (!expired && lease.id !== clockId) return false
        localStorage.setItem(SIM_CLOCK_KEY, JSON.stringify({ id: clockId, ts: Date.now() }))
        const confirmed = localStorage.getItem(SIM_CLOCK_KEY)
        return !!confirmed && (JSON.parse(confirmed) as { id: string }).id === clockId
      } catch {
        // No storage to coordinate through — a lone document, so it ticks.
        return true
      }
    }

    const interval = setInterval(() => {
      if (ownsClock()) dispatch({ type: 'TICK_POSITIONS' })
    }, TICK_INTERVAL_MS)
    return () => {
      clearInterval(interval)
      // Hand the clock on immediately rather than making the next document
      // wait out the lease.
      try {
        const raw = localStorage.getItem(SIM_CLOCK_KEY)
        if (raw && (JSON.parse(raw) as { id: string }).id === clockId) localStorage.removeItem(SIM_CLOCK_KEY)
      } catch {
        // Nothing to release.
      }
    }
  }, [])

  // Keep separate tabs/roles (e.g. student on one device, parent on another)
  // in sync so alerts like SOS and safety photos show up immediately everywhere.
  useEffect(() => {
    // One subscription covering both worlds: other tabs of this browser, and
    // — when a backend is configured — other devices entirely.
    //
    // What we are about to hold came from elsewhere, so writing it straight
    // back is at best a no-op and at worst destructive: with several
    // documents open (the Split-Screen Simulator is three) the echo can land
    // after another document has already moved on, overwriting its newer
    // state with what we were just handed. Skip our next save.
    return getPersistence().subscribe((incoming) => {
      try {
        // See the startup read above for why this is not always true.
        justHydratedRef.current = !getPersistence().hasLocalOnlyChanges()
        assertUsableSharedState(incoming)
        dispatch({ type: 'HYDRATE', state: fromStored(incoming as unknown as StoredState) })
        // A shared read applied by this path counts too. Without this a
        // device whose first read at startup failed (no signal for a
        // moment) was hydrated by the heartbeat later but never unlocked
        // saving — every post, like or edit it made stayed on the phone
        // until the next reload. That is what "I can't post" looked like.
        getPersistence().markSynced()
      } catch {
        // Ignore anything unreadable rather than blanking a live screen.
      }
    })
  }, [])

  const value: RideContextValue = {
    ...state,
    requestRide: (args) =>
      dispatch({
        type: 'REQUEST_RIDE',
        serviceType: 'ride',
        pabiliItems: null,
        packageNote: null,
        tip: 0,
        bookedByParentId: null,
        passengerPhone: null,
        specialPickupRequested: false,
        specialTrip: false,
        requestedDriverId: null,
        bookedAtTerminal: false,
        destinationPending: false,
        boardedWithDriverId: null,
        unregisteredPlate: null,
        initialPhotos: [],
        prescriptionDataUrls: [],
        seniorIdDataUrl: null,
        otherDocDataUrl: null,
        paymentProofDataUrl: null,
        ...args,
      }),
    requestGroupRide: (args) =>
      dispatch({ type: 'REQUEST_GROUP_RIDE', requestedDriverId: null, ...args }),
    reportDriverGps: (driverId, gps) => dispatch({ type: 'REPORT_DRIVER_GPS', driverId, gps }),
    acceptRide: (rideId, driverId) => dispatch({ type: 'ACCEPT_RIDE', rideId, driverId }),
    declineRide: (rideId, driverId) => dispatch({ type: 'DECLINE_RIDE', rideId, driverId }),
    startRide: (rideId, driverGps) => dispatch({ type: 'START_RIDE', rideId, driverGps }),
    confirmPassengerArrival: (rideId, actualDropoff) =>
      dispatch({ type: 'PASSENGER_CONFIRM_ARRIVAL', rideId, actualDropoff }),
    clearAllRides: () => dispatch({ type: 'CLEAR_ALL_RIDES' }),
    completeRide: (rideId, paidMethod) => dispatch({ type: 'COMPLETE_RIDE', rideId, paidMethod }),
    cancelRide: (rideId) => dispatch({ type: 'CANCEL_RIDE', rideId }),
    setPabiliItemBought: (rideId, index, bought) =>
      dispatch({ type: 'SET_PABILI_ITEM_BOUGHT', rideId, index, bought }),
    driverCancelRide: (rideId, reason, note) => dispatch({ type: 'DRIVER_CANCEL_RIDE', rideId, reason, note }),
    addTipOffer: (rideId, amount) => dispatch({ type: 'ADD_TIP_OFFER', rideId, amount }),
    acknowledgeRidePayment: (rideId, method, referenceNo) =>
      dispatch({ type: 'ACKNOWLEDGE_RIDE_PAYMENT', rideId, method, referenceNo }),
    updateDriverLiveGps: (rideId, gps) => dispatch({ type: 'UPDATE_DRIVER_LIVE_GPS', rideId, gps }),
    updatePassengerLiveGps: (rideId, gps) => dispatch({ type: 'UPDATE_PASSENGER_LIVE_GPS', rideId, gps }),
    triggerSos: (rideId, triggeredBy, source, location) => dispatch({ type: 'TRIGGER_SOS', rideId, triggeredBy, source, location }),
    triggerPassengerSos: (passengerId, location, notes = null) =>
      dispatch({ type: 'TRIGGER_PASSENGER_SOS', passengerId, location, notes }),
    triggerDriverSos: (driverId, location, notes = null, source) =>
      dispatch({ type: 'TRIGGER_DRIVER_SOS', driverId, location, notes, source }),
    resolveAlert: (alertId, actorName, actorRole, notes) => dispatch({ type: 'RESOLVE_ALERT', alertId, actorName, actorRole, notes }),
    acknowledgeAlert: (alertId, actorName, actorRole) => dispatch({ type: 'ACKNOWLEDGE_ALERT', alertId, actorName, actorRole }),
    setAlertResponding: (alertId, actorName, actorRole) => dispatch({ type: 'SET_ALERT_RESPONDING', alertId, actorName, actorRole }),
    cancelAlert: (alertId, actorName, actorRole, notes) => dispatch({ type: 'CANCEL_ALERT', alertId, actorName, actorRole, notes }),
    logAlertEvent: (alertId, kind, summary, actorName, actorRole) => dispatch({ type: 'LOG_ALERT_EVENT', alertId, kind, summary, actorName, actorRole }),
    setSafetySettings: (patch) => dispatch({ type: 'SET_SAFETY_SETTINGS', patch }),
    setPassengerEmergencyContacts: (passengerId, contacts) => dispatch({ type: 'SET_PASSENGER_EMERGENCY_CONTACTS', passengerId, contacts }),
    logPossibleCrash: (args) => dispatch({ type: 'LOG_POSSIBLE_CRASH', ...args }),
    sendContactSms: async (alertId, notificationId, actorName) => {
      const alert = state.alerts.find((a) => a.id === alertId)
      const n = alert?.notifications?.find((x) => x.id === notificationId)
      if (!n || !n.phone || !n.message) {
        dispatch({ type: 'SET_NOTIFICATION_STATUS', alertId, notificationId, status: 'failed', note: 'No phone number on file', actorName })
        return
      }
      const result = await sendSosSms(n.phone, n.message)
      dispatch({
        type: 'SET_NOTIFICATION_STATUS',
        alertId,
        notificationId,
        status: result.ok ? 'delivered' : 'failed',
        note: result.ok ? undefined : result.unreachable ? 'SMS server unreachable' : result.error,
        actorName,
      })
    },
    approveDriver: (driverId) => dispatch({ type: 'APPROVE_DRIVER', driverId }),
    rejectDriver: (driverId, reason = null) => dispatch({ type: 'REJECT_DRIVER', driverId, reason }),
    appealDriverRejection: (driverId, message) => dispatch({ type: 'APPEAL_DRIVER_REJECTION', driverId, message }),
    resubmitDriverDocument: (driverId, docType, dataUrl) =>
      dispatch({ type: 'RESUBMIT_DRIVER_DOCUMENT', driverId, docType, dataUrl }),
    addSafetyPhoto: (rideId, dataUrl, takenBy) => dispatch({ type: 'ADD_SAFETY_PHOTO', rideId, dataUrl, takenBy }),
    setCommission: (amount) => dispatch({ type: 'SET_COMMISSION', amount }),
    resetAccountPin: (kind, id, pin) => dispatch({ type: 'RESET_ACCOUNT_PIN', kind, id, pin }),
    suspendAccount: ({ kind, accountId, accountName, reason, days }) => {
      const startedAt = new Date().toISOString()
      dispatch({
        type: 'SUSPEND_ACCOUNT',
        suspension: {
          id: `susp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind,
          accountId,
          accountName,
          reason,
          days,
          startedAt,
          // 0 days means indefinite, which is why this is null rather than a
          // far-future date — "no end" and "ends eventually" are different
          // states and the UI needs to tell them apart.
          endsAt: days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null,
          liftedAt: null,
        },
      })
    },
    liftSuspension: (suspensionId) => dispatch({ type: 'LIFT_SUSPENSION', suspensionId }),
    sendAdminNote: ({ kind, accountId, accountName, message }) =>
      dispatch({
        type: 'SEND_ADMIN_NOTE',
        note: {
          id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind,
          accountId,
          accountName,
          message,
          createdAt: new Date().toISOString(),
          readAt: null,
        },
      }),
    sendSupportMessage: ({ name, email, phone, category, message, fromRole }) =>
      dispatch({
        type: 'SEND_SUPPORT_MESSAGE',
        message: {
          id: `sup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name,
          email,
          phone,
          category,
          message,
          createdAt: new Date().toISOString(),
          status: 'new',
          fromRole,
        },
      }),
    setSupportMessageStatus: (id, status) => dispatch({ type: 'SET_SUPPORT_MESSAGE_STATUS', id, status }),
    publishAnnouncement: ({ title, body, category, audience }) =>
      dispatch({
        type: 'PUBLISH_ANNOUNCEMENT',
        announcement: {
          id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title,
          body,
          category,
          audience,
          createdAt: new Date().toISOString(),
          active: true,
        },
      }),
    setAnnouncementActive: (announcementId, active) =>
      dispatch({ type: 'SET_ANNOUNCEMENT_ACTIVE', announcementId, active }),
    removeAnnouncement: (announcementId) => dispatch({ type: 'REMOVE_ANNOUNCEMENT', announcementId }),
    setBannerAdSlot: (index, ad) => dispatch({ type: 'SET_BANNER_AD_SLOT', index, ad }),
    setPabiliEnabled: (enabled) => dispatch({ type: 'SET_PABILI_ENABLED', enabled }),
    setRewardsEnabled: (enabled) => dispatch({ type: 'SET_REWARDS_ENABLED', enabled }),
    setMedsEnabled: (enabled) => dispatch({ type: 'SET_MEDS_ENABLED', enabled }),
    setVendorsEnabled: (enabled) => dispatch({ type: 'SET_VENDORS_ENABLED', enabled }),
    setPartnerBannerEnabled: (enabled) => dispatch({ type: 'SET_PARTNER_BANNER_ENABLED', enabled }),
    setSimulatedOtpEnabled: (enabled) => dispatch({ type: 'SET_SIMULATED_OTP_ENABLED', enabled }),
    setPublicBaseUrl: (url) => dispatch({ type: 'SET_PUBLIC_BASE_URL', url }),
    setPilotTodaName: (name) => dispatch({ type: 'SET_PILOT_TODA_NAME', name }),
    setSimulateMovementEnabled: (enabled) => dispatch({ type: 'SET_SIMULATE_MOVEMENT_ENABLED', enabled }),
    setLiveGpsEnabled: (enabled) => dispatch({ type: 'SET_LIVE_GPS_ENABLED', enabled }),
    setOpenDriverSignup: (enabled) => dispatch({ type: 'SET_OPEN_DRIVER_SIGNUP', enabled }),
    setDocumentGraceDays: (days) => dispatch({ type: 'SET_DOCUMENT_GRACE_DAYS', days }),
    addEmergencyHotline: (args) =>
      dispatch({
        type: 'ADD_EMERGENCY_HOTLINE',
        hotline: { ...args, id: 'hl-' + Math.random().toString(36).slice(2, 9), addedAt: new Date().toISOString() },
      }),
    updateEmergencyHotline: (id, updates) => dispatch({ type: 'UPDATE_EMERGENCY_HOTLINE', id, updates }),
    removeEmergencyHotline: (id) => dispatch({ type: 'REMOVE_EMERGENCY_HOTLINE', id }),
    joinTerminalQueue: (driverId, driverGps) => dispatch({ type: 'JOIN_TERMINAL_QUEUE', driverId, driverGps }),
    leaveTerminalQueue: (driverId) => dispatch({ type: 'LEAVE_TERMINAL_QUEUE', driverId }),
    setDriverHomeTerminal: (driverId, terminalId) =>
      dispatch({ type: 'SET_DRIVER_HOME_TERMINAL', driverId, terminalId }),
    setDriverPaymentAccount: (driverId, wallet, details) =>
      dispatch({ type: 'SET_DRIVER_PAYMENT_ACCOUNT', driverId, wallet, details }),
    setTerminalQrFeeWaived: (waived) => dispatch({ type: 'SET_TERMINAL_QR_FEE_WAIVED', waived }),
    setTripLegSeconds: (seconds) => dispatch({ type: 'SET_TRIP_LEG_SECONDS', seconds }),
    setPilaBanner: (dataUrl) => dispatch({ type: 'SET_PILA_BANNER', dataUrl }),
    setRideDestination: (rideId, dropoff) => dispatch({ type: 'SET_RIDE_DESTINATION', rideId, dropoff }),
    setRequestedDriver: (passengerId, driverId) => dispatch({ type: 'SET_REQUESTED_DRIVER', passengerId, driverId }),
    recordPlatformFeePayment: (payment) => dispatch({ type: 'RECORD_PLATFORM_FEE_PAYMENT', payment }),
    requestDriverWithdrawal: (withdrawal) => dispatch({ type: 'REQUEST_DRIVER_WITHDRAWAL', withdrawal }),
    settleDriverWithdrawal: (withdrawalId, status, reference, note) =>
      dispatch({ type: 'SETTLE_DRIVER_WITHDRAWAL', withdrawalId, status, reference, note }),
    setPlatformGcashAccount: (account) => dispatch({ type: 'SET_PLATFORM_GCASH_ACCOUNT', account }),
    setTodaQueueWindowMs: (ms) => dispatch({ type: 'SET_TODA_QUEUE_WINDOW', ms }),
    setQueueOfferTimeoutMs: (ms) => dispatch({ type: 'SET_QUEUE_OFFER_TIMEOUT', ms }),
    setSpecialPickupEscalationMs: (ms) => dispatch({ type: 'SET_SPECIAL_PICKUP_ESCALATION_MS', ms }),
    setFavoriteDriver: (passengerId, driverId) => dispatch({ type: 'SET_FAVORITE_DRIVER', passengerId, driverId }),
    setParentFavoriteDriver: (parentId, driverId) => dispatch({ type: 'SET_PARENT_FAVORITE_DRIVER', parentId, driverId }),
    proposeTodaCommission: (todaOrgId, amount) => dispatch({ type: 'PROPOSE_TODA_COMMISSION', todaOrgId, amount }),
    setTodaCommissionMemberApproval: (todaOrgId, approved) =>
      dispatch({ type: 'SET_TODA_COMMISSION_MEMBER_APPROVAL', todaOrgId, approved }),
    setTodaCommissionAdminApproval: (todaOrgId, approved) =>
      dispatch({ type: 'SET_TODA_COMMISSION_ADMIN_APPROVAL', todaOrgId, approved }),
    addDuesRecord: (args) => dispatch({ type: 'ADD_DUES_RECORD', ...args }),
    markDuesPaid: (duesRecordId) => dispatch({ type: 'MARK_DUES_PAID', duesRecordId }),
    requestMembershipAction: (args) => dispatch({ type: 'REQUEST_MEMBERSHIP_ACTION', ...args }),
    resolveMembershipRequest: (requestId, approve) =>
      dispatch({ type: 'RESOLVE_MEMBERSHIP_REQUEST', requestId, approve }),
    setDriverAccess: (driverId, accessStatus, accessNote) =>
      dispatch({ type: 'SET_DRIVER_ACCESS', driverId, accessStatus, accessNote }),
    setDriverPabiliPriority: (driverId, enabled) => dispatch({ type: 'SET_DRIVER_PABILI_PRIORITY', driverId, enabled }),
    setDriverOnline: (driverId, online) => dispatch({ type: 'SET_DRIVER_ONLINE', driverId, online }),
    updatePassengerProfile: (passengerId, updates) =>
      dispatch({ type: 'UPDATE_PASSENGER_PROFILE', passengerId, ...updates }),
    updateDriverProfile: (driverId, updates) => dispatch({ type: 'UPDATE_DRIVER_PROFILE', driverId, ...updates }),
    updateParentProfile: (parentId, updates) => dispatch({ type: 'UPDATE_PARENT_PROFILE', parentId, ...updates }),
    updatePharmacyProfile: (pharmacyId, updates) =>
      dispatch({ type: 'UPDATE_PHARMACY_PROFILE', pharmacyId, ...updates }),
    setDuesGracePeriodDays: (days) => dispatch({ type: 'SET_DUES_GRACE_PERIOD_DAYS', days }),
    setTripHistoryRetentionDays: (days) => dispatch({ type: 'SET_TRIP_HISTORY_RETENTION_DAYS', days }),
    setDriverPendingNote: (driverId, note, deadline = null) =>
      dispatch({ type: 'SET_DRIVER_PENDING_NOTE', driverId, note, deadline }),
    registerTodaOrganization: (args) => {
      // Drivers may already have put this TODA on the map by naming it at
      // signup. Reuse that record's id so its existing members come with it
      // into the registration instead of being stranded on a duplicate.
      const claimed = state.todaOrganizations.find(
        (o) =>
          o.verificationStatus === 'unregistered' &&
          o.name.trim().toLowerCase() === args.name.trim().toLowerCase(),
      )
      const id = claimed?.id ?? `toda-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'REGISTER_TODA_ORGANIZATION', id, ...args })
      return id
    },
    approveTodaOrg: (todaOrgId) => dispatch({ type: 'APPROVE_TODA_ORG', todaOrgId }),
    rejectTodaOrg: (todaOrgId) => dispatch({ type: 'REJECT_TODA_ORG', todaOrgId }),
    setTodaOrgPendingNote: (todaOrgId, note, deadline = null) =>
      dispatch({ type: 'SET_TODA_ORG_PENDING_NOTE', todaOrgId, note, deadline }),
    setTodaSaasPlan: (todaOrgId, plan, perBookingFee) =>
      dispatch({ type: 'SET_TODA_SAAS_PLAN', todaOrgId, plan, perBookingFee }),
    setTodaOperator: (todaOrgId, operatorId) => dispatch({ type: 'SET_TODA_OPERATOR', todaOrgId, operatorId }),
    registerOperator: (args) => {
      const id = `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'REGISTER_OPERATOR', id, ...args })
      return id
    },
    approveOperator: (operatorId) => dispatch({ type: 'APPROVE_OPERATOR', operatorId }),
    rejectOperator: (operatorId) => dispatch({ type: 'REJECT_OPERATOR', operatorId }),
    setOperatorFees: (operatorId, activationFee, monthlyPlatformFee, perBookingFee) =>
      dispatch({ type: 'SET_OPERATOR_FEES', operatorId, activationFee, monthlyPlatformFee, perBookingFee }),
    setOperatorFranchise: (operatorId, franchiseId) =>
      dispatch({ type: 'SET_OPERATOR_FRANCHISE', operatorId, franchiseId }),
    setOperatorLogo: (operatorId, logoDataUrl) => dispatch({ type: 'SET_OPERATOR_LOGO', operatorId, logoDataUrl }),
    setOperatorBanner: (operatorId, bannerDataUrl) =>
      dispatch({ type: 'SET_OPERATOR_BANNER', operatorId, bannerDataUrl }),
    updateOperatorProfile: (operatorId, updates) => dispatch({ type: 'UPDATE_OPERATOR_PROFILE', operatorId, ...updates }),
    registerFranchise: (args) => {
      const id = `fr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'REGISTER_FRANCHISE', id, ...args })
      return id
    },
    approveFranchise: (franchiseId) => dispatch({ type: 'APPROVE_FRANCHISE', franchiseId }),
    rejectFranchise: (franchiseId) => dispatch({ type: 'REJECT_FRANCHISE', franchiseId }),
    setFranchiseFees: (franchiseId, initialFranchiseFee, monthlyTechnologyFee, royaltyPct) =>
      dispatch({ type: 'SET_FRANCHISE_FEES', franchiseId, initialFranchiseFee, monthlyTechnologyFee, royaltyPct }),
    updateFranchiseProfile: (franchiseId, updates) => dispatch({ type: 'UPDATE_FRANCHISE_PROFILE', franchiseId, ...updates }),
    setTodaTerminalGps: (todaOrgId, gps) => dispatch({ type: 'SET_TODA_TERMINAL_GPS', todaOrgId, gps }),
    setTodaTerminalAddress: (todaOrgId, args) => dispatch({ type: 'SET_TODA_TERMINAL_ADDRESS', todaOrgId, ...args }),
    setTariffSettings: (settings) => dispatch({ type: 'SET_TARIFF_SETTINGS', settings }),
    setCityTariff: (city, settings) => dispatch({ type: 'SET_CITY_TARIFF', city, settings }),
    setTodaTariff: (todaOrgId, settings) => dispatch({ type: 'SET_TODA_TARIFF', todaOrgId, settings }),
    setPabiliServiceFee: (amount) => dispatch({ type: 'SET_PABILI_SERVICE_FEE', amount }),
    setPabiliFareMode: (mode) => dispatch({ type: 'SET_PABILI_FARE_MODE', mode }),
    setPabiliFixedFare: (amount) => dispatch({ type: 'SET_PABILI_FIXED_FARE', amount }),
    addTerminal: (terminal) => dispatch({ type: 'ADD_TERMINAL', terminal }),
    removeTerminal: (terminalId) => dispatch({ type: 'REMOVE_TERMINAL', terminalId }),
    addLandmark: (landmark) => dispatch({ type: 'ADD_LANDMARK', landmark }),
    removeLandmark: (landmarkId) => dispatch({ type: 'REMOVE_LANDMARK', landmarkId }),
    setLandmarkGps: (landmarkId, gps) => dispatch({ type: 'SET_LANDMARK_GPS', landmarkId, gps }),
    updateLandmark: (landmarkId, landmark) => dispatch({ type: 'UPDATE_LANDMARK', landmarkId, landmark }),
    setTerminalGps: (terminalId, gps) => dispatch({ type: 'SET_TERMINAL_GPS', terminalId, gps }),
    setTerminalActive: (terminalId, isActive) => dispatch({ type: 'SET_TERMINAL_ACTIVE', terminalId, isActive }),
    setTodaRadiusKm: (km) => dispatch({ type: 'SET_TODA_RADIUS_KM', km }),
    setOutOfAreaPerKm: (amount) => dispatch({ type: 'SET_OUT_OF_AREA_PER_KM', amount }),
    driverProposeAccept: (rideId, driverId, originGps) =>
      dispatch({ type: 'DRIVER_PROPOSE_ACCEPT', rideId, driverId, originGps }),
    approveProposedFare: (rideId) => dispatch({ type: 'PASSENGER_APPROVE_FARE', rideId }),
    declineProposedFare: (rideId) => dispatch({ type: 'PASSENGER_DECLINE_FARE', rideId }),
    addExpense: (args) => {
      const id = `expense-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'ADD_EXPENSE', id, ...args })
    },
    deleteExpense: (expenseId) => dispatch({ type: 'DELETE_EXPENSE', expenseId }),
    toggleComplianceItem: (itemId, done) => dispatch({ type: 'TOGGLE_COMPLIANCE_ITEM', itemId, done }),
    setComplianceNote: (itemId, note, deadlineAt = null) =>
      dispatch({ type: 'SET_COMPLIANCE_NOTE', itemId, note, deadlineAt }),
    addCapitalContribution: (args) => {
      const id = `capital-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'ADD_CAPITAL_CONTRIBUTION', id, ...args })
    },
    deleteCapitalContribution: (contributionId) =>
      dispatch({ type: 'DELETE_CAPITAL_CONTRIBUTION', contributionId }),
    addAccountingOfficer: (args) => {
      const id = `officer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'ADD_ACCOUNTING_OFFICER', id, otherPositionLabel: null, ...args })
    },
    removeAccountingOfficer: (officerId) => dispatch({ type: 'REMOVE_ACCOUNTING_OFFICER', officerId }),
    updateAccountingOfficer: (officerId, args) =>
      dispatch({ type: 'UPDATE_ACCOUNTING_OFFICER', officerId, otherPositionLabel: null, ...args }),
    addEquityAllocation: (args) => {
      const id = `equity-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'ADD_EQUITY_ALLOCATION', id, otherCategoryLabel: null, notes: null, ...args })
    },
    updateEquityAllocation: (allocationId, args) =>
      dispatch({ type: 'UPDATE_EQUITY_ALLOCATION', allocationId, otherCategoryLabel: null, notes: null, ...args }),
    removeEquityAllocation: (allocationId) => dispatch({ type: 'REMOVE_EQUITY_ALLOCATION', allocationId }),
    addInvestor: (args) => {
      const id = `investor-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({
        type: 'ADD_INVESTOR',
        id,
        preMoneyValuation: null,
        postMoneyValuation: null,
        agreementReference: null,
        notes: null,
        ...args,
      })
    },
    updateInvestor: (investorId, args) =>
      dispatch({
        type: 'UPDATE_INVESTOR',
        investorId,
        preMoneyValuation: null,
        postMoneyValuation: null,
        agreementReference: null,
        notes: null,
        ...args,
      }),
    removeInvestor: (investorId) => dispatch({ type: 'REMOVE_INVESTOR', investorId }),
    addFounderContribution: (args) => {
      const id = `founder-contrib-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'ADD_FOUNDER_CONTRIBUTION', id, supportingDocDataUrl: null, ...args })
    },
    updateFounderContribution: (contributionId, args) =>
      dispatch({ type: 'UPDATE_FOUNDER_CONTRIBUTION', contributionId, supportingDocDataUrl: null, ...args }),
    setFounderContributionStatus: (contributionId, status, approvedValue, approvedBy) =>
      dispatch({ type: 'SET_FOUNDER_CONTRIBUTION_STATUS', contributionId, status, approvedValue, approvedBy }),
    removeFounderContribution: (contributionId) =>
      dispatch({ type: 'REMOVE_FOUNDER_CONTRIBUTION', contributionId }),
    setSocialImpactFundPct: (pct) => dispatch({ type: 'SET_SOCIAL_IMPACT_FUND_PCT', pct }),
    addSocialImpactTransaction: (args) => {
      const id = `sif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({
        type: 'ADD_SOCIAL_IMPACT_TRANSACTION',
        id,
        projectId: null,
        approvedBy: null,
        supportingDocDataUrl: null,
        ...args,
      })
    },
    setSocialImpactTransactionStatus: (transactionId, status, approvedBy) =>
      dispatch({ type: 'SET_SOCIAL_IMPACT_TRANSACTION_STATUS', transactionId, status, approvedBy }),
    removeSocialImpactTransaction: (transactionId) =>
      dispatch({ type: 'REMOVE_SOCIAL_IMPACT_TRANSACTION', transactionId }),
    addRotaryProject: (args) => {
      const id = `rotary-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'ADD_ROTARY_PROJECT', id, startDate: null, endDate: null, ...args })
    },
    updateRotaryProject: (projectId, args) =>
      dispatch({ type: 'UPDATE_ROTARY_PROJECT', projectId, startDate: null, endDate: null, ...args }),
    removeRotaryProject: (projectId) => dispatch({ type: 'REMOVE_ROTARY_PROJECT', projectId }),
    addDistribution: (args) => {
      const id = `distribution-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'ADD_DISTRIBUTION', id, reference: null, approvedBy: null, ...args })
    },
    updateDistribution: (distributionId, args) =>
      dispatch({ type: 'UPDATE_DISTRIBUTION', distributionId, reference: null, approvedBy: null, ...args }),
    removeDistribution: (distributionId) => dispatch({ type: 'REMOVE_DISTRIBUTION', distributionId }),
    addRccIncentive: (args) => {
      const id = `rcc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'ADD_RCC_INCENTIVE', id, approvedBy: null, ...args })
    },
    updateRccIncentive: (incentiveId, args) =>
      dispatch({ type: 'UPDATE_RCC_INCENTIVE', incentiveId, approvedBy: null, ...args }),
    removeRccIncentive: (incentiveId) => dispatch({ type: 'REMOVE_RCC_INCENTIVE', incentiveId }),
    updateCorporateRegistration: (info) => dispatch({ type: 'UPDATE_CORPORATE_REGISTRATION', info }),
    addStockholder: (args) => {
      const id = `stockholder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'ADD_STOCKHOLDER', id, dateSubscribed: null, certificateNo: null, ...args })
    },
    updateStockholder: (stockholderId, args) =>
      dispatch({ type: 'UPDATE_STOCKHOLDER', stockholderId, dateSubscribed: null, certificateNo: null, ...args }),
    removeStockholder: (stockholderId) => dispatch({ type: 'REMOVE_STOCKHOLDER', stockholderId }),
    addTodaContribution: (args) => {
      const id = `todacontrib-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'ADD_TODA_CONTRIBUTION', id, ...args })
    },
    deleteTodaContribution: (contributionId) => dispatch({ type: 'DELETE_TODA_CONTRIBUTION', contributionId }),
    addTodaExpense: (args) => {
      const id = `todaexpense-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'ADD_TODA_EXPENSE', id, ...args })
    },
    deleteTodaExpense: (expenseId) => dispatch({ type: 'DELETE_TODA_EXPENSE', expenseId }),
    savePassengerLocation: (passengerId, label, location) => {
      const id = `savedloc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'SAVE_PASSENGER_LOCATION', passengerId, id, label, location })
    },
    removePassengerLocation: (passengerId, savedLocationId) =>
      dispatch({ type: 'REMOVE_PASSENGER_LOCATION', passengerId, savedLocationId }),
    rateRide: (args) => dispatch({ type: 'RATE_RIDE', ...args }),
    reportDriver: (args) => {
      const id = `report-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'REPORT_DRIVER', id, ...args })
    },
    resolveDriverReport: (reportId) => dispatch({ type: 'RESOLVE_DRIVER_REPORT', reportId }),
    saveBoundary: (boundary) => dispatch({ type: 'SAVE_BOUNDARY', boundary }),
    deleteBoundary: (boundaryId) => dispatch({ type: 'DELETE_BOUNDARY', boundaryId }),
    addUnregisteredToda: (name, province, city, barangay) => {
      // Two drivers typing the same TODA must land on the same record, or the
      // roster it is supposed to build splits in half.
      const existing = state.todaOrganizations.find(
        (o) => o.name.trim().toLowerCase() === name.trim().toLowerCase(),
      )
      if (existing) return existing.id
      const id = `toda-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      dispatch({ type: 'ADD_UNREGISTERED_TODA', id, name, province, city, barangay })
      return id
    },
    registerDriver: (args) => dispatch({ type: 'REGISTER_DRIVER', inviteId: null, ...args }),
    createDriverInvite: (args) => {
      const id = `invite-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase()
      dispatch({ type: 'CREATE_DRIVER_INVITE', id, ...args })
      return id
    },
    removeDriverInvite: (inviteId) => dispatch({ type: 'REMOVE_DRIVER_INVITE', inviteId }),
    addVendorSampleOrder: (pharmacyId) => dispatch({ type: 'ADD_VENDOR_SAMPLE_ORDER', pharmacyId }),
    registerPassenger: (args) => {
      if (args.age < MINOR_AGE_LIMIT) return null
      const id = `pax-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'REGISTER_PASSENGER', id, ...args })
      return id
    },
    registerGuardianForStudent: (args) => {
      const parentId = `parent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'REGISTER_GUARDIAN_FOR_STUDENT', parentId, ...args })
      return parentId
    },
    registerParentWithChild: (args) => {
      if (args.childAge >= MINOR_AGE_LIMIT) return null
      const parentId = `parent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const childId = `pax-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'REGISTER_PARENT_WITH_CHILD', parentId, childId, ...args })
      return { parentId, childId }
    },
    logActivity: (args) => {
      const id = `actlog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'ADD_ACTIVITY_LOG_ENTRY', id, at: new Date().toISOString(), ...args })
    },
    addAdvertiser: (args) => {
      const id = `advertiser-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'ADD_ADVERTISER', id, contactEmail: null, notes: null, ...args })
    },
    updateAdvertiser: (advertiserId, args) =>
      dispatch({ type: 'UPDATE_ADVERTISER', advertiserId, contactEmail: null, notes: null, ...args }),
    removeAdvertiser: (advertiserId) => dispatch({ type: 'REMOVE_ADVERTISER', advertiserId }),
    addCampaign: (args) => {
      const id = `campaign-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({
        type: 'ADD_CAMPAIGN',
        id,
        endDate: null,
        rewardNote: null,
        dailyLimit: null,
        weeklyLimit: null,
        monthlyLimit: null,
        advertiserId: null,
        ...args,
      })
    },
    updateCampaign: (campaignId, args) =>
      dispatch({
        type: 'UPDATE_CAMPAIGN',
        campaignId,
        endDate: null,
        rewardNote: null,
        dailyLimit: null,
        weeklyLimit: null,
        monthlyLimit: null,
        advertiserId: null,
        ...args,
      }),
    setCampaignStatus: (campaignId, status) => dispatch({ type: 'SET_CAMPAIGN_STATUS', campaignId, status }),
    updateCampaignMetrics: (campaignId, args) => dispatch({ type: 'UPDATE_CAMPAIGN_METRICS', campaignId, ...args }),
    removeCampaign: (campaignId) => dispatch({ type: 'REMOVE_CAMPAIGN', campaignId }),
    addPromoOffer: (args) => {
      const id = `promo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'ADD_PROMO_OFFER', id, code: null, endDate: null, usageLimit: null, ...args })
    },
    updatePromoOffer: (offerId, args) =>
      dispatch({ type: 'UPDATE_PROMO_OFFER', offerId, code: null, endDate: null, usageLimit: null, ...args }),
    setPromoOfferStatus: (offerId, status) => dispatch({ type: 'SET_PROMO_OFFER_STATUS', offerId, status }),
    removePromoOffer: (offerId) => dispatch({ type: 'REMOVE_PROMO_OFFER', offerId }),
    setRewardRules: (rules) => dispatch({ type: 'SET_REWARD_RULES', rules }),
    addCoinTransaction: (args) => {
      const id = `coin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'ADD_COIN_TRANSACTION', id, campaignId: null, note: null, ...args })
    },
    removeCoinTransaction: (transactionId) => dispatch({ type: 'REMOVE_COIN_TRANSACTION', transactionId }),
    addRideCreditTier: (coins, pesoValue) => {
      const id = `credit-tier-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'ADD_RIDE_CREDIT_TIER', id, coins, pesoValue })
    },
    updateRideCreditTier: (tierId, coins, pesoValue) =>
      dispatch({ type: 'UPDATE_RIDE_CREDIT_TIER', tierId, coins, pesoValue }),
    removeRideCreditTier: (tierId) => dispatch({ type: 'REMOVE_RIDE_CREDIT_TIER', tierId }),
    addReferral: (args) => {
      const id = `referral-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'ADD_REFERRAL', id, referredPassengerId: null, campaignId: null, ...args })
    },
    setReferralStatus: (referralId, status, coinsAwarded) =>
      dispatch({ type: 'SET_REFERRAL_STATUS', referralId, status, coinsAwarded }),
    removeReferral: (referralId) => dispatch({ type: 'REMOVE_REFERRAL', referralId }),
    setIncomePromotionSettings: (settings) => dispatch({ type: 'SET_INCOME_PROMOTION_SETTINGS', settings }),
    addPartnershipRevenue: (args) => {
      const id = `partnership-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'ADD_PARTNERSHIP_REVENUE', id, ...args })
    },
    removePartnershipRevenue: (entryId) => dispatch({ type: 'REMOVE_PARTNERSHIP_REVENUE', entryId }),
    setAdSenseSettings: (settings) => dispatch({ type: 'SET_ADSENSE_SETTINGS', settings }),
    createMedsOrder: (args) => dispatch({ type: 'CREATE_MEDS_ORDER', ...args }),
    sendMedsQuote: (orderId, items, receiptDataUrl) => dispatch({ type: 'PHARMACY_SEND_QUOTE', orderId, items, receiptDataUrl }),
    vendorAcceptMenuOrder: (orderId) => dispatch({ type: 'VENDOR_ACCEPT_MENU_ORDER', orderId }),
    vendorSendQuote: (orderId, deliveryFee) => dispatch({ type: 'VENDOR_SEND_QUOTE', orderId, deliveryFee }),
    rejectMedsOrder: (orderId, reason) => dispatch({ type: 'PHARMACY_REJECT_MEDS_ORDER', orderId, reason }),
    reviewMedsPrescription: (orderId, approved, reason) =>
      dispatch({ type: 'REVIEW_MEDS_PRESCRIPTION', orderId, approved, reason }),
    acceptMedsQuote: (orderId, paymentMethod, paymentProofDataUrl, deliveryMode) =>
      dispatch({ type: 'CUSTOMER_ACCEPT_QUOTE', orderId, paymentMethod, paymentProofDataUrl, deliveryMode }),
    cancelMedsOrder: (orderId) => dispatch({ type: 'CANCEL_MEDS_ORDER', orderId }),
    vendorSwitchToOtherDelivery: (orderId) => dispatch({ type: 'VENDOR_SWITCH_TO_OTHER_DELIVERY', orderId }),
    vendorMarkDeliveredOther: (orderId) => dispatch({ type: 'VENDOR_MARK_DELIVERED_OTHER', orderId }),
    sendMedsOrderMessage: (orderId, sender, text) => dispatch({ type: 'SEND_MEDS_ORDER_MESSAGE', orderId, sender, text }),
    processMedsOrder: (orderId, preferredDriverId) =>
      dispatch({ type: 'PHARMACY_PROCESS_MEDS_ORDER', orderId, preferredDriverId: preferredDriverId ?? null }),
    bookOwnMedsRide: (orderId, overrides) => dispatch({ type: 'MEDS_ORDER_BOOK_OWN_RIDE', orderId, overrides }),
    vendorBookDelivery: (args) => dispatch({ type: 'VENDOR_BOOK_DELIVERY', ...args }),
    toggleMedicineProductStock: (productId) => dispatch({ type: 'TOGGLE_MEDICINE_PRODUCT_STOCK', productId }),
    toggleMedicineProductVisibility: (productId) => dispatch({ type: 'TOGGLE_MEDICINE_PRODUCT_VISIBILITY', productId }),
    setMedicineProductStockCount: (productId, stockCount) =>
      dispatch({ type: 'SET_MEDICINE_PRODUCT_STOCK_COUNT', productId, stockCount }),
    registerPharmacy: (args) => {
      const id = `pharm-${Date.now()}`
      dispatch({ type: 'REGISTER_PHARMACY', id, ...args })
      return id
    },
    addMedicineProduct: (args) => {
      const id = `med-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      dispatch({ type: 'ADD_MEDICINE_PRODUCT', id, ...args })
    },
    updateMedicineProduct: (args) => dispatch({ type: 'UPDATE_MEDICINE_PRODUCT', ...args }),
    removeMedicineProduct: (productId) => dispatch({ type: 'REMOVE_MEDICINE_PRODUCT', productId }),
    reorderMedicineProducts: (orderedIds) => dispatch({ type: 'REORDER_MEDICINE_PRODUCTS', orderedIds }),
    updatePharmacyPaymentAccount: (pharmacyId, method, details) =>
      dispatch({ type: 'UPDATE_PHARMACY_PAYMENT_ACCOUNT', pharmacyId, method, details }),
    updateVendorBranding: (args) => dispatch({ type: 'UPDATE_VENDOR_BRANDING', ...args }),
    setVendorBannerThumb: (pharmacyId, dataUrl, key) => dispatch({ type: 'SET_VENDOR_BANNER_THUMB', pharmacyId, dataUrl, key }),
    updatePharmacyLocation: (pharmacyId, locationGps) => dispatch({ type: 'UPDATE_PHARMACY_LOCATION', pharmacyId, locationGps }),
    togglePharmacyTrustedDriver: (pharmacyId, driverId) =>
      dispatch({ type: 'TOGGLE_PHARMACY_TRUSTED_DRIVER', pharmacyId, driverId }),
    ratePharmacy: (args) => dispatch({ type: 'RATE_PHARMACY', ...args }),
    addVendorPost: (args) => dispatch({ type: 'ADD_VENDOR_POST', ...args }),
    setVendorPostSharePhoto: (pharmacyId, postId, dataUrl) =>
      dispatch({ type: 'SET_VENDOR_POST_SHARE_PHOTO', pharmacyId, postId, dataUrl }),
    quoteVendorDeliveryFare: (pharmacyId, dropoff) => {
      const pharmacy = state.pharmacies.find((p) => p.id === pharmacyId)
      return pharmacy ? vendorDeliveryFareQuote(state, pharmacy, dropoff) : null
    },
    removeVendorPost: (pharmacyId, postId) => dispatch({ type: 'REMOVE_VENDOR_POST', pharmacyId, postId }),
    removePharmacy: (pharmacyId) => dispatch({ type: 'REMOVE_PHARMACY', pharmacyId }),
    reactToVendorPost: (pharmacyId, postId, reaction, actorId) =>
      dispatch({ type: 'REACT_VENDOR_POST', pharmacyId, postId, reaction, actorId }),
    commentOnVendorPost: (args) => dispatch({ type: 'COMMENT_VENDOR_POST', ...args }),
  }

  return <RideContext.Provider value={value}>{children}</RideContext.Provider>
}

export function useRides() {
  const ctx = useContext(RideContext)
  if (!ctx) throw new Error('useRides must be used within a RideProvider')
  return ctx
}

// True only for an address someone else could actually open. Rules out the
// dev server (localhost, this machine only) and both Capacitor webview
// origins — Android reports https://localhost, iOS capacitor://localhost —
// so a QR built from one is unscannable by anyone but the person holding
// the device.
// A shared read this document may hydrate from. An empty or malformed read
// — the collections every real world has are missing, or present but
// empty — is not "the shared state is empty"; it is a read that failed
// halfway or landed on seed data, and hydrating it would fill the screen
// with that and (once marked synced) write it over everyone's data. That
// is what happened on 2026-09-06 and again on 2026-09-08 at 10:10: a
// fresh-start reload hydrated a short read and erased every registered
// vendor, order and switch.
//
// The schema stamp is NOT part of this check. It was, for one day
// (2026-09-08), and that turned a single write missing the stamp — one
// stray save, from who knows which build — into a permanent block: every
// device that read it refused to ever sync again, showing its own stale
// copy forever, which is a worse failure than the one this guard exists
// to prevent. A world with real vendors and real TODAs in it is real
// data regardless of whether it happens to carry this version's stamp;
// the very next save re-stamps it, so a missing stamp heals itself the
// moment anyone acts, rather than needing a manual repair like this one
// did.
function assertUsableSharedState(shared: Record<string, unknown>): void {
  const hasWorld =
    Array.isArray(shared.pharmacies) &&
    shared.pharmacies.length > 0 &&
    Array.isArray(shared.todaOrganizations)
  if (!hasWorld) {
    throw new Error('shared state read is incomplete — not hydrating from it')
  }
}

export function isShareableOrigin(origin: string): boolean {
  return /^https?:\/\//.test(origin) && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(origin)
}

// The single source of truth for every shareable link/QR in the app (Super
// Admin's Access links tab, plus the invite links inside the TODA, Operator
// and Franchise portals). Falls back to the current origin, which is only
// correct when the app really is served from a public host.
export function usePublicOrigin(): { origin: string; shareable: boolean } {
  const { publicBaseUrl } = useRides()
  const current = typeof window !== 'undefined' ? window.location.origin : ''
  // Super Admin's setting first; else this page's own address when it is
  // one the world can reach; else the pilot's. A link built from
  // localhost (the dev server) or the installed app's own origin is dead
  // to everyone it is sent to — Facebook fetches nothing and shows no card.
  const origin = publicBaseUrl || (isShareableOrigin(current) ? current : PILOT_ORIGIN)
  return { origin, shareable: isShareableOrigin(origin) }
}

export const ETA_SECONDS_PER_LEG = LEG_DURATION_MS / 1000

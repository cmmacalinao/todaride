import { formatTripRoute } from '../lib/addressFormat'
import { rideServiceTag } from '../lib/vendorOrders'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AdminSectionTabs, useAdminTab } from '../components/AdminSectionTabs'
import { PilotTestChecklist } from '../components/PilotTestChecklist'
import { BannerAdManager } from '../components/BannerAdManager'
import { useRides, usePublicOrigin } from '../context/RideContext'
import { ShareLinkNotice } from '../components/ShareLinkNotice'
import { HotlineManager } from '../components/HotlineManager'
import { useAdminViewMode } from '../lib/adminViewMode'
import { AdminLiveMap } from '../components/AdminLiveMap'
import { PilaBannerAdmin } from '../components/PilaBannerAdmin'
import { QrCodeCreator } from '../components/QrCodeCreator'
import { AdminDriverQueue } from '../components/AdminDriverQueue'
import { AdminDriverDirectory } from '../components/AdminDriverDirectory'
import { AdminInsights } from '../components/AdminInsights'
import { AccountingOfficerManager } from '../components/AccountingOfficerManager'
import { ActivityLogPanel } from '../components/ActivityLogPanel'
import { SosAlertBanner } from '../components/SosAlertBanner'
import { AnnouncementsManager } from '../components/AnnouncementsManager'
import { ClientNotesCenter } from '../components/ClientNotesCenter'
import { SupportInbox } from '../components/SupportInbox'
import { CLSU_GPS, DEFAULT_BOOKING_CITY, DEFAULT_BOOKING_PROVINCE, DRIVER_REPORT_REASON_LABELS, getCitiesForProvince, getTodaQueue, isPastDeadline, resolveTariff, SAAS_PLAN_FEES } from '../mock/data'
import { getDispatchWindow } from '../lib/tracking'
import { matchesNameQuery } from '../lib/fuzzyName'
import { RealLiveMap } from '../components/RealLiveMap'
import { TerminalQuickPanel } from '../components/TerminalQuickPanel'
import { LandmarkQuickPanel } from '../components/LandmarkQuickPanel'
import { TodaBoundariesPanel } from '../components/TodaBoundariesPanel'
import { BarangayAddressPicker } from '../components/BarangayAddressPicker'
import { resolvePhAddress, type PhAddressTags } from '../lib/customLocation'
import { PABILI_FARE_MODE_LABELS, TERMINAL_TYPE_LABELS } from '../types'
import type {
  TodaOrganization,
  TodaOrgVerificationStatus,
  MockLocation,
  TerminalType, PabiliFareMode, SaasPlan } from '../types'

const ALERT_TYPE_LABELS = { sos: 'SOS', route_deviation: 'Route deviation' }

function alertLabel(a: { type: keyof typeof ALERT_TYPE_LABELS; triggeredByRole?: 'passenger' | 'driver' }): string {
  if (a.type === 'sos' && a.triggeredByRole === 'driver') return 'Driver SOS'
  return ALERT_TYPE_LABELS[a.type]
}

const TAAS_STATUS_STYLES: Record<string, string> = {
  approved: 'bg-brand-100 text-brand-700',
  pending: 'bg-amber-100 text-amber-800',
  rejected: 'bg-amber-100 text-amber-800',
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-brand-700">{value}</p>
    </div>
  )
}

// A panel that folds. The Terminals tab holds three of them, consulted at
// different times — queue timings when tuning dispatch, the live queues when
// watching a rank, the terminal list when adding or moving one. Open by
// default they push each other off the screen; folded, the tab is a short
// menu of what is there.
function AdminCollapsible({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        <span className="shrink-0 text-xs text-slate-400">{open ? '▲ Hide' : '▼ Show'}</span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </section>
  )
}

const TODA_DIRECTORY_GROUPS: { status: TodaOrgVerificationStatus; label: string }[] = [
  { status: 'approved', label: 'Approved' },
  { status: 'pending', label: 'Pending' },
  { status: 'unregistered', label: 'Named by drivers — not yet registered' },
  { status: 'rejected', label: 'Rejected' },
]

function TodaDirectoryRow({
  org,
  memberCount,
  onOpen,
}: {
  org: TodaOrganization
  memberCount: number
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-2 text-left hover:bg-slate-50"
    >
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-slate-700">{org.name}</span>
        <span className="block truncate text-[11px] text-slate-500">
          {[org.barangay, org.city].filter(Boolean).join(', ') || 'No address on file'} · {memberCount} member
          {memberCount === 1 ? '' : 's'}
        </span>
      </span>
      <span className="shrink-0 text-slate-300">›</span>
    </button>
  )
}

export function AdminPage() {
  const {
    rides,
    drivers,
    alerts,
    commissionPerRide,
    todaQueueWindowMs,
    specialPickupEscalationMs,
    todaOrganizations,
    operators,
    approveOperator,
    rejectOperator,
    setOperatorFees,
    setOperatorFranchise,
    franchises,
    approveFranchise,
    rejectFranchise,
    setFranchiseFees,
    duesGracePeriodDays,
    tripHistoryRetentionDays,
    membershipRequests,
    tariffSettings,
    driverReports,
    pabiliServiceFee,
    activityLog,
    resolveAlert,
    setCommission,
    setTodaQueueWindowMs,
    queueOfferTimeoutMs,
    setQueueOfferTimeoutMs,
    setSpecialPickupEscalationMs,
    setTodaCommissionAdminApproval,
    setDuesGracePeriodDays,
    setTripHistoryRetentionDays,
    resolveMembershipRequest,
    approveTodaOrg,
    rejectTodaOrg,
    setTodaOrgPendingNote,
    setTodaSaasPlan,
    setTodaOperator,
    setTariffSettings,
    cityTariffs,
    todaTariffs,
    setCityTariff,
    setTodaTariff,
    resolveDriverReport,
    setPabiliServiceFee,
    pabiliFareMode,
    pabiliFixedFare,
    setPabiliFareMode,
    setPabiliFixedFare,
    todaRadiusKm,
    outOfAreaPerKm,
    setTodaRadiusKm,
    terminals,
    setTerminalGps,
    boundaries,
    saveBoundary,
    deleteBoundary,
    setTerminalActive,
    addTerminal,
    removeTerminal,
    setOutOfAreaPerKm,
    logActivity,
  } = useRides()
  const [commissionInput, setCommissionInput] = useState(String(commissionPerRide))
  const navigate = useNavigate()
  const [todaNoteDrafts, setTodaNoteDrafts] = useState<Record<string, string>>({})
  const [todaDirectoryQuery, setTodaDirectoryQuery] = useState('')
  const [todaDeadlineDrafts, setTodaDeadlineDrafts] = useState<Record<string, string>>({})
  const [todaPlanDrafts, setTodaPlanDrafts] = useState<Record<string, SaasPlan>>({})
  const [todaPerBookingDrafts, setTodaPerBookingDrafts] = useState<Record<string, string>>({})
  const [operatorFeeDrafts, setOperatorFeeDrafts] = useState<
    Record<string, { activation: string; monthly: string; perBooking: string }>
  >({})
  const [franchiseFeeDrafts, setFranchiseFeeDrafts] = useState<
    Record<string, { initial: string; monthly: string; royalty: string }>
  >({})
  // Which section shows now comes from ?tab= so the strip works as
  // navigation from any admin surface, not just from this page.
  const adminTab = useAdminTab()
  const [taasTab, setTaasTab] = useState<'operator' | 'franchise'>('operator')
  const [copiedLink, setCopiedLink] = useState<'operator' | 'franchise' | null>(null)
  // ?apply=1 tells AuthGate's OperatorAuth/FranchiseAuth to open straight on
  // the Sign-up sub-tab instead of Login — this is the link Admin shares
  // with a prospective applicant, distinct from the plain portal-login URL.
  const { origin: publicOrigin, shareable: originShareable } = usePublicOrigin()
  const { containerClass } = useAdminViewMode()
  const operatorApplyLink = `${publicOrigin}/operator?apply=1`
  const franchiseApplyLink = `${publicOrigin}/franchise?apply=1`

  function handleCopyLink(url: string, which: 'operator' | 'franchise') {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(which)
      setTimeout(() => setCopiedLink(null), 2000)
    })
  }
  const [queueWindowInput, setQueueWindowInput] = useState(String(Math.round(todaQueueWindowMs / 1000)))
  const [offerHoldInput, setOfferHoldInput] = useState(String(Math.round(queueOfferTimeoutMs / 1000)))
  const [specialPickupWindowInput, setSpecialPickupWindowInput] = useState(
    String(Math.round(specialPickupEscalationMs / 1000)),
  )
  const [graceDaysInput, setGraceDaysInput] = useState(String(duesGracePeriodDays))
  const [tripHistoryDaysInput, setTripHistoryDaysInput] = useState(String(tripHistoryRetentionDays))
  const [standardRateInput, setStandardRateInput] = useState(String(tariffSettings.standardRate))
  const [studentRateInput, setStudentRateInput] = useState(String(tariffSettings.studentRate))
  const [pwdSeniorRateInput, setPwdSeniorRateInput] = useState(String(tariffSettings.pwdSeniorRate))
  const [perKmRateInput, setPerKmRateInput] = useState(String(tariffSettings.perKmRate))
  const [standardKmInput, setStandardKmInput] = useState(String(tariffSettings.standardKmCovered))
  const [extraPassengerFeeInput, setExtraPassengerFeeInput] = useState(String(tariffSettings.extraPassengerFee))
  const [groupDiscountInput, setGroupDiscountInput] = useState(String(tariffSettings.groupRideDiscountPct))
  const [groupFareMode, setGroupFareMode] = useState(tariffSettings.groupRideFareMode)
  const [groupFlat2Input, setGroupFlat2Input] = useState(String(tariffSettings.groupRideFlatRate2))
  const [groupFlat3Input, setGroupFlat3Input] = useState(String(tariffSettings.groupRideFlatRate3))
  const [groupFlat4Input, setGroupFlat4Input] = useState(String(tariffSettings.groupRideFlatRate4))
  // Which taripa the form below is editing: the platform default, one
  // city's, or one TODA's. Stored as a single string so the picker is one
  // control rather than three, and so the form has exactly one subject at a
  // time — an operator should never be unsure which schedule they just
  // changed.
  const [tariffScope, setTariffScope] = useState('default')
  const [tariffError, setTariffError] = useState('')
  const [pabiliFeeInput, setPabiliFeeInput] = useState(String(pabiliServiceFee))
  const [pabiliFixedFareInput, setPabiliFixedFareInput] = useState(String(pabiliFixedFare))
  const [radiusInput, setRadiusInput] = useState(String(todaRadiusKm))
  const [newTerminal, setNewTerminal] = useState({ id: '', name: '', type: 'university' as TerminalType, orgId: '' })
  // Where the new terminal goes, answered the same way a passenger answers
  // "where?" — province, city, barangay, then the street detail. A terminal
  // is not always at the org's own address: a TODA can run a stand in the
  // next barangay, and a university system runs several across one campus.
  const [newTerminalPlace, setNewTerminalPlace] = useState<MockLocation | null>(null)
  const [placingTerminal, setPlacingTerminal] = useState(false)
  const [outOfAreaInput, setOutOfAreaInput] = useState(String(outOfAreaPerKm))

  const activeRides = rides.filter(
    (r) => (r.status === 'driver_arriving' || r.status === 'ongoing') && r.driverPosition,
  )
  // Requested but not yet accepted by anyone — invisible everywhere else in
  // Admin (the live map only tracks driver_arriving/ongoing rides), so this
  // is the only place to spot a request nobody's picking up.
  const pendingRequests = [...rides.filter((r) => r.status === 'requested')].sort(
    (a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime(),
  )
  const completedRides = rides.filter((r) => r.status === 'completed')
  const grossFares = completedRides.reduce((sum, r) => sum + (r.payment?.amount ?? 0), 0)
  const platformRevenue = completedRides.reduce((sum, r) => sum + (r.payment?.platformFee ?? 0), 0)
  const driverPayouts = completedRides.reduce((sum, r) => sum + (r.payment?.driverPayout ?? 0), 0)
  const ridesToday = rides.filter(
    (r) => new Date(r.requestedAt).toDateString() === new Date().toDateString(),
  ).length
  const activeDrivers = drivers.filter((d) => d.verificationStatus === 'approved' && d.online).length

  // TaaS rollup — Business KPIs the roadmap calls out (monthly recurring
  // revenue, revenue per operator, franchise revenue), summed from each
  // tier's own billing fields. Estimate only: excludes per-booking usage
  // fees (those vary per org, see estimatedMonthlyTodaFee/OperatorFee in
  // each portal) and one-time activation/franchise fees.
  const approvedTodaCount = todaOrganizations.filter((o) => o.verificationStatus === 'approved').length
  const approvedOperatorCount = operators.filter((o) => o.verificationStatus === 'approved').length
  const approvedFranchiseCount = franchises.filter((f) => f.verificationStatus === 'approved').length
  const estimatedMonthlyRecurringRevenue =
    todaOrganizations.filter((o) => o.verificationStatus === 'approved').reduce((sum, o) => sum + o.monthlyPlatformFee, 0) +
    operators.filter((o) => o.verificationStatus === 'approved').reduce((sum, o) => sum + o.monthlyPlatformFee, 0) +
    franchises.filter((f) => f.verificationStatus === 'approved').reduce((sum, f) => sum + f.monthlyTechnologyFee, 0)

  const openAlerts = alerts.filter((a) => a.status === 'open')
  const resolvedAlerts = alerts.filter((a) => a.status === 'resolved')
  const openReports = driverReports.filter((r) => r.status === 'open')
  const reviewedReports = driverReports.filter((r) => r.status === 'reviewed')

  // "Admin" here (vs. the extra-gated "Super Admin" used by
  // AdminAccounting.tsx) — matches the same two badges NavBar already shows
  // for this role (see NavBar.tsx's role === 'admin' block).
  function logAdmin(action: string, summary: string) {
    logActivity({ actorRole: 'admin', actorName: 'Admin', todaOrgId: null, action, summary })
  }

  function handleSaveCommission() {
    const amount = Number(commissionInput)
    if (!Number.isFinite(amount) || amount < 0) return
    setCommission(amount)
    logAdmin('Updated commission', `Platform commission per ride set to ₱${amount}.`)
  }

  function handleSaveQueueWindow() {
    const seconds = Number(queueWindowInput)
    if (!Number.isFinite(seconds) || seconds <= 0) return
    setTodaQueueWindowMs(seconds * 1000)
    logAdmin('Updated terminal Pila window', `Terminal priority Pila window set to ${seconds}s.`)
  }

  function handleSaveOfferHold() {
    const seconds = Number(offerHoldInput)
    if (!Number.isFinite(seconds) || seconds <= 0) return
    setQueueOfferTimeoutMs(seconds * 1000)
    logAdmin('Updated driver offer hold time', `Each driver now holds a request for ${seconds}s before it passes on.`)
  }

  function handleSaveSpecialPickupWindow() {
    const seconds = Number(specialPickupWindowInput)
    if (!Number.isFinite(seconds) || seconds <= 0) return
    setSpecialPickupEscalationMs(seconds * 1000)
    logAdmin('Updated special pickup escalation window', `Special pickup escalation window set to ${seconds}s.`)
  }

  function handleSaveGraceDays() {
    const days = Number(graceDaysInput)
    if (!Number.isFinite(days) || days <= 0) return
    setDuesGracePeriodDays(days)
    logAdmin('Updated dues grace period', `Dues grace period set to ${days} day(s).`)
  }

  function handleSaveTripHistoryDays() {
    const days = Number(tripHistoryDaysInput)
    if (!Number.isFinite(days) || days <= 0) return
    setTripHistoryRetentionDays(days)
    logAdmin('Updated trip history retention', `Trip history now shows the last ${days} day(s).`)
  }

  const scopeCity = tariffScope.startsWith('city:') ? tariffScope.slice(5) : null
  const scopeToda = tariffScope.startsWith('toda:') ? tariffScope.slice(5) : null
  const tariffScopeLabel = scopeCity
    ? scopeCity
    : scopeToda
      ? (todaOrganizations.find((o) => o.id === scopeToda)?.name ?? scopeToda)
      : 'All cities'
  // Whether this scope has a schedule of its own, or is simply inheriting.
  const scopeHasOwn = scopeCity
    ? !!cityTariffs[scopeCity]
    : scopeToda
      ? !!todaTariffs[scopeToda]
      : true

  // Loads whichever schedule the picker just selected into the form. An
  // inheriting scope shows what it currently inherits, so an operator edits
  // real numbers rather than a blank form and can see what they are
  // departing from.
  function loadTariffInto(next: string) {
    setTariffScope(next)
    setTariffError('')
    const city = next.startsWith('city:') ? next.slice(5) : null
    const toda = next.startsWith('toda:') ? next.slice(5) : null
    const t = resolveTariff(tariffSettings, cityTariffs, todaTariffs, city, toda)
    setStandardRateInput(String(t.standardRate))
    setStudentRateInput(String(t.studentRate))
    setPwdSeniorRateInput(String(t.pwdSeniorRate))
    setPerKmRateInput(String(t.perKmRate))
    setStandardKmInput(String(t.standardKmCovered))
    setExtraPassengerFeeInput(String(t.extraPassengerFee))
    setGroupDiscountInput(String(t.groupRideDiscountPct))
    setGroupFareMode(t.groupRideFareMode)
    setGroupFlat2Input(String(t.groupRideFlatRate2))
    setGroupFlat3Input(String(t.groupRideFlatRate3))
    setGroupFlat4Input(String(t.groupRideFlatRate4))
  }

  function handleUseDefaultTariff() {
    if (scopeCity) setCityTariff(scopeCity, null)
    else if (scopeToda) setTodaTariff(scopeToda, null)
    logAdmin(`Removed custom tariff — ${tariffScopeLabel}`, 'Back to the schedule it inherits.')
    loadTariffInto('default')
  }

  function handleSaveTariff() {
    const standardRate = Number(standardRateInput)
    const studentRate = Number(studentRateInput)
    const pwdSeniorRate = Number(pwdSeniorRateInput)
    const perKmRate = Number(perKmRateInput)
    const standardKmCovered = Number(standardKmInput)
    const extraPassengerFee = Number(extraPassengerFeeInput)
    const groupRideDiscountPct = Number(groupDiscountInput)
    if (
      ![standardRate, studentRate, pwdSeniorRate, perKmRate, standardKmCovered, extraPassengerFee].every(
        (n) => Number.isFinite(n) && n >= 0,
      )
    ) {
      setTariffError('All tariff fields must be numbers of 0 or more.')
      return
    }
    if (!Number.isFinite(groupRideDiscountPct) || groupRideDiscountPct < 0 || groupRideDiscountPct > 100) {
      setTariffError('Group ride discount must be a number between 0 and 100.')
      return
    }
    setTariffError('')
    const flat2 = Number(groupFlat2Input)
    const flat3 = Number(groupFlat3Input)
    const flat4 = Number(groupFlat4Input)
    if ([flat2, flat3, flat4].some((n) => !Number.isFinite(n) || n < 0)) {
      setTariffError('Group fares must be numbers of 0 or more.')
      return
    }
    const settings = {
      standardRate,
      studentRate,
      pwdSeniorRate,
      perKmRate,
      standardKmCovered,
      extraPassengerFee,
      groupRideDiscountPct,
      groupRideFareMode: groupFareMode,
      groupRideFlatRate2: flat2,
      groupRideFlatRate3: flat3,
      groupRideFlatRate4: flat4,
    }
    if (tariffScope.startsWith('city:')) setCityTariff(tariffScope.slice(5), settings)
    else if (tariffScope.startsWith('toda:')) setTodaTariff(tariffScope.slice(5), settings)
    else setTariffSettings(settings)
    logAdmin(
      `Updated fare tariff — ${tariffScopeLabel}`,
      `Standard ₱${standardRate}, student ₱${studentRate}, PWD/Senior ₱${pwdSeniorRate}, covers ${standardKmCovered} km then ₱${perKmRate}/km, group discount ${groupRideDiscountPct}%.`,
    )
  }

  function handleSavePabiliFee() {
    const amount = Number(pabiliFeeInput)
    if (!Number.isFinite(amount) || amount < 0) return
    setPabiliServiceFee(amount)
    logAdmin('Updated Pabili service fee', `Pabili service fee set to ₱${amount}.`)
  }

  function handleSavePabiliFixedFare() {
    const amount = Math.max(0, Math.round(Number(pabiliFixedFareInput) || 0))
    setPabiliFixedFare(amount)
    logAdmin('Updated Pabili fixed fare', `Pabili fixed rate set to ₱${amount}.`)
  }

  function handlePabiliFareMode(mode: PabiliFareMode) {
    setPabiliFareMode(mode)
    logAdmin('Updated Pabili fare basis', `Pabili fare basis set to "${PABILI_FARE_MODE_LABELS[mode]}".`)
  }

  async function handleTerminalAddressResolve(address: PhAddressTags) {
    setPlacingTerminal(true)
    try {
      setNewTerminalPlace(await resolvePhAddress(address))
    } finally {
      setPlacingTerminal(false)
    }
  }

  function handleAddTerminal() {
    const id = newTerminal.id.trim()
    const name = newTerminal.name.trim()
    const orgId = newTerminal.orgId || todaOrganizations[0]?.id
    if (!id || !name || !orgId) return
    if (terminals.some((t) => t.id.toLowerCase() === id.toLowerCase())) return
    const org = todaOrganizations.find((o) => o.id === orgId)
    addTerminal({
      id,
      name,
      type: newTerminal.type,
      todaOrgId: orgId,
      // The address chosen above, when there is one. Failing that it starts
      // at its organisation's own terminal, then the campus anchor — always
      // somewhere, because a terminal with no position cannot be dragged
      // into place at all.
      gps: newTerminalPlace?.gps ?? org?.terminalGps ?? CLSU_GPS,
      province: newTerminalPlace?.province ?? org?.province ?? '',
      city: newTerminalPlace?.city ?? org?.city ?? '',
      barangay: newTerminalPlace?.barangay ?? org?.barangay ?? '',
      addressDetail: newTerminalPlace?.label ?? '',
      isActive: true,
    })
    logAdmin('Added terminal', `${id} — ${name} under ${org?.name ?? orgId}.`)
    setNewTerminal({ id: '', name: '', type: 'university', orgId: '' })
    setNewTerminalPlace(null)
  }

  function handleTerminalMoved(terminalId: string, gps: { lat: number; lng: number }) {
    setTerminalGps(terminalId, gps)
    logAdmin('Moved terminal', `${terminalId} set to ${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}.`)
  }

  function handleSaveJurisdiction() {
    const km = Math.max(0, Number(radiusInput) || 0)
    const perKm = Math.max(0, Math.round(Number(outOfAreaInput) || 0))
    setTodaRadiusKm(km)
    setOutOfAreaPerKm(perKm)
    logAdmin('Updated TODA jurisdiction', `Area radius ${km} km, out-of-area rate ₱${perKm}/km.`)
  }

  function handleApproveTodaOrg(orgId: string, orgName: string) {
    approveTodaOrg(orgId)
    logActivity({ actorRole: 'admin', actorName: 'Admin', todaOrgId: orgId, action: 'Approved TODA org', summary: `Approved "${orgName}"'s registration.` })
  }

  function handleRejectTodaOrg(orgId: string, orgName: string) {
    rejectTodaOrg(orgId)
    logActivity({ actorRole: 'admin', actorName: 'Admin', todaOrgId: orgId, action: 'Rejected TODA org', summary: `Rejected "${orgName}"'s registration.` })
  }

  function handleApproveTodaOrgAsNoted(todaOrgId: string, orgName: string) {
    const note = (todaNoteDrafts[todaOrgId] ?? '').trim() || null
    const days = Number(todaDeadlineDrafts[todaOrgId])
    const deadline = Number.isFinite(days) && days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null
    setTodaOrgPendingNote(todaOrgId, note, deadline)
    logActivity({
      actorRole: 'admin',
      actorName: 'Admin',
      todaOrgId,
      action: 'Approved TODA org as noted',
      summary: `Approved "${orgName}" as noted${note ? ` — "${note}"` : ''}${deadline ? `, resubmit by ${new Date(deadline).toLocaleDateString()}` : ''}.`,
    })
  }

  function handleSaveTodaPlan(orgId: string, orgName: string) {
    const plan = todaPlanDrafts[orgId]
    if (!plan) return
    const perBookingFee = Number(todaPerBookingDrafts[orgId] ?? 0)
    if (!Number.isFinite(perBookingFee) || perBookingFee < 0) return
    setTodaSaasPlan(orgId, plan, perBookingFee)
    logActivity({
      actorRole: 'admin',
      actorName: 'Admin',
      todaOrgId: orgId,
      action: 'Updated SaaS plan',
      summary: `Set "${orgName}" to the ${plan} plan (₱${SAAS_PLAN_FEES[plan]}/mo${perBookingFee > 0 ? ` + ₱${perBookingFee}/booking` : ''}).`,
    })
  }

  function handleApproveOperator(operatorId: string, operatorName: string) {
    const draft = operatorFeeDrafts[operatorId]
    const activationFee = draft?.activation.trim() ? Number(draft.activation) : null
    const monthlyPlatformFee = Number(draft?.monthly ?? 0)
    const perBookingFee = Number(draft?.perBooking ?? 0)
    if (
      (activationFee !== null && (!Number.isFinite(activationFee) || activationFee < 0)) ||
      !Number.isFinite(monthlyPlatformFee) ||
      monthlyPlatformFee < 0 ||
      !Number.isFinite(perBookingFee) ||
      perBookingFee < 0
    ) {
      return
    }
    setOperatorFees(operatorId, activationFee, monthlyPlatformFee, perBookingFee)
    approveOperator(operatorId)
    logAdmin(
      'Approved Operator',
      `Approved "${operatorName}" (₱${monthlyPlatformFee}/mo${activationFee !== null ? `, ₱${activationFee} activation` : ''}).`,
    )
  }

  function handleRejectOperator(operatorId: string, operatorName: string) {
    rejectOperator(operatorId)
    logAdmin('Rejected Operator', `Rejected "${operatorName}"'s application.`)
  }

  function handleApproveFranchise(franchiseId: string, franchiseName: string) {
    const draft = franchiseFeeDrafts[franchiseId]
    const initialFranchiseFee = draft?.initial.trim() ? Number(draft.initial) : null
    const monthlyTechnologyFee = Number(draft?.monthly ?? 0)
    const royaltyPct = draft?.royalty.trim() ? Number(draft.royalty) : null
    if (
      (initialFranchiseFee !== null && (!Number.isFinite(initialFranchiseFee) || initialFranchiseFee < 0)) ||
      !Number.isFinite(monthlyTechnologyFee) ||
      monthlyTechnologyFee < 0 ||
      (royaltyPct !== null && (!Number.isFinite(royaltyPct) || royaltyPct < 0))
    ) {
      return
    }
    setFranchiseFees(franchiseId, initialFranchiseFee, monthlyTechnologyFee, royaltyPct)
    approveFranchise(franchiseId)
    logAdmin(
      'Approved Franchise',
      `Approved "${franchiseName}" (₱${monthlyTechnologyFee}/mo${initialFranchiseFee !== null ? `, ₱${initialFranchiseFee} franchise fee` : ''}).`,
    )
  }

  function handleRejectFranchise(franchiseId: string, franchiseName: string) {
    rejectFranchise(franchiseId)
    logAdmin('Rejected Franchise', `Rejected "${franchiseName}"'s application.`)
  }

  function handleSetOperatorFranchise(operatorId: string, operatorName: string, franchiseId: string | null) {
    setOperatorFranchise(operatorId, franchiseId)
    const franchiseName = franchiseId ? franchises.find((f) => f.id === franchiseId)?.name ?? franchiseId : 'TODA Ride Mobility HQ (direct)'
    logAdmin('Reassigned Operator franchise', `"${operatorName}" now reports to ${franchiseName}.`)
  }

  function handleSetTodaOperator(orgId: string, orgName: string, operatorId: string | null) {
    setTodaOperator(orgId, operatorId)
    const operatorName = operatorId ? operators.find((o) => o.id === operatorId)?.name ?? operatorId : 'TODA Ride Mobility HQ (direct)'
    logActivity({
      actorRole: 'admin',
      actorName: 'Admin',
      todaOrgId: orgId,
      action: 'Reassigned TODA operator',
      summary: `"${orgName}" now reports to ${operatorName}.`,
    })
  }

  const pendingMembershipRequests = membershipRequests.filter((r) => r.status === 'pending')
  const pendingTodaOrgs = todaOrganizations.filter((o) => o.verificationStatus === 'pending')
  // TODAs that exist only because drivers named them at sign-up. They have no
  // officers and no PIN yet, but they do have members — and those members are
  // what the association will be accredited with when it finally applies.
  const unregisteredTodaOrgs = todaOrganizations.filter((o) => o.verificationStatus === 'unregistered')

  return (
    <div className={`mx-auto ${containerClass} space-y-3 px-4 pb-6 pt-1`}>
      <SosAlertBanner />
      <AdminSectionTabs />

      <a
        href="https://claude.ai/code/artifact/00130839-9ecc-4550-b254-7dc4e06f7473"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        <span>📘 Platform Playbook — full app overview</span>
        <span className="text-slate-400">↗</span>
      </a>

      {adminTab === 'overview' && (
      <>
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Reporting</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Rides today" value={String(ridesToday)} />
          <StatTile label="Total rides" value={String(rides.length)} />
          <StatTile label="Gross fares" value={`₱${grossFares}`} />
          <StatTile label="Active drivers" value={String(activeDrivers)} />
          <StatTile label="Platform revenue" value={`₱${platformRevenue}`} />
          <StatTile label="Driver payouts" value={`₱${driverPayouts}`} />
        </div>
      </section>

      {/* Directly under the numbers they explain. These used to sit at the
          bottom of Overview, which on a laptop is a scroll and on a phone is
          2,400px — far enough down that the charts might as well not have
          been built. The partner counts below are a different question
          (how the business is structured, not how it is running), so they
          are what got moved rather than what got read first. */}
      <AdminInsights />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Subscription partners</h2>
        <p className="mb-3 text-xs text-slate-500">
          SaaS Partner → Authorized Operator → Franchise, per the TODA Ride Mobility Level 1/2/3 partner plan. Estimated MRR
          excludes per-booking usage fees and one-time activation/franchise fees.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Level 1 — TODAs" value={String(approvedTodaCount)} />
          <StatTile label="Level 2 — Operators" value={String(approvedOperatorCount)} />
          <StatTile label="Level 3 — Franchises" value={String(approvedFranchiseCount)} />
          <StatTile label="Estimated MRR" value={`₱${estimatedMonthlyRecurringRevenue}`} />
        </div>
      </section>
      </>
      )}

      {adminTab === 'settings' && <AccountingOfficerManager />}

      {adminTab === 'fees' && (
      <>
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">Commission settings</h2>
        <p className="mb-3 text-xs text-slate-500">
          Flat platform fee deducted from each completed ride's fare before the driver is paid out. The
          remainder credits the driver's account balance automatically on completion.
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">₱</span>
          <input
            type="number"
            min={0}
            value={commissionInput}
            onChange={(e) => setCommissionInput(e.target.value)}
            className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
          <span className="text-xs text-slate-500">per ride</span>
          <button
            onClick={handleSaveCommission}
            className="ml-auto rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            Save
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">Current: ₱{commissionPerRide} per ride</p>
      </section>
      </>
      )}

      {adminTab === 'addterminal' && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700">➕ Add a terminal</h2>
          <p className="mb-2 mt-0.5 text-xs text-slate-500">
            Tap the map where the terminal stands, or type its coordinates. Drag a 🚏 to nudge it; right-click one to
            move or delete it.
          </p>
          <TerminalQuickPanel
            orgs={todaOrganizations.filter((o) => o.verificationStatus === 'approved')}
            terminals={terminals}
            onAdd={addTerminal}
            onRemove={removeTerminal}
            onMove={setTerminalGps}
            onClose={() => navigate('/admin?tab=terminals')}
          />
        </section>
      )}

      {adminTab === 'boundaries' && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700">🗺️ TODA Boundaries</h2>
          <p className="mb-2 mt-0.5 text-xs text-slate-500">
            Mark the area a TODA covers by tapping its corners on the map — the real boundary, which follows roads and
            barangay lines rather than the circle the out-of-area fare measures.
            {boundaries.length > 0 && ` ${boundaries.length} boundary(ies) saved so far.`}
          </p>
          <TodaBoundariesPanel
            orgs={todaOrganizations.filter((o) => o.verificationStatus === 'approved')}
            terminals={terminals}
            boundaries={boundaries}
            onSave={saveBoundary}
            onDelete={deleteBoundary}
            onClose={() => navigate('/admin?tab=terminals')}
          />
        </section>
      )}

      {adminTab === 'landmarks' && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700">📍 Landmarks</h2>
          <p className="mb-2 mt-0.5 text-xs text-slate-500">
            What a passenger's destination search matches against (see DestinationSearch) — a market, school, church
            or any other named place worth searching for, per city. Nueva Ecija addressing runs on landmarks, not
            street names, so aliases matter more than the formal name.
          </p>
          <LandmarkQuickPanel onClose={() => navigate('/admin?tab=landmarks')} />
        </section>
      )}

      {adminTab === 'terminals' && (
      <>
      <AdminCollapsible title="Sakay sa Terminal banner">
        <PilaBannerAdmin />
      </AdminCollapsible>

      <AdminCollapsible title="QR code creator — banners, posters, tricycle stickers">
        <QrCodeCreator />
      </AdminCollapsible>

      <AdminCollapsible title="TODA terminal Pila settings">
        <p className="mb-3 text-xs text-slate-500">
          A new ride is first offered only to the nearest driver in the pickup's TODA — the Pila at the terminal, or a
          member who is online with no passenger. If that driver
          doesn't accept, it passes down the line one at a time. Once this whole window elapses — or the terminal
          Pila is empty or exhausted — the ride opens to freelance drivers and other TODAs nearby.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={queueWindowInput}
            onChange={(e) => setQueueWindowInput(e.target.value)}
            className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
          <span className="text-xs text-slate-500">seconds</span>
          <button
            onClick={handleSaveQueueWindow}
            className="ml-auto rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            Save
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Current: {Math.round(todaQueueWindowMs / 1000)}s (real terminals run this on a ~2-minute cycle — this app
          compresses simulated time so it's demoable, but the number itself is exactly what's configured here)
        </p>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <h3 className="mb-1 text-xs font-semibold text-slate-700">Driver offer hold time</h3>
          <p className="mb-3 text-xs text-slate-500">
            A booking goes to one driver at a time — whoever is closest to the pickup, counting both the drivers
            in the terminal line and members who are online with no passenger. This is how long that driver has
            to answer before the request passes to the next-nearest. Short enough that a passenger isn't left
            waiting on someone who stepped away; long enough to actually read it and decide.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={offerHoldInput}
              onChange={(e) => setOfferHoldInput(e.target.value)}
              className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
            <span className="text-xs text-slate-500">seconds</span>
            <button
              onClick={handleSaveOfferHold}
              className="ml-auto rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
            >
              Save
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Current: {Math.round(queueOfferTimeoutMs / 1000)}s per driver (the window above is the overall ceiling —
            once it runs out the ride stops being the TODA's and opens to everyone)
          </p>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <h3 className="mb-1 text-xs font-semibold text-slate-700">Special pickup escalation window</h3>
          <p className="mb-3 text-xs text-slate-500">
            A special pickup (passenger asked to be picked up at their exact spot instead of the Terminal) is a
            harder ask for a driver — it gets its own, longer window before opening up. If no one from the
            passenger's TODA accepts within this time, it opens to any active TODA member and freelance driver.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={specialPickupWindowInput}
              onChange={(e) => setSpecialPickupWindowInput(e.target.value)}
              className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
            <span className="text-xs text-slate-500">seconds</span>
            <button
              onClick={handleSaveSpecialPickupWindow}
              className="ml-auto rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
            >
              Save
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Current: {Math.round(specialPickupEscalationMs / 1000)}s (defaults to a literal 5 real minutes — not
            compressed like the general Pila window above, since a special pickup deserves more patience)
          </p>
        </div>
      </AdminCollapsible>

      </>
      )}

      {adminTab === 'todas' && (
      <>
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">Find a TODA</h2>
          <span className="shrink-0 text-[11px] text-slate-400">{todaOrganizations.length} on file</span>
        </div>
        <input
          value={todaDirectoryQuery}
          onChange={(e) => setTodaDirectoryQuery(e.target.value)}
          placeholder="Search by TODA name, city, or barangay…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        {/* Every TODA, whatever its status — the queues below only ever show
            the ones waiting on Admin, and looking up an accredited one meant
            having nowhere to go. Grouped by status and folded, because the
            flat list of every TODA on the platform is the one thing this
            panel must not turn into. Searching opens the groups that have
            hits (the key changes with the query, so they remount open) —
            otherwise typing a name would look like it found nothing. */}
        {(() => {
          const q = todaDirectoryQuery.trim()
          const matches = q
            ? todaOrganizations.filter(
                (org) =>
                  matchesNameQuery(org.name, q) ||
                  org.city.toLowerCase().includes(q.toLowerCase()) ||
                  org.barangay.toLowerCase().includes(q.toLowerCase()),
              )
            : todaOrganizations
          if (matches.length === 0) {
            return <p className="mt-2 text-xs text-slate-400">No TODA matches "{q}".</p>
          }
          return (
            <div className="mt-2 space-y-2">
              {TODA_DIRECTORY_GROUPS.map((group) => {
                const rows = matches.filter((org) => org.verificationStatus === group.status)
                if (rows.length === 0) return null
                return (
                  <AdminCollapsible
                    key={`${group.status}-${q}`}
                    title={`${group.label} — ${rows.length}`}
                    defaultOpen={q.length > 0}
                  >
                    <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                      {rows.map((org) => (
                        <TodaDirectoryRow
                          key={org.id}
                          org={org}
                          memberCount={drivers.filter((d) => d.todaOrgId === org.id).length}
                          onOpen={() => navigate(`/admin/toda/${org.id}`)}
                        />
                      ))}
                    </div>
                  </AdminCollapsible>
                )
              })}
            </div>
          )
        })()}
      </section>

      <AdminCollapsible title={`TODAs named by drivers (not yet registered) — ${unregisteredTodaOrgs.length}`}>
        <p className="mb-2 text-xs text-slate-500">
          Added by drivers during sign-up. Nothing to approve here — these associations have not applied yet. When one
          does, its application claims this same record and every driver below is accredited with it.
        </p>
        {unregisteredTodaOrgs.length === 0 && (
          <p className="text-sm text-slate-400">No driver-named TODAs waiting for their association to apply.</p>
        )}
        <div className="space-y-2">
          {unregisteredTodaOrgs.map((org) => {
            const members = drivers.filter((d) => d.todaOrgId === org.id)
            return (
              <div key={org.id} className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-slate-700">{org.name}</p>
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                    {members.length} member{members.length === 1 ? '' : 's'}
                  </span>
                </div>
                {(org.barangay || org.city) && (
                  <p className="mt-1 text-slate-500">
                    {[org.barangay && `Barangay ${org.barangay}`, org.city, org.province].filter(Boolean).join(', ')}
                  </p>
                )}
                {members.length > 0 && <p className="mt-1 text-slate-500">{members.map((d) => d.name).join(', ')}</p>}
              </div>
            )
          })}
        </div>
      </AdminCollapsible>

      {/* Open when something is actually waiting on Admin, folded when the
          queue is empty — the count stays visible in the title either way, so
          folding never hides work. */}
      <AdminCollapsible
        title={`TODA registration Pila — ${pendingTodaOrgs.length} pending`}
        defaultOpen={pendingTodaOrgs.length > 0}
      >
        {pendingTodaOrgs.length === 0 && <p className="text-sm text-slate-400">No pending TODA applications.</p>}
        <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
          {pendingTodaOrgs.map((org) => (
            <div key={org.id} className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
              <p className="font-medium text-slate-700">{org.name}</p>
              <p className="mt-1 text-slate-500">
                Officers: {org.officers.map((o) => `${o.name} (${o.role})`).join(', ')}
              </p>
              <p className="mt-1 text-slate-500">
                {org.addressDetail}, Barangay {org.barangay}, {org.city}, {org.province}
              </p>
              <p className="mt-1 text-slate-500">
                Terminal GPS:{' '}
                {org.terminalGps
                  ? `${org.terminalGps.lat.toFixed(6)}, ${org.terminalGps.lng.toFixed(6)}`
                  : 'not captured yet'}
              </p>
              {(() => {
                // Drivers who signed up under this TODA before it applied.
                // Approving the application accredits them with it — so they
                // belong on the application itself, not as a later surprise.
                const members = drivers.filter((d) => d.todaOrgId === org.id)
                if (members.length === 0) return null
                return (
                  <p className="mt-1 rounded-lg bg-brand-50 p-2 text-brand-800">
                    <span className="font-semibold">
                      {members.length} driver{members.length === 1 ? '' : 's'} already listed under this TODA:{' '}
                    </span>
                    {members.map((d) => d.name).join(', ')}
                  </p>
                )
              })()}

              {org.registrationNote && (
                <p className="mt-2 rounded-lg bg-amber-50 p-2 text-amber-800">
                  <span className="font-semibold">Note sent to applicant: </span>
                  {org.registrationNote}
                </p>
              )}
              {org.registrationNoteDeadline &&
                (isPastDeadline(org.registrationNoteDeadline) ? (
                  <p className="mt-2 rounded-lg bg-amber-50 p-2 font-medium text-amber-800">
                    Deadline passed on {new Date(org.registrationNoteDeadline).toLocaleDateString()} — requirements
                    were not submitted. Reject this application or set a new deadline below.
                  </p>
                ) : (
                  <p className="mt-2 rounded-lg bg-slate-50 p-2 text-slate-500">
                    Resubmission deadline: {new Date(org.registrationNoteDeadline).toLocaleDateString()}
                  </p>
                ))}

              <textarea
                value={todaNoteDrafts[org.id] ?? org.registrationNote ?? ''}
                onChange={(e) => setTodaNoteDrafts((prev) => ({ ...prev, [org.id]: e.target.value }))}
                placeholder="Optional note to the applicant — e.g. what's missing or needs fixing"
                rows={2}
                className="mt-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
              />
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={todaDeadlineDrafts[org.id] ?? ''}
                  onChange={(e) => setTodaDeadlineDrafts((prev) => ({ ...prev, [org.id]: e.target.value }))}
                  placeholder="Days to resubmit"
                  className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                />
                <span className="text-[11px] text-slate-400">deadline for "Approve as noted" below</span>
              </div>

              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => handleApproveTodaOrg(org.id, org.name)}
                  className="flex-1 rounded-lg bg-brand-600 py-1.5 font-semibold text-white hover:bg-brand-700"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleApproveTodaOrgAsNoted(org.id, org.name)}
                  className="flex-1 rounded-lg border border-amber-300 bg-amber-50 py-1.5 font-medium text-amber-700 hover:bg-amber-100"
                >
                  Approve as noted
                </button>
                <button
                  onClick={() => handleRejectTodaOrg(org.id, org.name)}
                  className="flex-1 rounded-lg border border-slate-300 py-1.5 font-medium text-slate-600 hover:bg-slate-50"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </AdminCollapsible>

      </>
      )}

      {adminTab === 'terminals' && (
      <>
      <AdminCollapsible title="Terminal Pila (top 10 each)">
        <div className="space-y-2">
          {todaOrganizations
            .filter((org) => org.verificationStatus === 'approved')
            .map((org) => {
            const queue = getTodaQueue(org.id, drivers)
            return (
              <div key={org.id} className="rounded-lg border border-slate-200 p-2.5 text-xs">
                <p className="font-medium text-slate-700">{org.name}</p>
                {queue.length === 0 ? (
                  <p className="mt-0.5 text-slate-400">No drivers currently in the Pila.</p>
                ) : (
                  <p className="mt-0.5 text-slate-500">
                    {queue
                      .slice(0, 10)
                      .map((d, i) => `${i + 1}. ${d.name}`)
                      .join(' · ')}
                    {queue.length > 10 && ` · +${queue.length - 10} more`}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </AdminCollapsible>

      </>
      )}

      {adminTab === 'todas' && (
      <>
      <AdminCollapsible
        title={`TODA commission approvals — ${
          todaOrganizations.filter((o) => o.proposedCommissionPerRide !== null).length
        } proposed`}
        defaultOpen={todaOrganizations.some((o) => o.proposedCommissionPerRide !== null)}
      >
        <p className="mb-3 text-xs text-slate-500">
          A TODA's own per-ride commission only takes effect once both its members and you have signed off.
        </p>
        <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
          {todaOrganizations
            .filter((o) => o.proposedCommissionPerRide !== null)
            .map((org) => (
              <div key={org.id} className="rounded-lg border border-slate-200 p-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">{org.name}</span>
                  <span className="font-semibold text-slate-800">₱{org.proposedCommissionPerRide} / ride</span>
                </div>
                <p className="mt-1 text-slate-500">
                  Members: {org.commissionApprovedByMembers ? '✓ approved' : 'not yet approved'}
                </p>
                <button
                  onClick={() => setTodaCommissionAdminApproval(org.id, !org.commissionApprovedByAdmin)}
                  className={`mt-2 w-full rounded-lg py-1.5 text-xs font-semibold ${
                    org.commissionApprovedByAdmin
                      ? 'border border-slate-300 text-slate-600 hover:bg-slate-50'
                      : 'bg-brand-600 text-white hover:bg-brand-700'
                  }`}
                >
                  {org.commissionApprovedByAdmin ? 'Withdraw approval' : 'Approve commission'}
                </button>
              </div>
            ))}
          {todaOrganizations.every((o) => o.proposedCommissionPerRide === null) && (
            <p className="text-sm text-slate-400">No TODA has proposed a commission yet.</p>
          )}
        </div>
      </AdminCollapsible>

      </>
      )}

      {adminTab === 'partners' && (
      <>
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">Partner Applications</h2>
        <p className="mb-3 text-xs text-slate-500">
          Share a direct application link with a prospective Operator or Franchisee — it opens straight to the
          sign-up form instead of the login form. Once approved, the same account logs in from that org's own
          portal (<code className="text-[11px]">/operator</code> or <code className="text-[11px]">/franchise</code>).
        </p>

        <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setTaasTab('operator')}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
              taasTab === 'operator' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500'
            }`}
          >
            Operators (Level 2)
          </button>
          <button
            type="button"
            onClick={() => setTaasTab('franchise')}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
              taasTab === 'franchise' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500'
            }`}
          >
            Franchises (Level 3)
          </button>
        </div>

        {taasTab === 'operator' && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="mb-1 text-xs font-medium text-slate-600">Operator application link</p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={operatorApplyLink}
                  onFocus={(e) => e.target.select()}
                  className="w-full truncate rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={() => handleCopyLink(operatorApplyLink, 'operator')}
                  className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                >
                  {copiedLink === 'operator' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Send this to a prospective TODA cooperative or organization — it opens straight to the Operator
                sign-up form.
              </p>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-700">Pending applications</h3>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                  {operators.filter((o) => o.verificationStatus === 'pending').length} pending
                </span>
              </div>
              <p className="mb-2 text-[11px] text-slate-500">
                Set the activation fee and monthly/per-booking fees before approving — these become the Operator's
                billing plan immediately on approval.
              </p>
              {operators.filter((o) => o.verificationStatus === 'pending').length === 0 && (
                <p className="text-sm text-slate-400">No pending Operator applications.</p>
              )}
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {operators
                  .filter((o) => o.verificationStatus === 'pending')
                  .map((operator) => (
                    <div key={operator.id} className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
                      <p className="font-medium text-slate-700">{operator.name}</p>
                      <p className="mt-1 text-slate-500">
                        {operator.contactPerson} · {operator.contactPhone}
                      </p>
                      <p className="mt-1 text-slate-500">
                        {operator.city}, {operator.province}
                      </p>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <div>
                          <label className="mb-1 block text-[11px] text-slate-500">Activation ₱</label>
                          <input
                            type="number"
                            min={0}
                            value={operatorFeeDrafts[operator.id]?.activation ?? ''}
                            onChange={(e) =>
                              setOperatorFeeDrafts((prev) => ({
                                ...prev,
                                [operator.id]: { activation: e.target.value, monthly: prev[operator.id]?.monthly ?? '', perBooking: prev[operator.id]?.perBooking ?? '' },
                              }))
                            }
                            placeholder="e.g. 45000"
                            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-slate-500">Monthly ₱</label>
                          <input
                            type="number"
                            min={0}
                            value={operatorFeeDrafts[operator.id]?.monthly ?? ''}
                            onChange={(e) =>
                              setOperatorFeeDrafts((prev) => ({
                                ...prev,
                                [operator.id]: { activation: prev[operator.id]?.activation ?? '', monthly: e.target.value, perBooking: prev[operator.id]?.perBooking ?? '' },
                              }))
                            }
                            placeholder="e.g. 8000"
                            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-slate-500">₱/booking</label>
                          <input
                            type="number"
                            min={0}
                            value={operatorFeeDrafts[operator.id]?.perBooking ?? ''}
                            onChange={(e) =>
                              setOperatorFeeDrafts((prev) => ({
                                ...prev,
                                [operator.id]: { activation: prev[operator.id]?.activation ?? '', monthly: prev[operator.id]?.monthly ?? '', perBooking: e.target.value },
                              }))
                            }
                            placeholder="optional"
                            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                          />
                        </div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => handleApproveOperator(operator.id, operator.name)}
                          className="flex-1 rounded-lg bg-brand-600 py-1.5 font-semibold text-white hover:bg-brand-700"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleRejectOperator(operator.id, operator.name)}
                          className="flex-1 rounded-lg border border-slate-300 py-1.5 font-medium text-slate-600 hover:bg-slate-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold text-slate-700">All Operators — status</h3>
              <div className="max-h-[300px] space-y-1.5 overflow-y-auto pr-1">
                {operators.length === 0 && <p className="text-sm text-slate-400">No Operators have applied yet.</p>}
                {operators.map((operator) => (
                  <div key={operator.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2 text-xs">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-700">{operator.name}</p>
                      <p className="truncate text-[11px] text-slate-400">{operator.city}, {operator.province}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${TAAS_STATUS_STYLES[operator.verificationStatus]}`}>
                      {operator.verificationStatus}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {taasTab === 'franchise' && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="mb-1 text-xs font-medium text-slate-600">Franchise application link</p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={franchiseApplyLink}
                  onFocus={(e) => e.target.select()}
                  className="w-full truncate rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={() => handleCopyLink(franchiseApplyLink, 'franchise')}
                  className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                >
                  {copiedLink === 'franchise' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Send this to a prospective transportation entrepreneur or investor — it opens straight to the
                Franchise sign-up form.
              </p>
              {!originShareable && <ShareLinkNotice origin={publicOrigin} canFix />}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-700">Pending applications</h3>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                  {franchises.filter((f) => f.verificationStatus === 'pending').length} pending
                </span>
              </div>
              <p className="mb-2 text-[11px] text-slate-500">
                Set the initial franchise fee, monthly technology fee, and optional royalty share before approving.
              </p>
              {franchises.filter((f) => f.verificationStatus === 'pending').length === 0 && (
                <p className="text-sm text-slate-400">No pending Franchise applications.</p>
              )}
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {franchises
                  .filter((f) => f.verificationStatus === 'pending')
                  .map((franchise) => (
                    <div key={franchise.id} className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
                      <p className="font-medium text-slate-700">{franchise.name}</p>
                      <p className="mt-1 text-slate-500">
                        {franchise.contactPerson} · {franchise.contactPhone}
                      </p>
                      <p className="mt-1 text-slate-500">
                        {franchise.city}, {franchise.province}
                      </p>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <div>
                          <label className="mb-1 block text-[11px] text-slate-500">Franchise fee ₱</label>
                          <input
                            type="number"
                            min={0}
                            value={franchiseFeeDrafts[franchise.id]?.initial ?? ''}
                            onChange={(e) =>
                              setFranchiseFeeDrafts((prev) => ({
                                ...prev,
                                [franchise.id]: {
                                  initial: e.target.value,
                                  monthly: prev[franchise.id]?.monthly ?? '',
                                  royalty: prev[franchise.id]?.royalty ?? '',
                                },
                              }))
                            }
                            placeholder="e.g. 150000"
                            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-slate-500">Monthly ₱</label>
                          <input
                            type="number"
                            min={0}
                            value={franchiseFeeDrafts[franchise.id]?.monthly ?? ''}
                            onChange={(e) =>
                              setFranchiseFeeDrafts((prev) => ({
                                ...prev,
                                [franchise.id]: {
                                  initial: prev[franchise.id]?.initial ?? '',
                                  monthly: e.target.value,
                                  royalty: prev[franchise.id]?.royalty ?? '',
                                },
                              }))
                            }
                            placeholder="e.g. 10000"
                            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-slate-500">Royalty %</label>
                          <input
                            type="number"
                            min={0}
                            value={franchiseFeeDrafts[franchise.id]?.royalty ?? ''}
                            onChange={(e) =>
                              setFranchiseFeeDrafts((prev) => ({
                                ...prev,
                                [franchise.id]: {
                                  initial: prev[franchise.id]?.initial ?? '',
                                  monthly: prev[franchise.id]?.monthly ?? '',
                                  royalty: e.target.value,
                                },
                              }))
                            }
                            placeholder="optional"
                            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                          />
                        </div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => handleApproveFranchise(franchise.id, franchise.name)}
                          className="flex-1 rounded-lg bg-brand-600 py-1.5 font-semibold text-white hover:bg-brand-700"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleRejectFranchise(franchise.id, franchise.name)}
                          className="flex-1 rounded-lg border border-slate-300 py-1.5 font-medium text-slate-600 hover:bg-slate-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div>
              <h3 className="mb-1 text-xs font-semibold text-slate-700">Operators — assign to Franchise</h3>
              <p className="mb-2 text-[11px] text-slate-500">
                Which territory each approved Operator reports to. Unaffiliated Operators report directly to
                TODA Ride Mobility HQ.
              </p>
              <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
                {operators
                  .filter((o) => o.verificationStatus === 'approved')
                  .map((operator) => (
                    <div key={operator.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2.5 text-xs">
                      <span className="font-medium text-slate-700">{operator.name}</span>
                      <select
                        value={operator.franchiseId ?? ''}
                        onChange={(e) => handleSetOperatorFranchise(operator.id, operator.name, e.target.value || null)}
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                      >
                        <option value="">TODA Ride Mobility HQ (direct)</option>
                        {franchises
                          .filter((f) => f.verificationStatus === 'approved')
                          .map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  ))}
                {operators.every((o) => o.verificationStatus !== 'approved') && (
                  <p className="text-sm text-slate-400">No approved Operators yet.</p>
                )}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold text-slate-700">All Franchises — status</h3>
              <div className="max-h-[300px] space-y-1.5 overflow-y-auto pr-1">
                {franchises.length === 0 && <p className="text-sm text-slate-400">No Franchises have applied yet.</p>}
                {franchises.map((franchise) => (
                  <div key={franchise.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2 text-xs">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-700">{franchise.name}</p>
                      <p className="truncate text-[11px] text-slate-400">{franchise.city}, {franchise.province}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${TAAS_STATUS_STYLES[franchise.verificationStatus]}`}>
                      {franchise.verificationStatus}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">SaaS subscriptions (Level 1)</h2>
        <p className="mb-3 text-xs text-slate-500">
          Every TODA is a Level-1 "SaaS Partner" by default — set its pricing plan and (optionally) which Level-2
          Operator it reports to. This is a separate B2B billing relationship, not part of the per-ride commission
          above.
        </p>
        <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
          {todaOrganizations
            .filter((o) => o.verificationStatus === 'approved')
            .map((org) => (
              <div key={org.id} className="rounded-lg border border-slate-200 p-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">{org.name}</span>
                  <span className="text-slate-400">
                    ₱{org.monthlyPlatformFee}/mo{org.perBookingFee > 0 ? ` + ₱${org.perBookingFee}/booking` : ''}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <select
                    value={todaPlanDrafts[org.id] ?? org.saasPlan}
                    onChange={(e) => setTodaPlanDrafts((prev) => ({ ...prev, [org.id]: e.target.value as SaasPlan }))}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                  >
                    <option value="starter">Starter (₱{SAAS_PLAN_FEES.starter}/mo)</option>
                    <option value="standard">Standard (₱{SAAS_PLAN_FEES.standard}/mo)</option>
                    <option value="premium">Premium (₱{SAAS_PLAN_FEES.premium}/mo)</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    value={todaPerBookingDrafts[org.id] ?? String(org.perBookingFee)}
                    onChange={(e) => setTodaPerBookingDrafts((prev) => ({ ...prev, [org.id]: e.target.value }))}
                    placeholder="₱/booking"
                    className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                  />
                  <button
                    onClick={() => handleSaveTodaPlan(org.id, org.name)}
                    className="ml-auto rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                  >
                    Save
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-slate-500">Reports to</span>
                  <select
                    value={org.operatorId ?? ''}
                    onChange={(e) => handleSetTodaOperator(org.id, org.name, e.target.value || null)}
                    className="ml-auto rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                  >
                    <option value="">TODA Ride Mobility HQ (direct)</option>
                    {operators
                      .filter((o) => o.verificationStatus === 'approved')
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            ))}
          {todaOrganizations.every((o) => o.verificationStatus !== 'approved') && (
            <p className="text-sm text-slate-400">No approved TODAs yet.</p>
          )}
        </div>
      </section>
      </>
      )}

      {adminTab === 'settings' && (
      <>
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">Dues grace period</h2>
        <p className="mb-3 text-xs text-slate-500">
          How many days an unpaid dues charge can go overdue before a driver is flagged as eligible to have their
          access paused in the driver directory below.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={graceDaysInput}
            onChange={(e) => setGraceDaysInput(e.target.value)}
            className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
          <span className="text-xs text-slate-500">days</span>
          <button
            onClick={handleSaveGraceDays}
            className="ml-auto rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            Save
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">Current: {duesGracePeriodDays} day(s)</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">Trip history retention</h2>
        <p className="mb-3 text-xs text-slate-500">
          How many days back the "Trip history" list shows on the Passenger and Driver apps. Older rides aren't
          deleted — they still count toward earnings and admin reports — they just drop out of that list.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={tripHistoryDaysInput}
            onChange={(e) => setTripHistoryDaysInput(e.target.value)}
            className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
          <span className="text-xs text-slate-500">days</span>
          <button
            onClick={handleSaveTripHistoryDays}
            className="ml-auto rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            Save
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">Current: {tripHistoryRetentionDays} day(s)</p>
      </section>
      </>
      )}

      {adminTab === 'terminals' && (
      <>
      <AdminCollapsible title="Terminals">
        <p className="mb-3 text-xs text-slate-500">
          Where drivers wait and passengers are picked up. Drag a 🚏 pin to exactly where the gate is — a position
          placed by someone who knows the place beats a coordinate typed from memory, and it is what dispatch and the
          out-of-area fare are measured from.
        </p>
        <div className="mb-3 space-y-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-600">Add a terminal</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={newTerminal.id}
              onChange={(e) => setNewTerminal((t) => ({ ...t, id: e.target.value }))}
              placeholder="Terminal ID (e.g. CLSU-04)"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
            />
            <input
              value={newTerminal.name}
              onChange={(e) => setNewTerminal((t) => ({ ...t, name: e.target.value }))}
              placeholder="Terminal name"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
            />
            <select
              value={newTerminal.type}
              onChange={(e) => setNewTerminal((t) => ({ ...t, type: e.target.value as TerminalType }))}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
            >
              {(Object.keys(TERMINAL_TYPE_LABELS) as TerminalType[]).map((type) => (
                <option key={type} value={type}>
                  {TERMINAL_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            <select
              value={newTerminal.orgId || todaOrganizations[0]?.id || ""}
              onChange={(e) => setNewTerminal((t) => ({ ...t, orgId: e.target.value }))}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
            >
              {todaOrganizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <BarangayAddressPicker
              key={`terminal-place-${terminals.length}`}
              label="Where is it?"
              defaultProvince={DEFAULT_BOOKING_PROVINCE}
              defaultCity={DEFAULT_BOOKING_CITY}
              onResolve={handleTerminalAddressResolve}
            />
            <p className="mt-1 text-[11px] text-slate-500">
              {placingTerminal
                ? "Finding that place…"
                : newTerminalPlace
                  ? `📍 ${newTerminalPlace.label}`
                  : "Pick a city and barangay — the map jumps there and the new pin lands on it."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAddTerminal}
              disabled={!newTerminal.id.trim() || !newTerminal.name.trim()}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
            >
              Add terminal
            </button>
            {terminals.some((t) => t.id.toLowerCase() === newTerminal.id.trim().toLowerCase()) && (
              <span className="text-[11px] text-amber-700">That terminal ID is already taken.</span>
            )}
            <span className="ml-auto text-[11px] text-slate-400">It appears on the map — drag it to the exact spot.</span>
          </div>
        </div>

        {terminals.length === 0 ? (
          <p className="text-xs text-slate-400">No terminals yet.</p>
        ) : (
          <div className="space-y-2">
            <RealLiveMap
              points={[
                ...terminals
                  .filter((t) => t.gps)
                  .map((t) => ({
                    id: t.id,
                    gps: t.gps!,
                    color: t.isActive ? "#1d4ed8" : "#94a3b8",
                    label: `${t.id} — ${t.name}`,
                    icon: "terminal" as const,
                  })),
                // The place chosen in the form, before it is a terminal —
                // so you can see where it will land before committing.
                ...(newTerminalPlace
                  ? [{
                      id: "pending-terminal",
                      gps: newTerminalPlace.gps,
                      color: "#16a34a",
                      label: `New terminal here — ${newTerminalPlace.label}`,
                      icon: "terminal" as const,
                    }]
                  : []),
              ]}
              draggableIds={terminals.filter((t) => t.isActive).map((t) => t.id)}
              onPointDragEnd={handleTerminalMoved}
              refitSignal={newTerminalPlace?.id ?? "none"}
              hideLegend
            />
            {terminals.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-slate-700">
                    🚏 {t.id} — {t.name}
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    {TERMINAL_TYPE_LABELS[t.type]} ·{" "}
                    {t.gps ? `${t.gps.lat.toFixed(5)}, ${t.gps.lng.toFixed(5)}` : "position not set"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setTerminalActive(t.id, !t.isActive)}
                  className={`shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                    t.isActive
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {t.isActive ? "Active" : "Inactive"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    removeTerminal(t.id)
                    logAdmin("Removed terminal", `${t.id} — ${t.name}.`)
                  }}
                  aria-label={`Remove ${t.id}`}
                  className="shrink-0 rounded-lg border border-amber-200 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-50"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </AdminCollapsible>
      </>
      )}

      {adminTab === 'todas' && (
      <AdminCollapsible
        title={`TODA hold/terminate requests — ${pendingMembershipRequests.length} pending`}
        defaultOpen={pendingMembershipRequests.length > 0}
      >
        {pendingMembershipRequests.length === 0 && (
          <p className="text-sm text-slate-400">No pending requests from any TODA.</p>
        )}
        <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
          {pendingMembershipRequests.map((r) => {
            const driver = drivers.find((d) => d.id === r.driverId)
            const org = todaOrganizations.find((o) => o.id === r.todaOrgId)
            return (
              <div key={r.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
                <p className="font-medium text-slate-700">
                  {org?.name ?? 'TODA'} requests to {r.requestType === 'terminate' ? 'terminate' : 'hold'}{' '}
                  {driver?.name ?? 'a member'}
                </p>
                <p className="mt-1 text-slate-600">{r.reason}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => resolveMembershipRequest(r.id, true)}
                    className="flex-1 rounded-lg bg-amber-700 py-1.5 font-semibold text-white hover:bg-amber-800"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => resolveMembershipRequest(r.id, false)}
                    className="flex-1 rounded-lg border border-slate-300 py-1.5 font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </AdminCollapsible>
      )}

      {adminTab === 'rides' && (
      <>
      {/* Top of the tab and loud when live — an SOS outranks every other
          thing on this screen, and it shouldn't need scrolling to find. */}
      <section
        className={`rounded-xl border p-4 shadow-sm ${
          openAlerts.length > 0 ? 'animate-pulse border-danger-600 bg-danger-700' : 'border-slate-200 bg-white'
        }`}
      >
        <div className="flex items-center justify-between">
          <h2 className={`text-sm font-semibold ${openAlerts.length > 0 ? 'text-white' : 'text-slate-700'}`}>
            🆘 SOS alert status
          </h2>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              openAlerts.length > 0 ? 'bg-white text-danger-800' : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {openAlerts.length > 0 ? `${openAlerts.length} ACTIVE` : 'All clear'}
          </span>
        </div>
        {openAlerts.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">
            No open SOS right now. {resolvedAlerts.length} resolved to date — the full incident feed is further down.
          </p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {openAlerts.map((a) => {
              const ride = a.rideId ? rides.find((r) => r.id === a.rideId) : null
              const driver = drivers.find((d) => d.id === a.triggeredBy)
              const who = a.triggeredByRole === 'driver' ? (driver?.name ?? 'A driver') : (ride?.passengerName ?? 'A passenger')
              const phone = a.triggeredByRole === 'driver' ? driver?.phone : (ride?.passengerPhone ?? a.guardianNotifiedPhone)
              return (
                <div key={a.id} className="rounded-lg bg-white p-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-danger-800">
                        {who} · {a.triggeredByRole === 'driver' ? 'Driver SOS' : 'Passenger SOS'}
                      </p>
                      <p className="mt-0.5 text-slate-500">
                        {new Date(a.createdAt).toLocaleString()}
                        {ride ? ` · ${formatTripRoute(ride.pickup.label, ride.dropoff.label, 2)}` : ' · no active trip'}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {phone && (
                        <a
                          href={`tel:${phone}`}
                          className="rounded-lg bg-danger-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-danger-800"
                        >
                          Call
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => resolveAlert(a.id)}
                        className="rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Resolve
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <HotlineManager />

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Pending requests</h2>
          <span className="rounded-full bg-danger-100 px-2 py-0.5 text-xs font-medium text-danger-800">
            {pendingRequests.length} waiting
          </span>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Ride and Pabili requests nobody has accepted yet — invisible everywhere else in Admin, so this is where to
          spot one that's been sitting too long.
        </p>
        {pendingRequests.length === 0 && <p className="text-sm text-slate-400">No pending requests right now.</p>}
        <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
          {pendingRequests.map((r) => {
            const { openToAll } = getDispatchWindow(r, todaQueueWindowMs, specialPickupEscalationMs)
            const priorityOrg = r.priorityTodaOrgId ? todaOrganizations.find((o) => o.id === r.priorityTodaOrgId) : null
            const offeredDriver = r.priorityQueueOfferedDriverId
              ? drivers.find((d) => d.id === r.priorityQueueOfferedDriverId)
              : null
            const waitingMinutes = Math.floor((Date.now() - new Date(r.requestedAt).getTime()) / 60000)
            return (
              <div key={r.id} className="rounded-lg border border-slate-200 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">
                    {rideServiceTag(r) ? `${rideServiceTag(r)!.icon} ` : ''}
                    {r.passengerName}
                  </span>
                  <span className="text-slate-400">{waitingMinutes <= 0 ? 'just now' : `${waitingMinutes}m ago`}</span>
                </div>
                <p className="mt-1 text-slate-500">
                  {formatTripRoute(r.pickup.label, r.dropoff.label)}
                </p>
                {r.specialPickupRequested && (
                  <p className="mt-1 rounded-lg bg-amber-50 p-2 font-medium text-amber-700">
                    📍 Special pickup — pick up at exact GPS, not the Terminal (+₱{r.specialPickupFee})
                  </p>
                )}
                {r.tipOffer > 0 && (
                  <p className="mt-1 rounded-lg bg-emerald-50 p-2 font-medium text-emerald-700">
                    💸 Passenger raised the tip offer to ₱{r.tipOffer} to attract a driver
                  </p>
                )}
                {(r.serviceType === 'pabili' || r.serviceType === 'buy_medicine') && r.pabiliItems && (
                  <p className="mt-1 rounded-lg bg-slate-50 p-2 text-slate-600">🛒 {r.pabiliItems}</p>
                )}
                {r.serviceType === 'padala' && r.packageNote && (
                  <p className="mt-1 rounded-lg bg-slate-50 p-2 text-slate-600">📦 {r.packageNote}</p>
                )}
                <p className="mt-1.5 font-medium text-slate-600">
                  {openToAll
                    ? '✓ Open to all TODAs'
                    : offeredDriver
                      ? `Waiting on ${offeredDriver.name}${priorityOrg ? ` (${priorityOrg.name})` : ''}`
                      : `Waiting on ${priorityOrg?.name ?? 'priority TODA'}`}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Live map — active rides</h2>
        {activeRides.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-400">
            No rides in progress right now.
          </div>
        ) : (
          <AdminLiveMap
            markers={activeRides.map((r) => ({
              id: r.id,
              label: r.driverName ?? 'Driver',
              position: r.driverPosition!,
              flagged: r.routeAlert,
            }))}
          />
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Incident feed</h2>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            {openAlerts.length} open
          </span>
        </div>

        {alerts.length === 0 && <p className="text-sm text-slate-400">No incidents reported.</p>}

        <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
          {openAlerts.map((a) => (
            <div key={a.id} className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-xs">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold text-danger-800">{alertLabel(a)}</span>
                <span className="text-danger-500">{new Date(a.createdAt).toLocaleTimeString()}</span>
              </div>
              <p className="mb-2 text-slate-600">{a.notes}</p>
              <button
                onClick={() => {
                  resolveAlert(a.id)
                  logAdmin('Resolved incident', `Marked ${alertLabel(a)} alert resolved — "${a.notes}".`)
                }}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
              >
                Mark resolved
              </button>
            </div>
          ))}

          {resolvedAlerts.map((a) => (
            <div key={a.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs opacity-70">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold text-slate-600">{alertLabel(a)} · Resolved</span>
                <span className="text-slate-400">{new Date(a.createdAt).toLocaleTimeString()}</span>
              </div>
              <p className="text-slate-500">{a.notes}</p>
            </div>
          ))}
        </div>
      </section>
      </>
      )}

      {adminTab === 'drivers' && (
      <>
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Driver reports</h2>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            {openReports.length} open
          </span>
        </div>

        {driverReports.length === 0 && <p className="text-sm text-slate-400">No reports filed.</p>}

        <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
          {openReports.map((r) => (
            <div key={r.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold text-amber-800">
                  {r.driverName} · {DRIVER_REPORT_REASON_LABELS[r.reason]}
                </span>
                <span className="text-amber-500">{new Date(r.createdAt).toLocaleTimeString()}</span>
              </div>
              <p className="mb-1 text-slate-500">Reported by {r.passengerName}</p>
              {r.details && <p className="mb-2 text-slate-600">{r.details}</p>}
              <button
                onClick={() => {
                  resolveDriverReport(r.id)
                  logAdmin(
                    'Reviewed driver report',
                    `Marked report against ${r.driverName} (${DRIVER_REPORT_REASON_LABELS[r.reason]}) reviewed.`,
                  )
                }}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
              >
                Mark reviewed
              </button>
            </div>
          ))}

          {reviewedReports.map((r) => (
            <div key={r.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs opacity-70">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold text-slate-600">
                  {r.driverName} · {DRIVER_REPORT_REASON_LABELS[r.reason]} · Reviewed
                </span>
                <span className="text-slate-400">{new Date(r.createdAt).toLocaleTimeString()}</span>
              </div>
              <p className="text-slate-500">Reported by {r.passengerName}</p>
              {r.details && <p className="text-slate-500">{r.details}</p>}
            </div>
          ))}
        </div>
      </section>

      <AdminDriverQueue />

      <AdminDriverDirectory />
      </>
      )}

      {adminTab === 'settings' && <BannerAdManager />}

      {adminTab === 'fees' && (
      <>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">LGU tariff rate</h2>
        {/* A taripa belongs to a city, not to the app. Munoz and San Jose
            publish different ones and both are correct, and a TODA may have
            been granted its own inside a city. One picker, one subject: the
            fields below always belong to whatever is named here. */}
        <label className="mb-2 block">
          <span className="mb-1 block text-xs font-medium text-slate-500">This taripa applies to</span>
          <select
            value={tariffScope}
            onChange={(e) => loadTariffInto(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="default">All cities — platform default</option>
            <optgroup label="City">
              {getCitiesForProvince(DEFAULT_BOOKING_PROVINCE).map((c) => (
                <option key={c} value={`city:${c}`}>
                  {c}{cityTariffs[c] ? ' — own taripa' : ''}
                </option>
              ))}
            </optgroup>
            <optgroup label="TODA">
              {todaOrganizations.map((o) => (
                <option key={o.id} value={`toda:${o.id}`}>
                  {o.name}{todaTariffs[o.id] ? ' — own taripa' : ''}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        {tariffScope !== 'default' && (
          <p className="mb-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">
            {scopeHasOwn
              ? `${tariffScopeLabel} has its own taripa. Saving changes it here only.`
              : `${tariffScopeLabel} currently follows the schedule above it. Saving gives it one of its own.`}
            {scopeHasOwn && (
              <button
                type="button"
                onClick={handleUseDefaultTariff}
                className="ml-2 font-semibold text-brand-700 underline"
              >
                Use the default instead
              </button>
            )}
          </p>
        )}
        <p className="mb-3 text-xs text-slate-500">
          Standard LGU-style tricycle fare: a flat base rate (student, PWD/Senior, or standard) covers the first
          few kilometers, then a per-km rate applies beyond that, plus a flat surcharge per rider when 2 or more
          book together. Fare is computed from the real distance between pickup and destination.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Standard rate</span>
            <div className="flex items-center gap-1">
              <span className="text-sm text-slate-500">₱</span>
              <input
                type="number"
                min={0}
                value={standardRateInput}
                onChange={(e) => setStandardRateInput(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Student rate</span>
            <div className="flex items-center gap-1">
              <span className="text-sm text-slate-500">₱</span>
              <input
                type="number"
                min={0}
                value={studentRateInput}
                onChange={(e) => setStudentRateInput(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">PWD/Senior rate</span>
            <div className="flex items-center gap-1">
              <span className="text-sm text-slate-500">₱</span>
              <input
                type="number"
                min={0}
                value={pwdSeniorRateInput}
                onChange={(e) => setPwdSeniorRateInput(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Additional cost per km</span>
            <div className="flex items-center gap-1">
              <span className="text-sm text-slate-500">₱</span>
              <input
                type="number"
                min={0}
                value={perKmRateInput}
                onChange={(e) => setPerKmRateInput(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Standard km covered</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                value={standardKmInput}
                onChange={(e) => setStandardKmInput(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
              <span className="text-xs text-slate-500">km</span>
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Extra fee per rider (2+)</span>
            <div className="flex items-center gap-1">
              <span className="text-sm text-slate-500">₱</span>
              <input
                type="number"
                min={0}
                value={extraPassengerFeeInput}
                onChange={(e) => setExtraPassengerFeeInput(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
          </label>
        </div>
        <label className="mb-1 mt-3 block">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Ride-sharing group discount (2-4 passengers, standard fare only)
          </span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={100}
              value={groupDiscountInput}
              onChange={(e) => setGroupDiscountInput(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
            <span className="text-sm text-slate-500">%</span>
          </div>
        </label>
        {/* Two ways to price a group, because a percentage is a way of
            deriving a fare and a derived fare can disagree with the one
            printed on the tricycle. Where the LGU or TODA has published
            actual figures, an operator should be able to type them. */}
        <div className="flex flex-wrap items-center gap-2">
          {([['percent', 'Discount %'], ['flat', 'Set fare per group size']] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setGroupFareMode(mode)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                groupFareMode === mode
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {groupFareMode === 'flat' && (
          <div className="grid grid-cols-3 gap-3">
            {([
              ['2 passengers', groupFlat2Input, setGroupFlat2Input],
              ['3 passengers', groupFlat3Input, setGroupFlat3Input],
              ['4 passengers', groupFlat4Input, setGroupFlat4Input],
            ] as const).map(([label, value, setValue]) => (
              <label key={label} className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-slate-500">₱</span>
                  <input
                    type="number"
                    min={0}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
              </label>
            ))}
          </div>
        )}

        {(() => {
          const previewStandardRate = Number(standardRateInput)
          const previewDiscount = Number(groupDiscountInput)
          const validPreview = Number.isFinite(previewStandardRate) && Number.isFinite(previewDiscount)
          const flatFor = (count: number) =>
            Number(count === 2 ? groupFlat2Input : count === 3 ? groupFlat3Input : groupFlat4Input)
          // Mirrors groupFare() in data.ts, including the rule that an unset
          // flat rate falls back to the percentage rather than to nothing.
          const groupPrice = (count: number) => {
            if (groupFareMode === 'flat' && flatFor(count) > 0) return Math.round(flatFor(count))
            return validPreview ? Math.round(previewStandardRate * count * (1 - previewDiscount / 100)) : '—'
          }
          return (
            <div className="grid grid-cols-3 gap-3 rounded-lg bg-slate-50 p-2 text-center text-xs text-slate-500">
              <div>
                2 passengers
                <div className="font-semibold text-slate-700">₱{groupPrice(2)}</div>
              </div>
              <div>
                3 passengers
                <div className="font-semibold text-slate-700">₱{groupPrice(3)}</div>
              </div>
              <div>
                4 passengers
                <div className="font-semibold text-slate-700">₱{groupPrice(4)}</div>
              </div>
            </div>
          )
        })()}
        {tariffError && <p className="mt-2 text-xs font-medium text-amber-700">{tariffError}</p>}
        <button
          onClick={handleSaveTariff}
          className="mt-3 w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700"
        >
          Save tariff
        </button>
        <p className="mt-2 text-xs text-slate-400">
          Current: ₱{tariffSettings.standardRate} standard / ₱{tariffSettings.studentRate} student / ₱
          {tariffSettings.pwdSeniorRate} PWD-Senior, covering the first {tariffSettings.standardKmCovered}km, then
          ₱{tariffSettings.perKmRate}/km after that, +₱{tariffSettings.extraPassengerFee} per rider beyond the
          first. Standard group rides get {tariffSettings.groupRideDiscountPct}% off standardRate×passengers.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">TODA area &amp; out-of-area fare</h2>
        <p className="mb-3 text-xs text-slate-500">
          How far from its terminal a TODA still counts as working its own area, and what a driver starting further
          out adds to the fare. The driver is shown this before they accept, and the passenger has to agree to the new
          total before the ride is assigned — so neither side meets it for the first time at the kerb.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={0}
            step={0.5}
            value={radiusInput}
            onChange={(e) => setRadiusInput(e.target.value)}
            className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
          <span className="text-xs text-slate-500">km area radius</span>
          <span className="text-sm text-slate-500">·</span>
          <span className="text-sm text-slate-500">₱</span>
          <input
            type="number"
            min={0}
            value={outOfAreaInput}
            onChange={(e) => setOutOfAreaInput(e.target.value)}
            className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
          <span className="text-xs text-slate-500">per km beyond it</span>
          <button
            onClick={handleSaveJurisdiction}
            className="ml-auto rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            Save
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Current: {todaRadiusKm} km area · ₱{outOfAreaPerKm}/km beyond it. A driver 5 km out adds ₱
          {Math.round(Math.max(0, 5 - todaRadiusKm) * outOfAreaPerKm)}.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">Pabili fare basis</h2>
        <p className="mb-3 text-xs text-slate-500">
          How the distance part of an errand is priced. The Pabili service fee below is added on top in every case —
          it pays for the driver's time, which no distance figure covers.
        </p>
        <div className="space-y-1.5">
          {(Object.keys(PABILI_FARE_MODE_LABELS) as PabiliFareMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => handlePabiliFareMode(mode)}
              className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
                pabiliFareMode === mode
                  ? 'border-brand-600 bg-brand-50 text-brand-900'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span aria-hidden className="mt-px shrink-0">{pabiliFareMode === mode ? '🔘' : '⚪'}</span>
              <span className="min-w-0">
                <span className="block font-semibold">{PABILI_FARE_MODE_LABELS[mode]}</span>
                <span className="block text-[11px] text-slate-500">
                  {mode === 'standard'
                    ? 'Charged like an ordinary ride. The nearby TODA that takes the booking is already by the store, so no return leg is billed.'
                    : 'One agreed amount for any errand, whatever the distance. Simplest to quote at the kerb.'}
                </span>
              </span>
            </button>
          ))}
        </div>
        {pabiliFareMode === 'fixed' && (
          <div className="mt-3 flex items-center gap-2 border-t border-slate-200 pt-3">
            <span className="text-sm text-slate-500">₱</span>
            <input
              type="number"
              min={0}
              value={pabiliFixedFareInput}
              onChange={(e) => setPabiliFixedFareInput(e.target.value)}
              className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
            <span className="text-xs text-slate-500">flat, per errand</span>
            <button
              onClick={handleSavePabiliFixedFare}
              className="ml-auto rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
            >
              Save
            </button>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-400">
          A customer pays ₱
          {pabiliFareMode === 'fixed' ? pabiliFixedFare : '(distance fare)'} + ₱{pabiliServiceFee} service fee.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">Pabili service fee</h2>
        <p className="mb-3 text-xs text-slate-500">
          Flat charge added on top of the standard fare for a Pabili (errand/delivery) request — separate from the
          items themselves, which the passenger settles with the driver directly.
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">₱</span>
          <input
            type="number"
            min={0}
            value={pabiliFeeInput}
            onChange={(e) => setPabiliFeeInput(e.target.value)}
            className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
          <span className="text-xs text-slate-500">per Pabili order</span>
          <button
            onClick={handleSavePabiliFee}
            className="ml-auto rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            Save
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">Current: ₱{pabiliServiceFee} per Pabili order</p>
      </section>
      </>
      )}

      {adminTab === 'checklist' && <PilotTestChecklist />}

      {adminTab === 'announce' && (
        <>
          <AnnouncementsManager />
          <SupportInbox />
          <ClientNotesCenter />
        </>
      )}

      <ActivityLogPanel
        title="Admin — Log History"
        entries={activityLog.filter((e) => e.actorRole === 'admin')}
        emptyMessage="No Admin changes logged yet."
      />
    </div>
  )
}

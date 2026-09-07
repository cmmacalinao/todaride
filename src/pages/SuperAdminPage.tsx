import { ArchitectureOverview } from '../components/ArchitectureOverview'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { useRides } from '../context/RideContext'
import { useAdminViewMode } from '../lib/adminViewMode'
import { TodaAdminPage } from './TodaAdminPage'
import { OperatorPortalPage } from './OperatorPortalPage'
import { FranchisePage } from './FranchisePage'
import { AnnouncementsManager } from '../components/AnnouncementsManager'
import { ClientNotesCenter } from '../components/ClientNotesCenter'
import { SupportInbox } from '../components/SupportInbox'
import { ActivityLogPanel } from '../components/ActivityLogPanel'
import { SosAlertBanner } from '../components/SosAlertBanner'

type SuperAdminTab =
  | 'hub'
  | 'links'
  | 'announce'
  | 'notes'
  | 'todas'
  | 'operators'
  | 'franchises'
  | 'architecture'

// Hub for the extra-gated admin areas (Accounting & Compliance, Income &
// Promotion) plus read-only oversight into any Level-1 TODA's, Level-2
// Operator's, or Level-3 Franchise's own dashboard — reuses
// TodaAdminPage/OperatorPortalPage/FranchisePage directly (passing
// orgId/operatorId/franchiseId overrides their normal session-based
// self-lookup and forces them into view-only mode) rather than duplicating
// those dashboards' layout here.
export function SuperAdminPage() {
  const {
    todaOrganizations,
    operators,
    franchises,
    pabiliEnabled,
    rewardsEnabled,
    setRewardsEnabled,
    medsEnabled,
    vendorsEnabled,
    commissionPerRide,
    setCommission,
    platformGcashAccount,
    setPlatformGcashAccount,
    terminalQrFeeWaived,
    setTerminalQrFeeWaived,
    simulatedOtpEnabled,
    simulateMovementEnabled,
    liveGpsEnabled,
    setLiveGpsEnabled,
    openDriverSignup,
    setOpenDriverSignup,
    documentGraceDays,
    setDocumentGraceDays,
    publicBaseUrl,
    pilotTodaName,
    setPilotTodaName,
    setPabiliEnabled,
    setMedsEnabled,
    setVendorsEnabled,
    setSimulatedOtpEnabled,
    setSimulateMovementEnabled,
    setPublicBaseUrl,
    activityLog,
  } = useRides()
  const [tab, setTab] = useState<SuperAdminTab>('hub')
  const { containerClass } = useAdminViewMode()
  const [commissionInput, setCommissionInput] = useState(String(commissionPerRide))
  const [gcashName, setGcashName] = useState(platformGcashAccount.accountName)
  const [gcashNumber, setGcashNumber] = useState(platformGcashAccount.accountNumber)
  const [scopedFranchiseId, setScopedFranchiseId] = useState(franchises[0]?.id ?? '')
  const [scopedOperatorId, setScopedOperatorId] = useState(operators[0]?.id ?? '')
  const [scopedTodaOrgId, setScopedTodaOrgId] = useState(todaOrganizations[0]?.id ?? '')
  // Everything in the Access links tab is built from this. The current
  // origin is only a sane default when the app is genuinely served from a
  // public host — see publicBaseUrl's comment in RideContext for why a dev
  // server and a native build both need the override.
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const origin = publicBaseUrl || currentOrigin
  const originIsShareable =
    /^https?:\/\//.test(origin) && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(origin)
  const [selectedTodaOrgId, setSelectedTodaOrgId] = useState(todaOrganizations[0]?.id ?? '')
  const [selectedOperatorId, setSelectedOperatorId] = useState(operators[0]?.id ?? '')
  const [selectedFranchiseId, setSelectedFranchiseId] = useState(franchises[0]?.id ?? '')

  return (
    <div className={`mx-auto ${containerClass} space-y-4 px-4 py-6`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-slate-700">Super Admin</h1>
          <p className="mt-1 text-xs text-slate-500">
            Extra-gated areas beyond day-to-day Admin operations, plus read-only oversight of any Level-1/2/3 TaaS
            partner's own dashboard.
          </p>
        </div>
      </div>

      <SosAlertBanner />

      {/* Wraps rather than squeezing — five tabs don't fit one phone-width
          row without truncating the level labels. */}
      <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
        {(
          [
            ['hub', 'Hub'],
            ['links', '🔗 Access links'],
            ['announce', '📣 Announcements'],
            ['notes', '✉️ Client notes'],
            ['todas', 'TODAs (Lvl 1)'],
            ['operators', 'Operators (Lvl 2)'],
            ['franchises', 'Franchises (Lvl 3)'],
            ['architecture', '🏗️ Architecture'],
          ] as [SuperAdminTab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium transition ${
              tab === value ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'architecture' && <ArchitectureOverview />}
      {tab === 'announce' && <AnnouncementsManager />}

      {tab === 'notes' && (
        <div className="space-y-4">
          <SupportInbox />
          <ClientNotesCenter />
        </div>
      )}

      {tab === 'hub' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/admin/accounting"
              className="rounded-xl border border-amber-300 bg-amber-50 p-3 shadow-sm transition hover:bg-amber-100"
            >
              <p className="text-xs font-semibold text-amber-800">🔒 Accounting &amp; Compliance</p>
              <p className="mt-0.5 text-[11px] text-amber-700">Restricted — finance officer login required</p>
            </Link>
            {rewardsEnabled && (
              <Link
                to="/admin/income-promotion"
                className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 shadow-sm transition hover:bg-emerald-100"
              >
                <p className="text-xs font-semibold text-emerald-800">💰 Income &amp; Promotion</p>
                <p className="mt-0.5 text-[11px] text-emerald-700">Revenue, campaigns, rewards &amp; ads</p>
              </Link>
            )}
          </div>

          <PilotTodaNamePanel value={pilotTodaName} onSave={setPilotTodaName} />

          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">Platform commission</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                What TODA SafeRide takes from each completed trip. Charged on the base fare only — never on a tip,
                and never more than the fare itself. Changing it applies to trips completed from now on; trips
                already recorded keep the rate they were charged at.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-500">₱</span>
              <input
                type="number"
                min={0}
                value={commissionInput}
                onChange={(e) => setCommissionInput(e.target.value)}
                className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
              <span className="text-xs text-slate-500">per ride</span>
              <button
                type="button"
                onClick={() => {
                  const amount = Number(commissionInput)
                  if (!Number.isFinite(amount) || amount < 0) return
                  setCommission(amount)
                }}
                className="ml-auto rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
              >
                Save
              </button>
            </div>
            <p className="text-xs text-slate-400">Current: ₱{commissionPerRide} per ride</p>

            <div className="border-t border-slate-100 pt-3">
              <FeatureToggleRow
                icon="🛺"
                label="Waive the fee on terminal QR rides"
                description="A passenger who scans the QR inside a tricycle at the terminal pays no platform fee — the app did not find them a driver, they walked up and got in. Switch off to charge the normal commission on those rides too."
                enabled={terminalQrFeeWaived}
                onChange={setTerminalQrFeeWaived}
              />
            </div>

            <div className="border-t border-slate-100 pt-3">
              <h3 className="text-xs font-semibold text-slate-700">Platform GCash account</h3>
              <p className="mb-2 mt-0.5 text-[11px] text-slate-500">
                Where drivers and TODAs settle what they owe. This is the name and number their Statement of
                Account tells them to send to, so it has to be the real one.
              </p>
              <div className="space-y-1.5">
                <input
                  value={gcashName}
                  onChange={(e) => setGcashName(e.target.value)}
                  placeholder="Account name"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
                <input
                  value={gcashNumber}
                  onChange={(e) => setGcashNumber(e.target.value)}
                  placeholder="09XXXXXXXXX"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!gcashName.trim() || !gcashNumber.trim()) return
                    setPlatformGcashAccount({
                      accountName: gcashName.trim(),
                      accountNumber: gcashNumber.trim(),
                      qrDataUrl: platformGcashAccount.qrDataUrl,
                    })
                  }}
                  className="w-full rounded-lg bg-brand-600 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                >
                  Save GCash account
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                Current: {platformGcashAccount.accountName} · {platformGcashAccount.accountNumber}
              </p>
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">Service availability</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Turn a service off to hide it everywhere in the app — booking options, menus and sign-up. Nothing is
                deleted: existing orders, pharmacy accounts and history stay intact and reappear when switched back on.
              </p>
            </div>
            <FeatureToggleRow
              icon="🛍️"
              label="Pabili"
              description="Ask a driver to buy something from a nearby store"
              enabled={pabiliEnabled}
              onChange={setPabiliEnabled}
            />
            <FeatureToggleRow
              icon="💊"
              label="Buy Medicine"
              description="Pharmacy ordering, prescriptions and pharmacy partner accounts"
              enabled={medsEnabled}
              onChange={setMedsEnabled}
            />
            <FeatureToggleRow
              icon="🎁"
              label="Rewards, promos & wallet"
              description="The passenger's Rewards tab and page, the drawer item, and the Income & Promotion tools. Off hides them on every page."
              enabled={rewardsEnabled}
              onChange={setRewardsEnabled}
            />
            <FeatureToggleRow
              icon="🍽️"
              label="Food & Vendor partners"
              description="Resto/Food and other-commodity partner sign-up and accounts — independent of Buy Medicine, so vendors can run without the pharmacy side."
              enabled={vendorsEnabled}
              onChange={setVendorsEnabled}
            />
          </section>

          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">Prototype shortcuts</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Testing conveniences that stand in for real infrastructure. Turn them off to exercise the genuine
                path instead.
              </p>
            </div>
            <FeatureToggleRow
              icon="🔐"
              label="Simulated OTP sending"
              description="Show the one-time code on screen instead of texting it. Off means a real code must come from the SMS server, and login fails if it isn't running."
              enabled={simulatedOtpEnabled}
              onChange={setSimulatedOtpEnabled}
            />
            <FeatureToggleRow
              icon="📝"
              label="Open driver signup"
              description="Let a driver register without uploading documents, and approve them on the spot. For pilot testing, where the driver is standing in front of you and nobody is staffing an approvals queue. Off is the real behaviour: documents required, Admin reviews, driver waits — turn it off before anyone real is carried."
              enabled={openDriverSignup}
              onChange={setOpenDriverSignup}
            />
            {/* Sits under the switch it belongs to, and only while that
                switch is on — a deadline for documents nobody is allowed to
                defer is just a number taking up space. */}
            {openDriverSignup && (
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <span aria-hidden className="text-lg leading-none">
                  📎
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-navy-900">Days to submit documents</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                    How long a driver who signed up without papers has to produce them. The date is stamped
                    on each driver when they register, so changing this only affects who registers next.
                  </span>
                </span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={documentGraceDays}
                  onChange={(e) => setDocumentGraceDays(Number(e.target.value))}
                  className="w-16 shrink-0 rounded-lg border border-slate-300 px-2 py-1.5 text-center text-sm"
                />
              </label>
            )}
            <FeatureToggleRow
              icon="🛰️"
              label="Live GPS tracking"
              description="Each phone follows its own movement and shows it on its own map, trip or no trip. Nothing is recorded — it is for checking whether GPS is accurate enough on the handsets your testers actually carry."
              enabled={liveGpsEnabled}
              onChange={setLiveGpsEnabled}
            />
            <FeatureToggleRow
              icon="🛺"
              label="Simulated tricycle movement"
              description="Glide the tricycle along the route on a timer so a trip can be demoed from a desk. Off means the map only moves when the driver's phone actually moves — use this for a real road test."
              enabled={simulateMovementEnabled}
              onChange={setSimulateMovementEnabled}
            />
            {!simulateMovementEnabled && (
              <p className="rounded-lg bg-blue-50 p-2 text-[11px] text-blue-900">
                🛰️ <span className="font-semibold">Real-GPS mode is on.</span> The driver's app now starts sharing
                live location automatically when a trip is active, and nothing moves by itself — so a trip will look
                stalled unless a real driver phone is out on the road with location permission granted.
              </p>
            )}
          </section>
        </div>
      )}

      {tab === 'links' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Share these with a prospective or existing partner. The sign-in link opens their login; the application
            link opens the matching registration form.
          </p>

          <PublicAddressPanel
            value={publicBaseUrl}
            onSave={setPublicBaseUrl}
            currentOrigin={currentOrigin}
            effectiveOrigin={origin}
            shareable={originIsShareable}
          />

          {/* The general front door — no role attached, so this is the one
              for a tarpaulin, poster or FB page where the audience is mixed
              and picks who they are on arrival. */}
          <section className="rounded-xl border border-brand-200 bg-brand-50 p-4 shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="text-xl leading-none">🏠</span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-700">App home — anyone</h2>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  The landing page, where visitors choose Log in or Sign Up and then pick their own role.
                </p>
              </div>
            </div>
            <div className="mt-3">
              <LinkRow url={`${origin}/`} />
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Best for posters, tarpaulins and social posts — one code that works for passengers, students, parents,
              drivers and TODAs alike.
            </p>
          </section>

          <AccessLinkCard
            icon="🧑"
            title="Passenger"
            blurb="Books tricycle rides for themselves."
            origin={origin}
            signInPath="/book?role=passenger&auth=login"
            applyPath="/book?role=passenger&auth=signup"
            applyNote="Opens passenger sign-up. No approval needed — the account is usable straight away."
          />
          <AccessLinkCard
            icon="🎓"
            title="Student"
            blurb="Same as a passenger, at the discounted student fare."
            origin={origin}
            signInPath="/book?role=passenger&auth=login"
            applyPath="/book?role=passenger&auth=signup&student=1"
            applyNote="Opens passenger sign-up with the student fare pre-ticked. No approval needed."
          />
          <AccessLinkCard
            icon="👪"
            title="Parent"
            blurb="Books and tracks a child's rides."
            origin={origin}
            signInPath="/book?role=parent&auth=login"
            applyPath="/book?role=parent&auth=signup"
            applyNote="Opens parent sign-up, which registers the parent and their child together. No approval needed."
          />
          <AccessLinkCard
            icon="🛵"
            title="Driver"
            blurb="Drives a tricycle and accepts bookings."
            origin={origin}
            signInPath="/drive?mode=login"
            applyPath="/drive?mode=register"
            applyNote="Opens driver registration (OTP, documents, TODA choice). New drivers are verified by their own TODA Admin, not from here."
          />
          <AccessLinkCard
            icon="🛺"
            title="TODA — Level 1"
            blurb="A local association managing its own drivers and dues."
            origin={origin}
            signInPath="/drive?mode=toda_admin"
            applyPath="/drive?mode=toda_admin&toda=register"
          />
          <AccessLinkCard
            icon="🏢"
            title="Operator — Level 2"
            blurb="Runs an assigned operation and the TODAs under it."
            origin={origin}
            signInPath="/operator"
            applyPath="/operator?apply=1"
          />
          <AccessLinkCard
            icon="🏛️"
            title="Franchise — Level 3"
            blurb="Holds a territory and the Operators within it."
            origin={origin}
            signInPath="/franchise"
            applyPath="/franchise?apply=1"
          />
          {/* Pre-attached variants of the same application links — whoever
              signs up through one is filed under the chosen parent instead of
              needing a manual assignment afterwards. */}
          <div className="pt-1">
            <h2 className="text-sm font-semibold text-slate-700">Pre-attached application links</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Same forms as above, but the applicant is automatically linked to the parent you pick here.
            </p>
          </div>

          {todaOrganizations.length > 0 && (
            <ScopedLinkCard
              title="Driver → a specific TODA"
              blurb="The driver's TODA is pre-selected on their registration form."
              value={scopedTodaOrgId}
              onChange={setScopedTodaOrgId}
              options={todaOrganizations.map((o) => ({ id: o.id, label: o.name }))}
              buildUrl={(id) => `${origin}/drive?todaOrgId=${id}`}
            />
          )}

          {operators.length > 0 && (
            <ScopedLinkCard
              title="TODA → a specific Operator"
              blurb="A TODA registering through this is filed under the chosen Operator."
              value={scopedOperatorId}
              onChange={setScopedOperatorId}
              options={operators.map((o) => ({ id: o.id, label: o.name }))}
              buildUrl={(id) => `${origin}/drive?mode=toda_admin&operatorId=${id}`}
            />
          )}

          {franchises.length > 0 && (
            <ScopedLinkCard
              title="Operator → a specific Franchise"
              blurb="An Operator registering through this is filed under the chosen Franchise."
              value={scopedFranchiseId}
              onChange={setScopedFranchiseId}
              options={franchises.map((f) => ({ id: f.id, label: f.name }))}
              buildUrl={(id) => `${origin}/operator?apply=1&franchiseId=${id}`}
            />
          )}
        </div>
      )}

      {tab === 'todas' && (
        <div className="space-y-4">
          {todaOrganizations.length === 0 ? (
            <p className="text-sm text-slate-400">No TODAs have registered yet.</p>
          ) : (
            <>
              <div className="-mx-4 overflow-x-auto px-4">
                <div className="flex gap-1.5">
                  {todaOrganizations.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setSelectedTodaOrgId(o.id)}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        selectedTodaOrgId === o.id
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {o.name}
                      {o.verificationStatus !== 'approved' ? ` (${o.verificationStatus})` : ''}
                    </button>
                  ))}
                </div>
              </div>
              {selectedTodaOrgId && (
                <div className="-mx-4">
                  <TodaAdminPage orgId={selectedTodaOrgId} readOnly />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'operators' && (
        <div className="space-y-4">
          {operators.length === 0 ? (
            <p className="text-sm text-slate-400">No Operators have applied yet.</p>
          ) : (
            <>
              <div className="-mx-4 overflow-x-auto px-4">
                <div className="flex gap-1.5">
                  {operators.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setSelectedOperatorId(o.id)}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        selectedOperatorId === o.id
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {o.name}
                      {o.verificationStatus !== 'approved' ? ` (${o.verificationStatus})` : ''}
                    </button>
                  ))}
                </div>
              </div>
              {selectedOperatorId && (
                <div className="-mx-4">
                  <OperatorPortalPage operatorId={selectedOperatorId} />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'franchises' && (
        <div className="space-y-4">
          {franchises.length === 0 ? (
            <p className="text-sm text-slate-400">No Franchises have applied yet.</p>
          ) : (
            <>
              <div className="-mx-4 overflow-x-auto px-4">
                <div className="flex gap-1.5">
                  {franchises.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setSelectedFranchiseId(f.id)}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        selectedFranchiseId === f.id
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {f.name}
                      {f.verificationStatus !== 'approved' ? ` (${f.verificationStatus})` : ''}
                    </button>
                  ))}
                </div>
              </div>
              {selectedFranchiseId && (
                <div className="-mx-4">
                  <FranchisePage franchiseId={selectedFranchiseId} />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Outside every tab gate on purpose: whichever area you are in, the
          running record of what changed is right there. */}
      <ActivityLogPanel
        title="Super Admin — Log History"
        entries={activityLog.filter((e) => e.actorRole === 'admin')}
        emptyMessage="No Admin or Super Admin changes logged yet."
      />
    </div>
  )
}

// One account type's two entry points. All of these are plain public URLs
// into the existing auth gates (no token is minted) — the paths differ per
// type: Operator/Franchise get their own routes, while Driver and TODA are
// both query-flavoured variants of /drive (see DriverAuthGate).
function AccessLinkCard({
  icon,
  title,
  blurb,
  origin,
  signInPath,
  applyPath,
  applyNote,
}: {
  icon: string
  title: string
  blurb: string
  origin: string
  signInPath: string
  applyPath: string
  // Overrides the default "lands in the Admin approval queue" wording for
  // types that don't go through this Admin's queue (a driver is verified by
  // their own TODA, not HQ).
  applyNote?: string
}) {
  const [mode, setMode] = useState<'signin' | 'apply'>('signin')
  const url = `${origin}${mode === 'apply' ? applyPath : signInPath}`

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="text-xl leading-none">{icon}</span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">{blurb}</p>
        </div>
      </div>

      <div className="mt-3 flex gap-1 rounded-lg bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setMode('signin')}
          className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
            mode === 'signin' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500'
          }`}
        >
          Portal sign-in
        </button>
        <button
          type="button"
          onClick={() => setMode('apply')}
          className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
            mode === 'apply' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500'
          }`}
        >
          New application
        </button>
      </div>

      <div className="mt-3">
        <LinkRow url={url} />
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        {mode === 'apply'
          ? (applyNote ??
            'Opens the registration form. The application arrives pending — approve it (and set its fees) from the Admin Pila.')
          : 'Opens the portal login. They sign in with the PIN set on their account.'}
      </p>
    </section>
  )
}

// Names the one TODA a pilot is being run with, printed on the welcome
// screen (LandingPage) so the app reads as that TODA's own booking app
// rather than a generic multi-operator platform. Blank keeps the generic
// welcome screen — right for the day-to-day multi-TODA deployment, not just
// a placeholder state.
function PilotTodaNamePanel({ value, onSave }: { value: string; onSave: (name: string) => void }) {
  const [draft, setDraft] = useState(value)
  const dirty = draft.trim() !== value

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">Pilot branding (fallback)</h2>
      <p className="mt-0.5 text-[11px] text-slate-500">
        The welcome screen already names whichever TODA's terminal is nearest the passenger, detected from their
        phone's location. This name only shows when that can't be — location is off, or nothing is close enough — so
        a device-bound pilot still greets riders as one TODA's app. E.g. "Roseville TODA" prints as "Roseville TODA /
        Booking App". Leave blank to fall all the way back to the ordinary, unbranded welcome screen.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Roseville TODA"
          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
        />
        <button
          type="button"
          disabled={!dirty}
          onClick={() => onSave(draft)}
          className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save
        </button>
      </div>
      {value && (
        <button
          type="button"
          onClick={() => {
            setDraft('')
            onSave('')
          }}
          className="mt-2 text-[11px] font-medium text-brand-600 underline hover:text-brand-700"
        >
          Clear — back to the unbranded welcome screen
        </button>
      )}
    </section>
  )
}

// Sets the address every link and QR on this tab is built from. Needed
// because window.location.origin is not a shareable address in the two
// situations this app actually runs in: a dev server (localhost, this
// machine only) and a Capacitor native build, where the webview reports
// https://localhost on Android and capacitor://localhost on iOS — a QR
// encoding either of those is unscannable by anyone else.
function PublicAddressPanel({
  value,
  onSave,
  currentOrigin,
  effectiveOrigin,
  shareable,
}: {
  value: string
  onSave: (url: string) => void
  currentOrigin: string
  effectiveOrigin: string
  shareable: boolean
}) {
  const [draft, setDraft] = useState(value)
  const dirty = draft.trim().replace(/\/+$/, '') !== value

  return (
    <section
      className={`rounded-xl border p-4 shadow-sm ${
        shareable ? 'border-slate-200 bg-white' : 'border-amber-300 bg-amber-50'
      }`}
    >
      <h2 className="text-sm font-semibold text-slate-700">Public app address</h2>
      <p className="mt-0.5 text-[11px] text-slate-500">
        Every link and QR below is built from this. Leave blank to use whatever address this page is open on.
      </p>

      {!shareable && (
        <p className="mt-2 rounded-lg bg-amber-100 p-2 text-[11px] text-amber-900">
          ⚠️ <span className="font-semibold">These QR codes won't work for anyone else yet.</span> They currently
          point at <span className="font-mono">{effectiveOrigin || '(unknown)'}</span>, which only resolves on this
          device. Inside an installed Android or iOS build this is worse still — the app reports{' '}
          <span className="font-mono">https://localhost</span> or <span className="font-mono">capacitor://localhost</span>.
          Set the real address where the app is hosted before printing or sending anything.
        </p>
      )}

      <div className="mt-2 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://todasaferide.example.com"
          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
        />
        <button
          type="button"
          disabled={!dirty}
          onClick={() => onSave(draft)}
          className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
        <span>
          Links use: <span className="font-mono text-slate-600">{effectiveOrigin || '(none)'}</span>
        </span>
        {value && (
          <button
            type="button"
            onClick={() => {
              setDraft('')
              onSave('')
            }}
            className="font-medium text-brand-600 underline hover:text-brand-700"
          >
            Reset to this page's address ({currentOrigin})
          </button>
        )}
      </div>
    </section>
  )
}

// An application link with a parent picked from a dropdown — the chosen id
// is baked into the URL, so the invite arrives already attached (see
// DriverAuthGate's inviteOperatorId/inviteTodaOrgId and AuthGate's
// inviteFranchiseId for the receiving end).
function ScopedLinkCard({
  title,
  blurb,
  value,
  onChange,
  options,
  buildUrl,
}: {
  title: string
  blurb: string
  value: string
  onChange: (id: string) => void
  options: { id: string; label: string }[]
  buildUrl: (id: string) => string
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      <p className="mt-0.5 text-[11px] text-slate-500">{blurb}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {value && (
        <div className="mt-3">
          <LinkRow url={buildUrl(value)} />
        </div>
      )}
    </section>
  )
}

// Copyable URL + scannable QR for the same link — send the URL over
// Messenger/SMS, or let someone scan the code off a screen in person.
function LinkRow({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="w-full truncate rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
        />
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="mt-3 flex justify-center rounded-lg border border-slate-200 bg-white p-3">
        <QRCodeSVG value={url || ' '} size={144} level="M" marginSize={2} />
      </div>
    </div>
  )
}

function FeatureToggleRow({
  icon,
  label,
  description,
  enabled,
  onChange,
}: {
  icon: string
  label: string
  description: string
  enabled: boolean
  onChange: (enabled: boolean) => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
      <span className="text-lg leading-none">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-700">{label}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${label} ${enabled ? 'on' : 'off'}`}
        onClick={() => onChange(!enabled)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${enabled ? 'bg-brand-600' : 'bg-slate-300'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            enabled ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  )
}

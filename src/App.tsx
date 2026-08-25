import { useLayoutEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AdminParentMonitorPage } from './pages/AdminParentMonitorPage'
import { AdminPassengerMonitorPage } from './pages/AdminPassengerMonitorPage'
import { AdminDriverMonitorPage } from './pages/AdminDriverMonitorPage'
import { PublicHeader } from './components/PublicHeader'
import { SuperAdminGate } from './components/SuperAdminGate'
import { NavBar } from './components/NavBar'
import { AuthGate } from './components/AuthGate'
import { DesktopOnlyNotice } from './components/DesktopOnlyNotice'
import { isDesktopOnlyRole, isNativeApp } from './lib/platform'
import { LandingPage } from './pages/LandingPage'
import { DriverPage } from './pages/DriverPage'
import { AdminPage } from './pages/AdminPage'
import { AdminTodaProfilePage } from './pages/AdminTodaProfilePage'
import { SuperAdminPage } from './pages/SuperAdminPage'
import { SimulatorPage } from './pages/SimulatorPage'
import { TerminalScanPage } from './pages/TerminalScanPage'
import { RiderStartPage } from './pages/RiderStartPage'
import { RoleChooserPage } from './pages/RoleChooserPage'
import { AccountingPage } from './pages/AccountingPage'
import { IncomePromotionPage } from './pages/IncomePromotionPage'
import { BookPage } from './pages/BookPage'
import { MedsRideBookingPage } from './pages/MedsRideBookingPage'
import { PharmacyPortalPage } from './pages/PharmacyPortalPage'
import { OperatorPortalPage } from './pages/OperatorPortalPage'
import { FranchisePage } from './pages/FranchisePage'
import { RideProvider } from './context/RideContext'
import { SessionProvider, useSession } from './context/SessionContext'
import { ThemeProvider } from './context/ThemeContext'

// Puts the login/landing view back at the top of the frame every time it
// appears.
//
// A single-page app never reloads the document, so the scroll position
// outlives whatever was on screen. Log out from halfway down the driver page
// and the login form arrives already scrolled past its own fields — the first
// thing a user sees is blank space where the form should be. Mounted inside
// the logged-out branch below, so it fires both when the app flips to logged
// out and on every move between the public screens.
//
// useLayoutEffect, not useEffect: this runs before the browser paints, so the
// jump is never seen as a jump.
function ScrollToTopOfPublicView({ pathname }: { pathname: string }) {
  useLayoutEffect(() => {
    // #root is the scroller here, not the page. index.css gives html, body
    // and #root `height: 100%` with `overflow-x: hidden`, and CSS promotes
    // the other axis to `auto` when one axis is hidden — so the scrollbar
    // lives on #root and window.scrollY is pinned at 0 no matter how far
    // down the content is. window.scrollTo alone is a silent no-op.
    document.getElementById('root')?.scrollTo({ top: 0 })
    // Kept for the day that CSS changes and the page itself scrolls again.
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function AppShell() {
  const { authedAccount } = useSession()
  const location = useLocation()

  // The landing page and the role chooser behind it are both public — they
  // only ask "log in or sign up" and "as who", nothing account-specific — so
  // a logged-out visitor sees them instead of the login gate. Every other
  // route (/book, /drive, the admin/ops view, ...) still requires logging in
  // first: authedAccount resets on every fresh page load (see
  // SessionContext), so trying to reach any of those always means hitting
  // AuthGate first.
  if (!authedAccount) {
    const publicTitle =
      location.pathname === '/welcome'
        ? 'Create your account'
        : location.pathname === '/'
          ? 'Welcome'
          : location.pathname.startsWith('/scan/')
            ? 'Safe Ride'
            : 'Sign in'
    return (
      <>
        <ScrollToTopOfPublicView pathname={location.pathname} />
        <PublicHeader title={publicTitle} />
        <main className={location.pathname === '/' ? 'pt-[50px]' : 'pt-[70px]'}>
          {location.pathname === '/' ? (
            <LandingPage />
          ) : location.pathname === '/welcome' ? (
            <RoleChooserPage />
          ) : location.pathname.startsWith('/scan/') ? (
            <TerminalScanPage />
          ) : (
            <AuthGate />
          )}
        </main>
      </>
    )
  }

  // Once authed, which URLs are even reachable depends on the account's
  // role — this is the actual role separation, not just the login wall
  // above. Passenger/Parent accounts are confined to the rider app, Driver
  // and TODA Admin accounts to the driver app; neither can wander into the
  // full multi-tab system. Only App Admin gets that ("everything visible").

  // The installed app carries the whole bundle, admin screens included, but
  // it does not serve the two staff tiers to anyone (see DESKTOP_ONLY_ROLES).
  // UnifiedAuth already refuses to create such a session; this catches one
  // that predates that check — a session stored by an older APK survives an
  // update, and would otherwise land straight on /admin.
  if (isNativeApp() && isDesktopOnlyRole(authedAccount.role)) {
    return <DesktopOnlyNotice />
  }

  const isRiderRole = authedAccount.role === 'passenger' || authedAccount.role === 'parent'
  const isDriverRole = authedAccount.role === 'driver' || authedAccount.role === 'toda_admin'
  const isPharmacyRole = authedAccount.role === 'pharmacy'
  const isOperatorAdminRole = authedAccount.role === 'operator_admin'
  const isFranchiseAdminRole = authedAccount.role === 'franchise_admin'

  // Path-based (not role-based) — mirrors NavBar's own isRiderApp/isDriverApp/
  // isPharmacyApp checks, needed here too so <main>'s top padding can match
  // whichever header variant NavBar is currently rendering (see below).
  const isRiderApp = location.pathname.startsWith('/book') || location.pathname.startsWith('/scan/')
  // Exact match, not a prefix: '/driver' (the Admin fleet-monitoring page)
  // starts with '/drive', so a prefix test put the whole Admin surface behind
  // the driver app's minimal header and hid the role tabs.
  const isDriverApp = location.pathname === '/drive' || location.pathname.startsWith('/drive/')
  const isPharmacyApp = location.pathname.startsWith('/pharmacy') || location.pathname.startsWith('/vendor')
  const isOperatorApp = location.pathname.startsWith('/operator')
  const isFranchiseApp = location.pathname.startsWith('/franchise')

  // Prefix, not equality: the rider app is now more than one screen (see
  // /book/meds/:orderId). Everything under /book is still the rider app, so
  // the confinement this enforces is unchanged — only its granularity is.
  if (isRiderRole && !isRiderApp) {
    return <Navigate to="/book/start" replace />
  }
  if (isDriverRole && location.pathname !== '/drive') {
    return <Navigate to="/drive" replace />
  }
  if (isPharmacyRole && location.pathname !== '/pharmacy') {
    return <Navigate to="/pharmacy" replace />
  }
  if (isOperatorAdminRole && location.pathname !== '/operator') {
    return <Navigate to="/operator" replace />
  }
  if (isFranchiseAdminRole && location.pathname !== '/franchise') {
    return <Navigate to="/franchise" replace />
  }


  // NavBar's header is `fixed` (not `sticky`) so it's guaranteed to stay
  // visible at the very top of the viewport no matter how far the page
  // scrolls — sticky can fail to stay pinned depending on the surrounding
  // scroll container. A fixed header is removed from document flow though,
  // so <main> needs matching top padding or its content would start out
  // hidden underneath it; the two header variants render at different
  // heights (the rider/driver/pharmacy header is a single row, the
  // full-nav one adds a second row of tabs below it), so the padding has to
  // match whichever is currently showing.
  const isMinimalHeader = isRiderApp || isDriverApp || isPharmacyApp || isOperatorApp || isFranchiseApp

  return (
    <>
      <NavBar />
      {/* Measured against the real header: the minimal one renders 67px
          tall with the larger logo and the hamburger/back stack, so 70px
          clears it with a hair to spare. Re-measure if that header's contents
          change again — this number has no other way to stay honest. */}
      <main className={isMinimalHeader ? 'pt-[70px]' : 'pt-2'}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/welcome" element={<RoleChooserPage />} />
          <Route path="/scan/:driverId" element={<TerminalScanPage />} />
          {/* Public rider and driver apps — separate, minimal-nav entry
              points for end users. */}
          <Route path="/book/start" element={<RiderStartPage />} />
          <Route path="/book" element={<BookPage />} />
          {/* Booking the pickup ride for a medicine order the pharmacy has
              already confirmed and set aside. */}
          <Route path="/book/meds/:orderId" element={<MedsRideBookingPage />} />
          <Route path="/drive" element={<DriverPage />} />
          <Route path="/pharmacy" element={<PharmacyPortalPage />} />
          {/* Same portal as /pharmacy — the split exists only so the
              sign-up form can offer the right business categories. */}
          <Route path="/vendor" element={<PharmacyPortalPage />} />
          <Route path="/operator" element={<OperatorPortalPage />} />
          <Route path="/franchise" element={<FranchisePage />} />
          {/* Original full-nav system — the internal/operations view where
              every role's tab is reachable. Only Admin accounts ever reach
              this far (see the redirects above). */}
          <Route path="/passenger" element={<AdminPassengerMonitorPage />} />
          {/* Admin-only route (drivers themselves are redirected to /drive),
              so it shows fleet monitoring rather than a driver login form. */}
          <Route path="/driver" element={<AdminDriverMonitorPage />} />
          <Route path="/parent" element={<AdminParentMonitorPage />} />
          <Route path="/admin" element={<AdminPage />} />
          {/* Dev/demo aid — two seeded accounts side by side. */}
          <Route path="/admin/simulator" element={<SimulatorPage />} />
          {/* Super Admin is its own tier, not a permission bit on Admin. An
              Admin session reaching this route is asked to sign in with the
              Super Admin credentials rather than being bounced — the boundary
              should read as "different account required", not as a dead link.
              Super Admin can still open /admin, since oversight of day-to-day
              operations is part of that job. */}
          <Route
            path="/admin/super"
            element={authedAccount.role === 'super_admin' ? <SuperAdminPage /> : <SuperAdminGate />}
          />
          <Route path="/admin/toda/:todaOrgId" element={<AdminTodaProfilePage />} />
          <Route path="/admin/accounting" element={<AccountingPage />} />
          <Route path="/admin/income-promotion" element={<IncomePromotionPage />} />
        </Routes>
      </main>
    </>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <SessionProvider>
        <RideProvider>
          <AppShell />
        </RideProvider>
      </SessionProvider>
    </ThemeProvider>
  )
}

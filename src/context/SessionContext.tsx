import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Role } from '../types'
import { MOCK_DRIVERS, MOCK_PARENTS, MOCK_PASSENGERS, MOCK_PHARMACIES } from '../mock/data'

export type AuthedAccountRole =
  | 'super_admin'
  | 'passenger'
  | 'parent'
  | 'driver'
  | 'toda_admin'
  | 'admin'
  | 'pharmacy'
  | 'operator_admin'
  | 'franchise_admin'

export interface AuthedAccount {
  role: AuthedAccountRole
  id: string
}

// Persists the logged-in session across page reloads/app restarts, so users
// stay logged in until they explicitly log out (mirrors real apps like
// Grab/Angkas — closing and reopening shouldn't force a re-login).
const SESSION_STORAGE_KEY = 'tricycle-session-v1'

interface StoredSession {
  authedAccount: AuthedAccount | null
  currentPassengerId: string
  currentParentId: string
  loggedInDriverId: string | null
  loggedInTodaAdminOrgId: string | null
  loggedInPharmacyId: string | null
  loggedInOperatorAdminId: string | null
  loggedInFranchiseAdminId: string | null
}

// A pinned session, requested by the URL rather than restored from storage.
//
// The whole app shares one session key, so two views of it — two tabs, or two
// panes of the simulator — cannot normally hold two different accounts: the
// last one to write wins and a reload flips the other. `?as=` sidesteps that
// by pinning this document's identity and, crucially, opting it out of
// persistence entirely (see the effect below). Nothing it does can overwrite
// the real session in storage.
//
// Simulation aid only: it hands out a session for a seeded demo account, so
// it is limited to the seeded ids and cannot conjure an account that does not
// already exist.
function pinnedSessionFromUrl(): StoredSession | null {
  if (typeof window === 'undefined') return null
  const as = new URLSearchParams(window.location.search).get('as')
  if (!as) return null
  const id = new URLSearchParams(window.location.search).get('asId')
  switch (as) {
    case 'passenger': {
      const passengerId = id ?? MOCK_PASSENGERS[0].id
      return {
        authedAccount: { role: 'passenger', id: passengerId },
        currentPassengerId: passengerId,
        currentParentId: MOCK_PARENTS[0].id,
        loggedInDriverId: null,
        loggedInTodaAdminOrgId: null,
        loggedInPharmacyId: null,
        loggedInOperatorAdminId: null,
        loggedInFranchiseAdminId: null,
      }
    }
    case 'parent': {
      const parentId = id ?? MOCK_PARENTS[0].id
      return {
        authedAccount: { role: 'parent', id: parentId },
        currentPassengerId: MOCK_PASSENGERS[0].id,
        currentParentId: parentId,
        loggedInDriverId: null,
        loggedInTodaAdminOrgId: null,
        loggedInPharmacyId: null,
        loggedInOperatorAdminId: null,
        loggedInFranchiseAdminId: null,
      }
    }
    case 'driver': {
      const driverId = id ?? MOCK_DRIVERS[0].id
      return {
        authedAccount: { role: 'driver', id: driverId },
        currentPassengerId: MOCK_PASSENGERS[0].id,
        currentParentId: MOCK_PARENTS[0].id,
        loggedInDriverId: driverId,
        loggedInTodaAdminOrgId: null,
        loggedInPharmacyId: null,
        loggedInOperatorAdminId: null,
        loggedInFranchiseAdminId: null,
      }
    }
    case 'pharmacy': {
      const pharmacyId = id ?? MOCK_PHARMACIES[0].id
      return {
        authedAccount: { role: 'pharmacy', id: pharmacyId },
        currentPassengerId: MOCK_PASSENGERS[0].id,
        currentParentId: MOCK_PARENTS[0].id,
        loggedInDriverId: null,
        loggedInTodaAdminOrgId: null,
        loggedInPharmacyId: pharmacyId,
        loggedInOperatorAdminId: null,
        loggedInFranchiseAdminId: null,
      }
    }
    default:
      return null
  }
}

export function isPinnedSession(): boolean {
  return pinnedSessionFromUrl() !== null
}

function loadStoredSession(): StoredSession | null {
  const pinned = pinnedSessionFromUrl()
  if (pinned) return pinned
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as StoredSession
  } catch {
    // ignore corrupt storage
  }
  return null
}

interface SessionContextValue {
  role: Role
  setRole: (role: Role) => void
  currentPassengerId: string
  setCurrentPassengerId: (id: string) => void
  loggedInDriverId: string | null
  setLoggedInDriverId: (id: string | null) => void
  currentParentId: string
  setCurrentParentId: (id: string) => void
  loggedInTodaAdminOrgId: string | null
  setLoggedInTodaAdminOrgId: (orgId: string | null) => void
  loggedInPharmacyId: string | null
  setLoggedInPharmacyId: (pharmacyId: string | null) => void
  loggedInOperatorAdminId: string | null
  setLoggedInOperatorAdminId: (operatorId: string | null) => void
  loggedInFranchiseAdminId: string | null
  setLoggedInFranchiseAdminId: (franchiseId: string | null) => void
  // Gates the entire app — null means nobody is logged in, so App.tsx renders
  // AuthGate instead of any route. Persisted to localStorage (see
  // SESSION_STORAGE_KEY below) so a reload or app relaunch keeps the user
  // logged in until they explicitly log out.
  authedAccount: AuthedAccount | null
  setAuthedAccount: (account: AuthedAccount | null) => void
  // Which finance officer unlocked the Accounting & Compliance page this
  // session — shown in the NavBar badge there ("Super Admin - Ces").
  // Deliberately NOT persisted to storage, same as AdminAccounting's own
  // unlock state: this is the extra-protected area, so a reload should ask
  // again rather than silently keep showing the last officer's name.
  accountingOfficerName: string | null
  setAccountingOfficerName: (name: string | null) => void
  logOut: () => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const stored = loadStoredSession()
  // A pinned pane must never write its borrowed identity back to the shared
  // key — that is exactly the clobbering it exists to avoid.
  const pinned = isPinnedSession()
  // A resumed session (page reload/relaunch) restores authedAccount from
  // storage, but this `role` tab-selection state is separate — without
  // seeding it from the stored account too, the NavBar's tab highlight and
  // identity badge would reset to Passenger every reload regardless of who's
  // actually logged in. toda_admin/driver aren't part of Role (they never
  // reach the full-nav tab UI — see NavBar's isRiderApp/isDriverApp), so
  // they fall back to the same 'passenger' default as a fresh session.
  const storedRole = stored?.authedAccount?.role
  const [role, setRole] = useState<Role>(
    storedRole === 'passenger' || storedRole === 'parent' || storedRole === 'admin' || storedRole === 'driver'
      ? storedRole
      : 'passenger',
  )
  const [currentPassengerId, setCurrentPassengerId] = useState(stored?.currentPassengerId ?? MOCK_PASSENGERS[0].id)
  const [loggedInDriverId, setLoggedInDriverId] = useState<string | null>(stored?.loggedInDriverId ?? null)
  const [currentParentId, setCurrentParentId] = useState(stored?.currentParentId ?? MOCK_PARENTS[0].id)
  const [loggedInTodaAdminOrgId, setLoggedInTodaAdminOrgId] = useState<string | null>(
    stored?.loggedInTodaAdminOrgId ?? null,
  )
  const [loggedInPharmacyId, setLoggedInPharmacyId] = useState<string | null>(stored?.loggedInPharmacyId ?? null)
  const [loggedInOperatorAdminId, setLoggedInOperatorAdminId] = useState<string | null>(
    stored?.loggedInOperatorAdminId ?? null,
  )
  const [loggedInFranchiseAdminId, setLoggedInFranchiseAdminId] = useState<string | null>(
    stored?.loggedInFranchiseAdminId ?? null,
  )
  const [authedAccount, setAuthedAccount] = useState<AuthedAccount | null>(stored?.authedAccount ?? null)
  const [accountingOfficerName, setAccountingOfficerName] = useState<string | null>(null)

  useEffect(() => {
    const toStore: StoredSession = {
      authedAccount,
      currentPassengerId,
      currentParentId,
      loggedInDriverId,
      loggedInTodaAdminOrgId,
      loggedInPharmacyId,
      loggedInOperatorAdminId,
      loggedInFranchiseAdminId,
    }
    if (pinned) return
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(toStore))
  }, [
    pinned,
    authedAccount,
    currentPassengerId,
    currentParentId,
    loggedInDriverId,
    loggedInTodaAdminOrgId,
    loggedInPharmacyId,
    loggedInOperatorAdminId,
    loggedInFranchiseAdminId,
  ])

  function logOut() {
    setAuthedAccount(null)
    setLoggedInDriverId(null)
    setLoggedInTodaAdminOrgId(null)
    setLoggedInPharmacyId(null)
    setLoggedInOperatorAdminId(null)
    setLoggedInFranchiseAdminId(null)
    setAccountingOfficerName(null)
  }

  return (
    <SessionContext.Provider
      value={{
        role,
        setRole,
        currentPassengerId,
        setCurrentPassengerId,
        loggedInDriverId,
        setLoggedInDriverId,
        currentParentId,
        setCurrentParentId,
        loggedInTodaAdminOrgId,
        setLoggedInTodaAdminOrgId,
        loggedInPharmacyId,
        setLoggedInPharmacyId,
        loggedInOperatorAdminId,
        setLoggedInOperatorAdminId,
        loggedInFranchiseAdminId,
        setLoggedInFranchiseAdminId,
        authedAccount,
        setAuthedAccount,
        accountingOfficerName,
        setAccountingOfficerName,
        logOut,
      }}
    >
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within a SessionProvider')
  return ctx
}

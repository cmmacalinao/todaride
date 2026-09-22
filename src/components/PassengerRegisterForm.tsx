import { useState } from 'react'
import { useRides } from '../context/RideContext'
import { MINOR_AGE_LIMIT } from '../mock/data'
import { EMPTY_PH_ADDRESS, PhAddressFields, type PhAddressValue } from './PhAddressFields'
import { RegistrationOtpStep } from './RegistrationOtpStep'

// A student's contact is by definition the person responsible for them, so
// the list they pick from is narrower than an adult's.
const STUDENT_RELATIONSHIPS = ['Mother', 'Father', 'Grandparent', 'Aunt / Uncle', 'Sibling', 'Legal guardian']
const RELATIONSHIPS = [...STUDENT_RELATIONSHIPS, 'Spouse', 'Child', 'Friend', 'Other']

// Who else rides on this account. Relationship is from the account holder's
// side — "Child" means this passenger's child.
const DEPENDENT_RELATIONSHIPS = ['Child', 'Grandchild', 'Sibling', 'Ward', 'Other']

// A parent or guardian a student names. Several are allowed: a student with
// two parents should be able to say so.
interface Guardian {
  key: string
  name: string
  phone: string
  relationship: string
}

interface Dependent {
  key: string
  name: string
  age: string
  phone: string
  relationship: string
}
import { BiometricEnrollOption, useBiometricEnrollChoice } from './BiometricEnrollOption'

// `asStudent` comes from the Student tile on the role chooser (see
// RoleChooserPage) — it's the same Passenger account either way, just
// pre-ticked for the student fare, so the rider can still untick it here if
// they picked the wrong tile.
export function PassengerRegisterForm({
  onRegistered,
  asStudent = false,
}: {
  onRegistered: (passengerId: string) => void
  asStudent?: boolean
}) {
  const { registerPassenger, registerGuardianForStudent, registerParentWithChild, passengers } = useRides()
  // A family invite (?family=CODE, from a member's personal QR/link — see the
  // Family page, 2026-09-22). Kept on this phone as well (main.tsx saves it
  // the moment the app opens), so it survives a redirect, the OTP step and a
  // reload. A valid one links the new account to
  // that family, and is the only way someone under the age limit can sign up.
  const [inviteCode] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('family')?.trim().toUpperCase() || ''
    try {
      if (fromUrl) localStorage.setItem('toda-family-invite', fromUrl)
      return fromUrl || localStorage.getItem('toda-family-invite') || ''
    } catch {
      return fromUrl
    }
  })
  const inviteOwner = inviteCode
    ? passengers.find((p) => (p.familyMembers ?? []).some((m) => m.inviteCode === inviteCode))
    : undefined
  const inviteMember = inviteOwner?.familyMembers?.find((m) => m.inviteCode === inviteCode)
  const [step, setStep] = useState<'otp' | 'profile'>('otp')
  const [isStudent, setIsStudent] = useState(asStudent)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [age, setAge] = useState('')
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [address, setAddress] = useState<PhAddressValue>(EMPTY_PH_ADDRESS)
  // A student has parents, usually two. This was a single set of fields, so
  // naming a mother meant leaving the father off the account entirely — and
  // the one who was left off could not follow the trips or be reached on SOS.
  const [guardians, setGuardians] = useState<Guardian[]>([
    { key: 'g0', name: '', phone: '', relationship: '' },
  ])
  const [error, setError] = useState('')
  // People this passenger books for: a child, an elderly parent, anyone who
  // rides on their account. Parent registration used to be a separate sign-up
  // with its own tab, which asked people to decide what kind of account they
  // were before they had used the app — and left a mother with two logins,
  // one for herself and one for her son. She is one person with one number.
  const [dependents, setDependents] = useState<Dependent[]>([])
  const [consentGuardian, setConsentGuardian] = useState(false)
  const [consentSupervise, setConsentSupervise] = useState(false)
  const [consentResponsible, setConsentResponsible] = useState(false)
  const hasMinor = dependents.some((d) => {
    const n = Number(d.age)
    return Number.isFinite(n) && n > 0 && n < MINOR_AGE_LIMIT
  })
  const biometric = useBiometricEnrollChoice()

  function addGuardian() {
    setGuardians((prev) => [...prev, { key: `g${prev.length}-${Date.now()}`, name: '', phone: '', relationship: '' }])
  }
  function updateGuardian(key: string, patch: Partial<Guardian>) {
    setGuardians((prev) => prev.map((g) => (g.key === key ? { ...g, ...patch } : g)))
  }
  function removeGuardian(key: string) {
    setGuardians((prev) => (prev.length <= 1 ? prev : prev.filter((g) => g.key !== key)))
  }
  // The one written onto the passenger record itself, and the one SOS reads.
  const namedGuardians = guardians.filter((g) => g.name.trim() && g.phone.trim())
  const primaryGuardian = namedGuardians[0] ?? null

  function addDependent() {
    setDependents((prev) => [...prev, { key: `dep-${prev.length}-${Date.now()}`, name: '', age: '', phone: '', relationship: 'Child' }])
  }
  function updateDependent(key: string, patch: Partial<Dependent>) {
    setDependents((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  }
  function removeDependent(key: string) {
    setDependents((prev) => prev.filter((d) => d.key !== key))
  }

  function handleVerified(verifiedName: string, verifiedPhone: string) {
    setName(verifiedName)
    setPhone(verifiedPhone)
    setStep('profile')
  }

  async function handleSubmit() {
    const ageNum = Number(age)
    if (!Number.isFinite(ageNum) || ageNum <= 0) {
      setError('Enter your age.')
      return
    }
    if (ageNum < MINOR_AGE_LIMIT && !inviteOwner) {
      setError(
        `Passengers under ${MINOR_AGE_LIMIT} can't sign up alone. Ask your parent or a family member to send you your personal Family invite — open the link from it to sign up.`,
      )
      return
    }
    if (!address.province || !address.city || !address.barangay || !address.addressDetail.trim()) {
      setError('Fill in your full address (province/city/barangay/detail).')
      return
    }
    if (pin.trim().length !== 4) {
      setError('Create a 4-digit PIN — you can use it to log in instead of OTP.')
      return
    }
    if (isStudent && namedGuardians.length === 0) {
      setError("Students need a parent or guardian's name and mobile number as their emergency contact.")
      return
    }
    if (namedGuardians.some((g) => !g.relationship.trim())) {
      setError('Say how each contact is related to you.')
      return
    }
    if (guardians.some((g) => (g.name.trim() ? !g.phone.trim() : !!g.phone.trim()))) {
      setError('Each contact needs both a name and a mobile number.')
      return
    }
    for (const d of dependents) {
      const depAge = Number(d.age)
      if (!d.name.trim() || !Number.isFinite(depAge) || depAge <= 0 || !d.phone.trim()) {
        setError('For each person you are adding, fill in their name, age, and a number to reach them.')
        return
      }
      if (depAge >= MINOR_AGE_LIMIT) {
        setError(
          `${d.name.trim()} is ${MINOR_AGE_LIMIT} or older, so they register on their own as a passenger — an adult's account is theirs to hold.`,
        )
        return
      }
    }
    if (hasMinor && !(consentGuardian && consentSupervise && consentResponsible)) {
      setError('Tick all three boxes to confirm you are responsible for the child you are adding.')
      return
    }
    const id = registerPassenger({
      name,
      age: ageNum,
      phone,
      email: email.trim() || null,
      pin: pin.trim(),
      province: address.province,
      city: address.city,
      barangay: address.barangay,
      addressDetail: address.addressDetail.trim(),
      guardianPhone: primaryGuardian?.phone.trim() || null,
      guardianName: primaryGuardian?.name.trim() || null,
      guardianRelationship: primaryGuardian?.relationship.trim() || null,
      isStudent,
      familyInviteCode: inviteOwner ? inviteCode : null,
    })
    if (!id) {
      setError('Registration failed. Please try again.')
      return
    }
    // Used: the next account made on this phone is not part of that family.
    try {
      localStorage.removeItem('toda-family-invite')
    } catch {
      /* storage refused — nothing to clear */
    }
    // A student's parent/guardian becomes a real Parent record linked to
    // them — the same directory Admin monitors and the guardian can later
    // claim with a code to their own number. Adults keep theirs as a plain
    // emergency contact; there is nobody to give an account to.
    if (isStudent) {
      for (const g of namedGuardians) {
        registerGuardianForStudent({
          studentPassengerId: id,
          name: g.name.trim(),
          phone: g.phone.trim(),
          relationship: g.relationship.trim() || 'Guardian',
          province: address.province,
          city: address.city,
          barangay: address.barangay,
          addressDetail: address.addressDetail.trim(),
        })
      }
    }
    // Everyone added here joins this one account rather than getting a
    // separate parent login. The reducer keys the parent record on the phone
    // number, so three children make one parent with three links, not three
    // parents with the same name.
    for (const d of dependents) {
      registerParentWithChild({
        parentName: name,
        parentPhone: phone,
        parentEmail: email.trim() || null,
        parentPin: pin.trim(),
        childName: d.name.trim(),
        childAge: Number(d.age),
        childPhone: d.phone.trim(),
        relationship: d.relationship,
        province: address.province,
        city: address.city,
        barangay: address.barangay,
        addressDetail: address.addressDetail.trim(),
        proofOfAuthorityDataUrl: null,
      })
    }
    setError('')
    // Enrolled before the caller navigates away — the OS prompt cannot be
    // shown once this form has been unmounted.
    await biometric.enrollIfWanted({ role: 'passenger', id }, name)
    onRegistered(id)
  }

  if (step === 'otp') {
    return (
      <RegistrationOtpStep
        title={inviteOwner ? `Join ${inviteOwner.name}'s Family` : asStudent ? 'Register as a student' : 'Register as a passenger'}
        description={
          inviteOwner
            ? `${inviteOwner.name} invited ${inviteMember?.name ?? 'you'} to their TODA Ride Family. Verify your number to make your account — it will be linked to their family, and they can follow your trips.`
            : asStudent
            ? `Registering for yourself, as a student aged ${MINOR_AGE_LIMIT} or over — you'll get the discounted student fare. You can add your parents further down so they can follow your trips.`
            : `Registering for yourself. You can add a child, or anyone else you book for, further down — they join this account instead of needing one of their own.`
        }
        onVerified={handleVerified}
      />
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
      {inviteOwner && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900">
          👨‍👩‍👧 Joining {inviteOwner.name}'s Family{inviteMember ? ` as ${inviteMember.name}` : ''} — linked when you finish.
        </p>
      )}
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">
          {name} · {phone} · <span className="font-medium text-emerald-600">✓ verified</span>
        </span>
        <button
          type="button"
          onClick={() => setStep('otp')}
          className="font-medium text-brand-600 hover:text-brand-700"
        >
          Change
        </button>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Age</label>
        <input
          type="number"
          min={1}
          value={age}
          onChange={(e) => setAge(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
        <input
          type="checkbox"
          checked={isStudent}
          onChange={(e) => setIsStudent(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        <span className="min-w-0">
          <span className="block text-xs font-medium text-slate-700">🎓 I'm a student</span>
          <span className="mt-0.5 block text-[11px] text-slate-400">
            Applies the discounted student fare to your rides. Bring your school ID when you ride.
          </span>
        </span>
      </label>

      <PhAddressFields value={address} onChange={setAddress} />

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Email (optional)</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-[11px] text-slate-400">
          Optional — lets you log in with your email instead of just your name or number.
        </p>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Create a 4-digit PIN</label>
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tracking-widest"
          placeholder="••••"
        />
        <p className="mt-1 text-[11px] text-slate-400">Use this to log in instead of OTP next time.</p>
      </div>

      <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5">
        <div>
          <p className="text-xs font-medium text-slate-600">
            {isStudent ? 'Parent / guardian' : 'Emergency contact'}
            {isStudent ? '' : ' (optional)'}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {isStudent
              ? "Puwede mong idagdag pareho ang magulang mo. Mapapasama sila sa Parent directory at makikita nila ang biyahe mo kapag kinumpirma nila — sila rin ang aabisuhan kapag nag-SOS ka."
              : "If you ever trigger SOS and you have no linked parent account, this is who we notify."}
          </p>
        </div>

        {guardians.map((g, i) => (
          <div key={g.key} className="space-y-2 rounded-lg bg-slate-50 p-2">
            {guardians.length > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-slate-600">
                  {isStudent ? `Magulang / guardian #${i + 1}` : `Contact #${i + 1}`}
                </p>
                <button
                  type="button"
                  onClick={() => removeGuardian(g.key)}
                  className="text-[11px] font-medium text-amber-700 underline"
                >
                  Alisin
                </button>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Full name</label>
              <input
                value={g.name}
                onChange={(e) => updateGuardian(g.key, { name: e.target.value })}
                placeholder="e.g. Maria Santos"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Relationship</label>
                <select
                  value={g.relationship}
                  onChange={(e) => updateGuardian(g.key, { relationship: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Select</option>
                  {(isStudent ? STUDENT_RELATIONSHIPS : RELATIONSHIPS).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Mobile number</label>
                <input
                  type="tel"
                  value={g.phone}
                  onChange={(e) => updateGuardian(g.key, { phone: e.target.value })}
                  placeholder="09XXXXXXXXX"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addGuardian}
          className="w-full rounded-lg border border-dashed border-slate-300 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          {isStudent ? '+ Magdagdag ng magulang / guardian' : '+ Add another contact'}
        </button>
      </div>
      {/* Everyone else who rides on this account.
          //
          Registering a child used to be a different sign-up entirely, chosen
          from a tile before anyone had used the app — so a mother ended up
          with two accounts and two logins, one for herself and one for her
          son, and had to know in advance which she was creating. She is one
          person with one number. This is the same account, with the people
          she books for on it. */}
      <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5">
        <div>
          <p className="text-xs font-medium text-slate-600">May isasama ka bang bata? (optional)</p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Anak, apo, o kahit sinong bata na isasakay mo — sila ay idadagdag sa account mo, hindi sa hiwalay na
            login. Puwede mo silang i-book at masusubaybayan mo ang biyahe nila.
          </p>
        </div>

        {dependents.map((d, i) => (
          <div key={d.key} className="space-y-2 rounded-lg bg-slate-50 p-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-slate-600">Bata #{i + 1}</p>
              <button
                type="button"
                onClick={() => removeDependent(d.key)}
                className="text-[11px] font-medium text-amber-700 underline"
              >
                Alisin
              </button>
            </div>
            <input
              value={d.name}
              onChange={(e) => updateDependent(d.key, { name: e.target.value })}
              placeholder="Buong pangalan"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                inputMode="numeric"
                value={d.age}
                onChange={(e) => updateDependent(d.key, { age: e.target.value })}
                placeholder="Edad"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="tel"
                value={d.phone}
                onChange={(e) => updateDependent(d.key, { phone: e.target.value })}
                placeholder="09XXXXXXXXX"
                className="col-span-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <select
              value={d.relationship}
              onChange={(e) => updateDependent(d.key, { relationship: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {DEPENDENT_RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        ))}

        <button
          type="button"
          onClick={addDependent}
          className="w-full rounded-lg border border-dashed border-slate-300 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          + Magdagdag ng bata / iba pang sasakay
        </button>

        {/* Only asked once, and only when there is actually a child on the
            account. The three statements are the same ones parent
            registration required — a child cannot consent for themselves, so
            somebody has to say plainly that they are answering for them. */}
        {hasMinor && (
          <div className="space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 p-2.5">
            <p className="text-[11px] font-semibold text-amber-900">
              Kailangan mong kumpirmahin ito para sa batang idadagdag mo:
            </p>
            {[
              { on: consentGuardian, set: setConsentGuardian, label: 'Ako ang magulang o legal na guardian nila.' },
              { on: consentSupervise, set: setConsentSupervise, label: 'Ako ang mag-aayos at magbabantay ng mga biyahe nila.' },
              {
                on: consentResponsible,
                set: setConsentResponsible,
                label: 'Ako ang may pananagutan sa paggamit nila ng app.',
              },
            ].map((c) => (
              <label key={c.label} className="flex items-start gap-2 text-[11px] text-amber-900">
                <input
                  type="checkbox"
                  checked={c.on}
                  onChange={(e) => c.set(e.target.checked)}
                  className="mt-0.5 shrink-0"
                />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <BiometricEnrollOption
        ready={biometric.ready}
        wanted={biometric.wanted}
        onChange={biometric.setWanted}
        alreadyEnrolled={biometric.alreadyEnrolled}
      />
      {error && <p className="text-xs font-medium text-amber-700">{error}</p>}
      <button
        onClick={() => void handleSubmit()}
        className="w-full rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700"
      >
        Register
      </button>
    </div>
  )
}

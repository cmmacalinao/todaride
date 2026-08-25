import { useState } from 'react'
import { useRides } from '../context/RideContext'
import { MINOR_AGE_LIMIT } from '../mock/data'
import { EMPTY_PH_ADDRESS, PhAddressFields, type PhAddressValue } from './PhAddressFields'
import { RegistrationOtpStep } from './RegistrationOtpStep'

// A student's contact is by definition the person responsible for them, so
// the list they pick from is narrower than an adult's.
const STUDENT_RELATIONSHIPS = ['Mother', 'Father', 'Grandparent', 'Aunt / Uncle', 'Sibling', 'Legal guardian']
const RELATIONSHIPS = [...STUDENT_RELATIONSHIPS, 'Spouse', 'Child', 'Friend', 'Other']
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
  const { registerPassenger, registerGuardianForStudent } = useRides()
  const [step, setStep] = useState<'otp' | 'profile'>('otp')
  const [isStudent, setIsStudent] = useState(asStudent)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [age, setAge] = useState('')
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [address, setAddress] = useState<PhAddressValue>(EMPTY_PH_ADDRESS)
  const [guardianPhone, setGuardianPhone] = useState('')
  const [guardianName, setGuardianName] = useState('')
  const [guardianRelationship, setGuardianRelationship] = useState('')
  const [error, setError] = useState('')
  const biometric = useBiometricEnrollChoice()

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
    if (ageNum < MINOR_AGE_LIMIT) {
      setError(
        `Passengers under ${MINOR_AGE_LIMIT} can't register on their own — a parent/guardian needs to register them together on the Parent tab.`,
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
    if (isStudent && (!guardianName.trim() || !guardianPhone.trim())) {
      setError("Students need a parent or guardian's name and mobile number as their emergency contact.")
      return
    }
    if (guardianName.trim() && !guardianRelationship.trim()) {
      setError('Say how your emergency contact is related to you.')
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
      guardianPhone: guardianPhone.trim() || null,
      guardianName: guardianName.trim() || null,
      guardianRelationship: guardianRelationship.trim() || null,
      isStudent,
    })
    if (!id) {
      setError('Registration failed. Please try again.')
      return
    }
    // A student's parent/guardian becomes a real Parent record linked to
    // them — the same directory Admin monitors and the guardian can later
    // claim with a code to their own number. Adults keep theirs as a plain
    // emergency contact; there is nobody to give an account to.
    if (isStudent && guardianName.trim() && guardianPhone.trim()) {
      registerGuardianForStudent({
        studentPassengerId: id,
        name: guardianName.trim(),
        phone: guardianPhone.trim(),
        relationship: guardianRelationship.trim() || 'Guardian',
        province: address.province,
        city: address.city,
        barangay: address.barangay,
        addressDetail: address.addressDetail.trim(),
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
        title={asStudent ? 'Register as a student' : 'Register as a passenger'}
        description={
          asStudent
            ? `Registering for yourself, as a student aged ${MINOR_AGE_LIMIT} or over — you'll get the discounted student fare. Registering a child under ${MINOR_AGE_LIMIT}? Use the Parent option instead.`
            : `Registering for yourself, as an adult passenger. Registering a child under ${MINOR_AGE_LIMIT}? Use the Parent tab instead.`
        }
        onVerified={handleVerified}
      />
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
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
        <p className="text-xs font-medium text-slate-600">
          {isStudent ? 'Parent / guardian' : 'Emergency contact'}
          {isStudent ? '' : ' (optional)'}
        </p>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Full name</label>
          <input
            value={guardianName}
            onChange={(e) => setGuardianName(e.target.value)}
            placeholder="e.g. Maria Santos"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Relationship</label>
            <select
              value={guardianRelationship}
              onChange={(e) => setGuardianRelationship(e.target.value)}
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
              value={guardianPhone}
              onChange={(e) => setGuardianPhone(e.target.value)}
              placeholder="09XXXXXXXXX"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <p className="text-[11px] text-slate-400">
          {isStudent
            ? "We'll add them to the Parent directory and link them to you, so they can follow your trips once they confirm. They're also who we notify if you ever trigger SOS."
            : "If you ever trigger SOS and you have no linked parent account, this is who we notify."}
        </p>
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

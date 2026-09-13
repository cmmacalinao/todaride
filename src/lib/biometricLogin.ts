import type { AuthedAccountRole } from '../context/SessionContext'

// What "Fingerprint" unlocks: the account that enrolled on THIS device, plus
// the WebAuthn credential the OS hands back only after a successful biometric
// check. Stored per-device, never synced — same as a real banking app's
// "enable fingerprint on this phone".
export interface BiometricEnrollment {
  credentialId: string
  role: AuthedAccountRole
  id: string
  label: string
}

const STORAGE_KEY = 'tricycle-biometric-v1'

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// These all hand back a plain ArrayBuffer rather than a Uint8Array: WebAuthn's
// BufferSource won't take a view whose backing buffer might be a
// SharedArrayBuffer, which is what a bare `new Uint8Array(n)` widens to.
function fromBase64Url(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='))
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return buffer
}

function encodeUtf8(value: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(value)
  const buffer = new ArrayBuffer(encoded.length)
  new Uint8Array(buffer).set(encoded)
  return buffer
}

function randomChallenge(): ArrayBuffer {
  const buffer = new ArrayBuffer(32)
  crypto.getRandomValues(new Uint8Array(buffer))
  return buffer
}

// Is there a fingerprint/face sensor this browser will actually talk to?
// Desktop browsers without Windows Hello / Touch ID answer false, which is why
// the button reports "not available" instead of silently doing nothing.
export async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!window.PublicKeyCredential || !window.isSecureContext) return false
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export function getBiometricEnrollment(): BiometricEnrollment | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as BiometricEnrollment) : null
  } catch {
    return null
  }
}

export function clearBiometricEnrollment(): void {
  localStorage.removeItem(STORAGE_KEY)
}

// Called right after a successful password login, when the user ticked
// "Enable fingerprint". Returns false (rather than throwing) if they dismiss
// the OS prompt — declining to enrol shouldn't undo the login that just
// succeeded.
export async function enrollBiometric(
  account: { role: AuthedAccountRole; id: string },
  label: string,
): Promise<boolean> {
  if (!(await isBiometricAvailable())) return false
  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge(),
        rp: { name: 'TODA Ride Mobility' },
        user: {
          id: encodeUtf8(`${account.role}:${account.id}`),
          name: label,
          displayName: label,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
        },
        timeout: 60_000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null
    if (!credential) return false
    const enrollment: BiometricEnrollment = {
      credentialId: toBase64Url(credential.rawId),
      role: account.role,
      id: account.id,
      label,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(enrollment))
    return true
  } catch {
    return false
  }
}

// Prompts for the fingerprint and returns the enrolled account on success.
//
// The signature that comes back isn't cryptographically checked, because there
// is no server to check it against — this prototype stores everything in
// localStorage (see RideContext). What the check genuinely provides is the OS
// biometric prompt itself: the browser will not return an assertion at all
// until the device has verified the user. That makes this a real local unlock,
// not a fake one, but it is not remote authentication and shouldn't be
// mistaken for it once a backend exists.
export async function verifyBiometric(): Promise<BiometricEnrollment | null> {
  const enrollment = getBiometricEnrollment()
  if (!enrollment) return null
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        allowCredentials: [
          {
            type: 'public-key',
            id: fromBase64Url(enrollment.credentialId),
          },
        ],
        userVerification: 'required',
        timeout: 60_000,
      },
    })
    return assertion ? enrollment : null
  } catch {
    return null
  }
}

// Whether passwordless login may be offered at all.
//
// The SEND OTP button on the login screen is not a convenience on top of a
// password — it is a way into an account *instead* of one: type a mobile
// number, enter the code, and you are whoever that number belongs to. Its
// entire safety rests on the code being secret.
//
// On the login screen it was not. OtpVerify's `sendRealSms` defaults to false
// and AppLoginForm never passed it, so the code was generated in the browser
// and printed on the screen that asked for it. Anyone could type a registered
// number, read the four digits off the glass, and be inside that account —
// every driver, passenger and parent in the app.
//
// The reasoning behind not texting it was sound as far as it went, and is
// worth keeping: a returning user proved their number at registration, so
// re-texting them spends a Semaphore credit to re-prove a known fact, and a
// mistyped number or an impatient second tap costs the same as a real one.
// That is a good argument about cost. It is not an argument about
// authentication, and the button it sat behind was handing out accounts.
//
// So the rule here is simply: offer passwordless login only when a real code
// will actually be sent to the phone. Otherwise the button is not drawn, and
// the password and "Forgot password?" paths — which work today — are the way
// in. Hiding a door is a poor fix for a broken lock, but an unlocked door
// that looks locked is worse, and this one can be closed in a line.

export interface PasswordlessLoginAvailability {
  // Super Admin's development shortcut. When on, OtpVerify shows the code on
  // screen whatever else is configured, so passwordless entry is a bypass.
  simulatedOtpEnabled: boolean
  // Whether the login flow is wired to send a genuine SMS — i.e. whether
  // somebody has decided to spend the credits on it.
  sendsRealCode: boolean
}

export function passwordlessLoginAvailable(input: PasswordlessLoginAvailability): boolean {
  if (input.simulatedOtpEnabled) return false
  return input.sendsRealCode
}

// The switch to flip when passwordless login is wanted and paid for.
//
// Turning this on costs one SMS per login attempt, successful or not, which
// is the cost the original design deliberately avoided. It needs deciding on
// purpose rather than drifting on — so it is a named constant with this note
// attached, not a bare `true` buried in a component.
//
// Flipping it also requires SEMAPHORE_API_KEY and SEMAPHORE_SENDER_NAME to be
// set in Netlify, or every attempt fails at the server instead of the phone.
export const OTP_LOGIN_SENDS_REAL_CODE = false

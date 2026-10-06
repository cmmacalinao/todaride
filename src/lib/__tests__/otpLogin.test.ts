import { describe, expect, it } from 'vitest'
import { OTP_LOGIN_SENDS_REAL_CODE, passwordlessLoginAvailable } from '../otpLogin'

describe('passwordlessLoginAvailable', () => {
  // The hole this closes: the login screen generated the code in the browser
  // and displayed it, so anyone could type a registered number, read the
  // four digits, and be inside that account.
  it('is not offered when no real code is sent', () => {
    expect(passwordlessLoginAvailable({ simulatedOtpEnabled: false, sendsRealCode: false })).toBe(false)
  })

  it('is not offered while simulated OTP is on, whatever else is configured', () => {
    // Simulated OTP prints the code on screen by design. Combined with a
    // button that logs you in, that is not weak authentication, it is none.
    expect(passwordlessLoginAvailable({ simulatedOtpEnabled: true, sendsRealCode: true })).toBe(false)
    expect(passwordlessLoginAvailable({ simulatedOtpEnabled: true, sendsRealCode: false })).toBe(false)
  })

  it('is offered only when a genuine code goes to the phone', () => {
    expect(passwordlessLoginAvailable({ simulatedOtpEnabled: false, sendsRealCode: true })).toBe(true)
  })

  it('ships off, so the button is hidden until somebody decides to pay for it', () => {
    // One SMS per login attempt, successful or not. That is a decision to
    // take on purpose, not one to drift into.
    expect(OTP_LOGIN_SENDS_REAL_CODE).toBe(false)
  })
})

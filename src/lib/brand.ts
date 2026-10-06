// The app's names, in one place.
//
// There are three of them and they are not interchangeable:
//
//   APP_FULL_NAME   the official full name, for the landing page and any
//                   formal document. Long on purpose.
//
//   TODA_MEANING    what the acronym stands for, used as a subtitle under
//                   the logo. It is also what TODA means to a rider here —
//                   the tricycle operators' association — so the expansion
//                   is doing double duty and the wording is not casual.
//
//   COMPANY_NAME    who operates the app. Deliberately not shown in most
//                   places yet (see showDeveloperCredit in Super Admin), but
//                   it is NOT optional everywhere: a privacy notice has to
//                   name the personal information controller whether or not
//                   anybody wants the branding, so the terms read it from
//                   here and ignore the toggle.
//
// Kept out of index.html, the PWA manifest, the Capacitor appName and the
// Android app_name for now — those are what a phone shows on its home screen
// and in its app list, and changing them is a separate decision with an
// install-time cost.

export const APP_FULL_NAME =
  'TODA Ride Mobility — Transport & Opportunity Digital Access Ride Mobility App'

export const TODA_MEANING = 'Transport & Opportunity Digital Access'

export const COMPANY_NAME = 'GreenTech Innovations OPC'

// The credit line, when it is shown at all. One sentence, because a footer
// that needs a paragraph is an About page.
export const DEVELOPER_CREDIT = `Developed and operated by ${COMPANY_NAME}`

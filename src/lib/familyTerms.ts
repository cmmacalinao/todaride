// Family Plan — Terms and Conditions (2026-09-23).
//
// Accepted once by the account holder when they activate the Family Plan
// (see FamilyActivation). The version is stored with the acceptance, so a
// later change to these terms can ask everyone to accept the new ones.
//
// DRAFT for the pilot: written to cover what the Family Plan actually does
// (adults booking and following rides for family members, including minors),
// with the Philippine laws it touches named. It must be reviewed by a lawyer
// admitted in the Philippines before it is relied on.

export const FAMILY_TERMS_VERSION = '2026-09-23'

export const FAMILY_PLAN_FREE_MONTHS = 12
export const FAMILY_PLAN_MONTHLY_PRICE = 500

export interface TermsSection {
  title: string
  body: string[]
}

export const FAMILY_TERMS: TermsSection[] = [
  {
    title: '1. What the Family Plan is',
    body: [
      'The Family Plan lets an adult account holder ("you") book tricycle rides for members of their family, including minors, add and invite family members, choose trusted drivers, and follow those rides live in the TODA Ride Mobility app ("the App").',
      'The App is a booking platform. Rides are provided by tricycle drivers who are members of their TODA and operate under a franchise issued by their local government unit. The drivers are not employees of the App.',
    ],
  },
  {
    title: '2. Who may activate it',
    body: [
      'You must be at least 18 years old.',
      'For any family member under 18 whom you add or book for, you confirm that you are their parent or legal guardian, or that you are an adult authorized by their parent or legal guardian to arrange their transport.',
      'Under the Civil Code of the Philippines a minor cannot give valid consent to a contract. Minors therefore do not accept these terms themselves. You accept them on their behalf, as the person exercising parental authority or acting with it (Family Code of the Philippines).',
    ],
  },
  {
    title: '3. Minors use the App only through the Family Plan',
    body: [
      'A person under 18 cannot create an account alone. They may only join through a personal Family invite sent by you, and their account stays linked to your family.',
      'You are responsible for deciding whether a minor is old and mature enough to ride without an accompanying adult. You must follow any city or municipal ordinance on minors riding tricycles, school rules, and the directions of the TODA.',
      'Young children should be accompanied by an adult. The App may require an accompanying adult for a ride, and a driver may refuse a ride that appears unsafe for a child.',
    ],
  },
  {
    title: '4. Safety while riding',
    body: [
      'A child must ride inside the sidecar, seated, and never as a back-ride passenger behind the driver. This is in line with Republic Act No. 10666 (Children\'s Safety on Motorcycles Act of 2015) and local tricycle ordinances.',
      'You must give a correct pickup point and destination, and make sure someone responsible is there to receive the child at the destination.',
      'You must stay reachable by phone or by the App\'s chat during the ride. On a Family ride, the driver contacts you, the person who booked, not the child.',
      'The App\'s Safety and SOS tools help in an emergency but are not an emergency service. In an emergency, call 911.',
    ],
  },
  {
    title: '5. Protection of children',
    body: [
      'The App has zero tolerance for any abuse, exploitation, harassment or endangerment of a child, as defined in Republic Act No. 7610 (Special Protection of Children Against Abuse, Exploitation and Discrimination Act) and Republic Act No. 11313 (Safe Spaces Act).',
      'Any report involving a child will be acted on immediately. The App may suspend a driver or an account while a report is reviewed, and will preserve trip records and cooperate with the police, the DSWD, the barangay, the LGU and the TODA as the law requires.',
      'You may not use the Family Plan to arrange transport for a child you have no authority over, or for any unlawful purpose.',
    ],
  },
  {
    title: '6. Personal data of family members, including minors',
    body: [
      'Personal data is processed under Republic Act No. 10173 (Data Privacy Act of 2012). For each family member the App processes their name, mobile number (optional), pickup and destination, trip records, and live location during a ride.',
      'This data is used only to provide the ride, keep the rider safe (live tracking, safety alerts, SOS), settle payment, and meet legal obligations. A minor\'s data is never used for advertising or marketing.',
      'Live location is shared with you and with the driver only during an active ride.',
      'By activating, you give consent on behalf of each minor you add, as their parent or legal guardian. An adult family member gives their own consent when they join through your invite.',
      'You and your family members may ask to access, correct or delete personal data, or withdraw consent, through Contact us. Withdrawing consent for a minor removes them from the Family Plan. Trip records may be kept for as long as the law requires. Complaints may be raised with the National Privacy Commission.',
    ],
  },
  {
    title: '7. Trusted drivers',
    body: [
      'A trusted driver you choose is offered your family\'s requests first. Choosing a driver does not make the App responsible for that driver beyond its obligations under these terms, and you can remove a trusted driver at any time.',
    ],
  },
  {
    title: '8. Fares, payment and the promo',
    body: [
      `The Family Plan is free for ${FAMILY_PLAN_FREE_MONTHS} months from activation as an introductory promo (regular price ₱${FAMILY_PLAN_MONTHLY_PRICE}/month). Ride fares are separate and are paid per ride, by the rider or by you in the App, as set for each family member.`,
      'Nothing is charged automatically when the free period ends. You will be asked whether you want to continue, and at what price, before any plan fee applies.',
    ],
  },
  {
    title: '9. Limitation of liability',
    body: [
      'To the extent the law allows, the App is not liable for acts or omissions of drivers, TODAs or third parties, or for delays caused by traffic, weather or events outside its control.',
      'Nothing in these terms limits any liability that cannot be limited under Philippine law, including under Republic Act No. 7394 (Consumer Act of the Philippines).',
    ],
  },
  {
    title: '10. Suspension, changes and governing law',
    body: [
      'The App may suspend or end the Family Plan for misuse, false information, or any risk to a child.',
      'These terms may be updated. If they change, you will be asked to accept the new version before the Family Plan can be used again.',
      'Your electronic acceptance (the boxes you tick and the name you type) is a valid signature under Republic Act No. 8792 (Electronic Commerce Act of 2000).',
      'These terms are governed by the laws of the Republic of the Philippines.',
    ],
  },
]

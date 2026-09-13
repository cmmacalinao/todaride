import terminalSeed from './terminals.seed.json'
import type {
  PaymentAccountDetails,
  Terminal,
  AccountingOfficer,
  EmergencyHotline,
  AdSenseSettings,
  Advertiser,
  Campaign,
  CorporateRegistrationInfo,
  DocumentType,
  Driver,
  DriverDocuments,
  DriverReportReason,
  EquityAllocation,
  ExpenseCategory,
  GeoCoords,
  Landmark,
  LandmarkCategory,
  MapBoundary,
  IncomePromotionSettings,
  Franchise,
  MedicineProduct,
  MockLocation,
  Operator,
  Parent,
  ParentLink,
  Passenger,
  PaymentMethod,
  Pharmacy,
  RewardRules,
  Ride,
  RideCreditTier,
  SaasPlan,
  TariffSettings,
  TodaExpenseCategory,
  TodaOrganization,
} from '../types'
import { haversineDistanceMeters } from '../lib/geo'

export const DOCUMENT_TYPES: DocumentType[] = ['nbiClearance', 'driversLicense', 'ltoRegistration', 'lguRegistration']

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  nbiClearance: 'NBI / Police Clearance',
  driversLicense: "Driver's License",
  ltoRegistration: 'LTO Registration (OR/CR)',
  lguRegistration: 'LGU / TODA Registration',
}

function submittedDocs(): DriverDocuments {
  return {
    nbiClearance: { submitted: true, dataUrl: null },
    driversLicense: { submitted: true, dataUrl: null },
    ltoRegistration: { submitted: true, dataUrl: null },
    lguRegistration: { submitted: true, dataUrl: null },
  }
}

// City/province are the same for every location below — the whole app is
// scoped to a single city service area (San Jose City, Nueva Ecija), so only
// barangay actually varies. Tags exist purely for the location search/filter
// UI — the x/y coords are still what drives the ride simulation. Every
// sample driver/passenger/parent/TODA below shares this same city on
// purpose: a TODA's operation is inter-barangay within one city (or a
// neighboring town), so keeping everyone in the same real city makes that
// easy to test — pick two different real barangays and the fare/ETA/routing
// all reflect an actual, sane distance between them.
const TOWN_PROVINCE = 'Nueva Ecija'
const TOWN_CITY = 'San Jose City'

// Real approximate coordinates anchored around San Jose City, Nueva Ecija so
// the OpenStreetMap live-tracking view has somewhere real to draw —
// illustrative placements within the city (picked to land in the named
// barangay's general area), not surveyed addresses.
// `coords` (the abstract 0-100 x/y grid) is a linear proportional mapping of
// each point's real `gps` onto that range — x from longitude, y from
// latitude, scaled across this set's min/max — NOT arbitrary placement.
// getPriorityTodaOrgId() (below) compares pickups against TODA terminals
// using only this grid, so it has to stay geographically consistent with the
// real gps/barangay or dispatch silently routes to the wrong TODA (a pickup
// can end up "closer" on the grid to a terminal that's actually towns away
// in real life). Re-derive these any time a location's gps changes.
export const MOCK_LOCATIONS: MockLocation[] = [
  {
    id: 'loc-home-1',
    label: 'Sitio Maligaya, Crisanto Sanchez Poblacion',
    coords: { x: 69, y: 68 },
    gps: { lat: 15.7940977, lng: 120.9905849 },
    province: TOWN_PROVINCE,
    city: TOWN_CITY,
    barangay: 'Crisanto Sanchez Poblacion',
  },
  {
    id: 'loc-home-2',
    label: 'Purok 3, Barangay San Agustin',
    coords: { x: 100, y: 46 },
    gps: { lat: 15.77, lng: 121.01 },
    province: TOWN_PROVINCE,
    city: TOWN_CITY,
    barangay: 'San Agustin',
  },
  {
    id: 'loc-terminal',
    label: 'Public Market Terminal',
    coords: { x: 69, y: 68 },
    gps: { lat: 15.7940977, lng: 120.9905849 },
    province: TOWN_PROVINCE,
    city: TOWN_CITY,
    barangay: 'Crisanto Sanchez Poblacion',
  },
  {
    id: 'loc-school-1',
    label: 'Sto. Nino Elementary School',
    coords: { x: 52, y: 87 },
    gps: { lat: 15.815, lng: 120.98 },
    province: TOWN_PROVINCE,
    city: TOWN_CITY,
    barangay: 'Santo Niño 1st',
  },
  {
    id: 'loc-school-2',
    label: 'Municipal National High School',
    coords: { x: 77, y: 75 },
    gps: { lat: 15.8019002, lng: 120.995624 },
    province: TOWN_PROVINCE,
    city: TOWN_CITY,
    barangay: 'Malasin',
  },
  {
    id: 'loc-church',
    label: 'San Juan Parish Church',
    coords: { x: 44, y: 37 },
    gps: { lat: 15.76, lng: 120.975 },
    province: TOWN_PROVINCE,
    city: TOWN_CITY,
    barangay: 'San Juan',
  },
  {
    id: 'loc-hospital',
    label: 'District Hospital',
    coords: { x: 35, y: 0 },
    gps: { lat: 15.718135, lng: 120.969148 },
    province: TOWN_PROVINCE,
    city: TOWN_CITY,
    barangay: 'Tondod',
  },
  {
    id: 'loc-mall',
    label: 'Town Center Mall',
    coords: { x: 20, y: 100 },
    gps: { lat: 15.83, lng: 120.96 },
    province: TOWN_PROVINCE,
    city: TOWN_CITY,
    barangay: 'Manicla',
  },
  // Two real, user-confirmed San Jose City, Nueva Ecija locations — precise
  // anchors so they don't need to be re-geocoded (and re-billed against
  // Nominatim's rate limit) on every booking. Coordinates came from live
  // Nominatim lookups the user corroborated against real-world knowledge
  // (distance between the two checked out to ~3.1km, matching the "2
  // barangays apart, 3-4km" the user gave).
  {
    id: 'loc-bosca-greentech',
    label: 'Bosca by Greentech (front of Roseville Subd.)',
    coords: { x: 0, y: 27 },
    gps: { lat: 15.7480428, lng: 120.9472983 },
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'Santo Tomas',
  },
  {
    id: 'loc-caanawan-nhs',
    label: 'Caanawan National High School',
    coords: { x: 26, y: 47 },
    gps: { lat: 15.7709428, lng: 120.9637338 },
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'Caanawan',
  },
  // The default Pabili "deliver to" destination — OpenStreetMap has no POI
  // tagged specifically as San Jose City's public market, so this is derived
  // rather than geocoded directly: Nominatim locates Saint Joseph the Worker
  // Cathedral at 15.7921012, 120.9895791 (Rafael Rueda Sr. Poblacion, on
  // Maharlika Highway), and per public sources the market sits ~230m
  // northeast of the cathedral — this is that offset point. For any city
  // other than San Jose City, PassengerPage looks up "Public Market" for
  // that city live via resolvePhAddress/geocodeAddress instead of using this
  // fixed point.
  {
    id: 'loc-public-market-sjc',
    // City in the label to match every other city-centre pin — a bare
    // "Public Market" in the From row says nothing about which town.
    label: 'Public Market, San Jose City',
    coords: { x: 60, y: 63 },
    gps: { lat: 15.793564, lng: 120.991099 },
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'Rafael Rueda, Sr. Poblacion',
  },
]

// Simulated driver starting point (tricycle terminal) used before a driver
// reaches the passenger's pickup point.
export const DRIVER_BASE_COORDS = { x: 50, y: 50 }
export const DRIVER_BASE_LABEL = 'Tricycle Terminal'
// Real terminal-type landmark (San Jose City Public Market) — every mock
// location, driver, passenger, parent, and TODA now shares this same real
// city, so this is a genuinely central, close starting point for all of them.
export const DRIVER_BASE_GPS = { lat: 15.7940977, lng: 120.9905849 }

// All 38 official barangays of San Jose City, Nueva Ecija — cross-checked
// against PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/san-jose.html) and
// Wikimedia Commons' barangay category, spelling per PhilAtlas where the two
// disagreed (e.g. "Villa Floresca"). Replaces an earlier, smaller subset
// that included "Licaong" — dropped here since neither source lists it as
// one of San Jose City's actual barangays.
const SAN_JOSE_CITY_BARANGAYS = [
  'A. Pascual',
  'Abar 1st',
  'Abar 2nd',
  'Bagong Sikat',
  'Caanawan',
  'Calaocan',
  'Camanacsacan',
  'Canuto Ramos Poblacion',
  'Crisanto Sanchez Poblacion',
  'Culaylay',
  'Dizol',
  'Ferdinand E. Marcos Poblacion',
  'Kaliwanagan',
  'Kita-Kita',
  'Malasin',
  'Manicla',
  'Palestina',
  'Parang Mangga',
  'Pinili',
  'Porais',
  'Rafael Rueda, Sr. Poblacion',
  'Raymundo Eugenio Poblacion',
  'San Agustin',
  'San Juan',
  'San Mauricio',
  'Santo Niño 1st',
  'Santo Niño 2nd',
  'Santo Niño 3rd',
  'Santo Tomas',
  'Sibut',
  'Sinipit Bubon',
  'Tabulac',
  'Tayabo',
  'Tondod',
  'Tulat',
  'Villa Floresca',
  'Villa Joson',
  'Villa Marina',
]

// All 37 official barangays of Science City of Muñoz, Nueva Ecija —
// cross-checked against PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/
// munoz.html), Wikipedia, and BarangayDirectory.com, all three in exact
// agreement (including tricky cases like "Rang-ayan" and "Villa Cuizon").
const SCIENCE_CITY_MUNOZ_BARANGAYS = [
  'Bagong Sikat',
  'Balante',
  'Bantug',
  'Bical',
  'Cabisuculan',
  'Calabalabaan',
  'Calisitan',
  'Catalanacan',
  'Curva',
  'Franza',
  'Gabaldon',
  'Labney',
  'Licaong',
  'Linglingay',
  'Magtanggol',
  'Maligaya',
  'Mangandingay',
  'Mapangpang',
  'Maragol',
  'Matingkis',
  'Naglabrahan',
  'Palusapis',
  'Pandalla',
  'Poblacion East',
  'Poblacion North',
  'Poblacion South',
  'Poblacion West',
  'Rang-ayan',
  'Rizal',
  'San Andres',
  'San Antonio',
  'San Felipe',
  'Sapang Cawayan',
  'Villa Cuizon',
  'Villa Isla',
  'Villa Nati',
  'Villa Santos',
]

// CLSU (Central Luzon State University) sits within Science City of Muñoz
// but isn't itself one of its 37 official barangays — added as its own
// special entry (alongside the real barangays above) so campus bookings can
// pick a specific building/facility instead of falling back to a generic
// barangay pin. Placed first since it's this app's primary/default area.
SCIENCE_CITY_MUNOZ_BARANGAYS.unshift('CLSU')

// Anchor for CLSU's main campus (Academic Ave / main gate area) — matches
// the university's actual published location, not a rough guess. Every
// specific CLSU place below is jittered off this single point (see
// getClsuPlaceGps) since the real campus spans several hundred hectares and
// per-building coordinates aren't worth surveying for a prototype, but the
// jitter now stays centered on real campus ground instead of drifting into
// neighboring barangays.
export const CLSU_GPS: GeoCoords = { lat: 15.73299, lng: 120.931426 }

// Default "current location" for starting a Ride/Pabili/Buy Medicine
// booking — CLSU, rather than each passenger's own registered home address.
// Temporary/demo default, not a permanent replacement for the passenger's
// real address (which is still what registration and the "Booking as" panel
// use) — see PassengerPage.tsx/QuickBookingForm.tsx's booking-default seeds.
// Seeded into slot 1 so the ad box is never empty on a fresh install. Lives
// in /public rather than as a data URL — a base64 copy of a real banner in
// the seed would bloat every stored state blob for no reason.
export const MOCK_BANNER_ADS: (import('../types').BannerAd | null)[] = [
  { id: 'ad-seed-1', imageUrl: '/ads/toda-saferide-banner.webp', caption: 'TODA Ride Mobility — Safe Rides for You and Your Family' },
  null,
  null,
  null,
]

export const DEFAULT_BOOKING_PROVINCE = 'Nueva Ecija'
export const DEFAULT_BOOKING_CITY = 'Science City of Muñoz'
export const DEFAULT_BOOKING_BARANGAY = 'CLSU'
export const DEFAULT_BOOKING_ADDRESS_DETAIL = 'CLSU Main Gate'

// Where a booking lands first when the passenger picks a city but has not yet
// picked a barangay. Both are the busiest origin/destination in their city —
// CLSU for Muñoz, the Poblacion/cathedral area for San Jose — so the common
// case needs no extra tap. A city with no entry here keeps the blank
// "Select barangay" prompt rather than guessing.
export const CITY_DEFAULT_BARANGAY: Record<string, string> = {
  'Science City of Muñoz': 'CLSU',
}

export function defaultBarangayForCity(city: string): string {
  return CITY_DEFAULT_BARANGAY[city] ?? ''
}

export const CLSU_MAIN_GATE_LOCATION: MockLocation = {
  id: 'loc-clsu-main-gate',
  label: 'CLSU Main Gate, Science City of Muñoz',
  coords: { x: 15, y: 20 },
  gps: CLSU_GPS,
  province: DEFAULT_BOOKING_PROVINCE,
  city: DEFAULT_BOOKING_CITY,
  barangay: DEFAULT_BOOKING_BARANGAY,
}
// MOCK_LOCATIONS is declared earlier in this file — appended here (instead
// of inline in that array literal) since CLSU_MAIN_GATE_LOCATION depends on
// CLSU_GPS, which is itself declared after MOCK_LOCATIONS.
MOCK_LOCATIONS.push(CLSU_MAIN_GATE_LOCATION)

// Default destination. Every other MOCK_LOCATION sits in San Jose City (see
// TOWN_CITY), so using one of those as the initial drop-off opened the app
// showing a Muñoz pickup against a San Jose destination — and the City box,
// which follows whichever end is being edited, would flip between the two.
// A Muñoz destination makes the opening state internally consistent: one
// city across City, From and Where to, with an inter-city trip something the
// passenger chooses rather than something they start out in by accident.
// Coordinates are the Muñoz town proper / public market area, a short hop
// down Maharlika Highway from the CLSU gate.
export const DEFAULT_DROPOFF_LOCATION: MockLocation = {
  id: 'loc-munoz-public-market',
  label: 'Muñoz Public Market, Science City of Muñoz',
  coords: { x: 18, y: 26 },
  gps: { lat: 15.71581, lng: 120.90477 },
  province: DEFAULT_BOOKING_PROVINCE,
  city: DEFAULT_BOOKING_CITY,
  barangay: 'Poblacion East',
}
MOCK_LOCATIONS.push(DEFAULT_DROPOFF_LOCATION)

export interface ClsuLocationGroup {
  group: string
  places: string[]
}

// Selectable CLSU campus places, grouped for the "CLSU place" dropdown that
// BarangayAddressPicker shows once barangay === 'CLSU' (see resolvePhAddress
// in lib/customLocation.ts for how a pick here turns into a real map point).
// Kept free of exact-duplicate names across groups — "College of Agriculture"
// lives only under Agriculture, not also under Academic Buildings.
export const CLSU_LOCATION_GROUPS: ClsuLocationGroup[] = [
  {
    group: 'Academic Buildings',
    places: ['Administration Building', 'College of Engineering', 'College of Education', 'College of Science', 'CBAA'],
  },
  {
    group: 'Student Facilities',
    places: ['Library', 'Gymnatorium', 'Umali Gym', 'Dormitories'],
  },
  {
    group: 'Food & Commercial',
    places: ['Food Park', 'Old Market', 'Canteens'],
  },
  {
    group: 'Parks & Recreation',
    places: ['Rizal Park', 'Lingap Kalikasan Park', 'Botanical Garden', 'Oval'],
  },
  {
    group: 'University Administration',
    places: [
      'Office of the President',
      'Office of the VPs',
      'University Registrar',
      'Accounting Office',
      'Cashier',
      'HR Management Office',
      'Procurement Office',
      'Supply Office',
      'University Legal Office',
      'Univ. Planning Office',
      'Internal Audit',
      'MIS Office',
      'Public Affairs Office',
      'Office of Student Affairs',
    ],
  },
  {
    group: 'Research',
    places: [
      'Univ. Research Office',
      'Research Laboratories',
      'Agri Research Centers',
      'Experimental Farms',
      'Crop Research Facilities',
      'Animal Research Facilities',
      'Fisheries Facilities',
      'Soil/Water Laboratories',
      'Agri Engineering Labs',
    ],
  },
  {
    group: 'Agriculture',
    places: [
      'College of Agriculture',
      'Crop Science Facilities',
      'Animal Science Facilities',
      'Dairy Facilities',
      'Poultry Facilities',
      'Swine Facilities',
      'Agri Machinery Facilities',
      'Irrigation Facilities',
      'Demonstration Farms',
      'Organic Agri Facilities',
    ],
  },
  {
    group: 'Specialized CLSU Centers',
    places: [
      'PhilMech',
      'PCC',
      'PhiSCAT',
      'Carabao Center (PCC)',
      'PhilMech-Related Facilities',
      'CLAARRDEC Facilities',
      'Food Processing Facilities',
      'Postharvest Facilities',
      'Biotechnology Facilities',
    ],
  },
  {
    group: 'Other',
    places: ['Infirmary', 'Post Office', 'Museum', 'Main Gate', 'Second Gate', 'Gates', 'Parking Areas'],
  },
]

// Deterministic per-place jitter around CLSU_GPS (same input always gives
// the same output) so different campus places land at visually distinct —
// but reproducible — map points without needing a real survey or a live
// geocoding call that likely wouldn't resolve informal names like
// "Umali Gym" or "CBAA". Capped at ~±330m so every place stays on real
// campus ground near the actual entrance/Academic Ave anchor instead of
// drifting into a neighboring barangay.
const CLSU_PLACE_EXACT_GPS: Record<string, GeoCoords> = {
  'Main Gate': CLSU_GPS,
  Gates: CLSU_GPS,
  'Second Gate': { lat: 15.73509, lng: 120.93432 },
  'Old Market': { lat: 15.73237, lng: 120.92668 },
}

export function getClsuPlaceGps(place: string): GeoCoords {
  const exact = CLSU_PLACE_EXACT_GPS[place]
  if (exact) return exact
  let hash = 0
  for (let i = 0; i < place.length; i++) hash = (hash * 31 + place.charCodeAt(i)) >>> 0
  const jitterLat = ((hash % 1000) / 1000 - 0.5) * 0.006
  const jitterLng = (((hash >>> 10) % 1000) / 1000 - 0.5) * 0.006
  return { lat: CLSU_GPS.lat + jitterLat, lng: CLSU_GPS.lng + jitterLng }
}

// One Landmark per CLSU_LOCATION_GROUPS place that a real OSM feature
// actually backs — cross-checked against Overpass data for named
// nodes/ways on campus (query: everything with a `name` tag within ~1.2km
// of CLSU_GPS). A hash-based jitter around CLSU_GPS used to fill in
// whichever places OSM had no separate tag for, but a fabricated offset
// implies a precision the app doesn't have — a rider searching "HR
// Management Office" and landing on a made-up point a street away is worse
// than that office simply not coming up in landmark search yet. Anywhere
// OSM only tags the college/department generally (e.g. "Department of
// Animal Science" for "Animal Science Facilities") that's used as the best
// available real point; anywhere nothing on campus matches at all
// (most of University Administration's individual offices, most of
// Research's individual labs), the place is left out rather than guessed.
// Main Gate/Second Gate/Gates are left out too: landmark-2 and landmark-8
// below already cover the campus's two gates under clearer, hand-written
// names.
const CLSU_PLACE_REAL_GPS: Record<string, { gps: GeoCoords; category: LandmarkCategory }> = {
  'Administration Building': { gps: { lat: 15.7313583, lng: 120.9302984 }, category: 'school' },
  'College of Engineering': { gps: { lat: 15.7354326, lng: 120.9322581 }, category: 'school' },
  'College of Education': { gps: { lat: 15.7379398, lng: 120.9375388 }, category: 'school' },
  'College of Science': { gps: { lat: 15.7372798, lng: 120.9350991 }, category: 'school' },
  CBAA: { gps: { lat: 15.7370428, lng: 120.9337395 }, category: 'school' },
  Library: { gps: { lat: 15.7367026, lng: 120.9340624 }, category: 'school' },
  'Umali Gym': { gps: { lat: 15.7318278, lng: 120.9308277 }, category: 'other' },
  'Rizal Park': { gps: { lat: 15.7343966, lng: 120.9294651 }, category: 'other' },
  'Lingap Kalikasan Park': { gps: { lat: 15.7425458, lng: 120.9344027 }, category: 'other' },
  Oval: { gps: { lat: 15.7364904, lng: 120.9317515 }, category: 'other' },
  'Public Affairs Office': { gps: { lat: 15.7312489, lng: 120.929252 }, category: 'government' },
  'Office of Student Affairs': { gps: { lat: 15.7315033, lng: 120.927895 }, category: 'government' },
  'Experimental Farms': { gps: { lat: 15.7375264, lng: 120.9277772 }, category: 'other' },
  'College of Agriculture': { gps: { lat: 15.735851, lng: 120.9408756 }, category: 'school' },
  'Animal Science Facilities': { gps: { lat: 15.740587, lng: 120.9310521 }, category: 'school' },
  'Dairy Facilities': { gps: { lat: 15.7388929, lng: 120.9318645 }, category: 'market' },
  'Irrigation Facilities': { gps: { lat: 15.7269059, lng: 120.9274869 }, category: 'other' },
  PhilMech: { gps: { lat: 15.741101, lng: 120.9392823 }, category: 'school' },
  PCC: { gps: { lat: 15.7401121, lng: 120.9329905 }, category: 'school' },
  PhiSCAT: { gps: { lat: 15.7395755, lng: 120.941321 }, category: 'school' },
  'Carabao Center (PCC)': { gps: { lat: 15.7428058, lng: 120.9355265 }, category: 'school' },
  Infirmary: { gps: { lat: 15.7304401, lng: 120.9278993 }, category: 'hospital' },
  'Post Office': { gps: { lat: 15.7336008, lng: 120.9291951 }, category: 'government' },
}

function clsuLandmarkId(place: string): string {
  return `landmark-clsu-${place
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')}`
}

const CLSU_CAMPUS_LANDMARKS: Landmark[] = CLSU_LOCATION_GROUPS.flatMap((group) =>
  group.places
    .filter((place) => CLSU_PLACE_REAL_GPS[place])
    .map((place) => ({
      id: clsuLandmarkId(place),
      name: `${place}, CLSU`,
      aliases: [place.toLowerCase()],
      category: CLSU_PLACE_REAL_GPS[place].category,
      city: DEFAULT_BOOKING_CITY,
      gps: CLSU_PLACE_REAL_GPS[place].gps,
      todaOrgId: null,
    })),
)

// Real coordinates for every San Jose City / Science City of Muñoz barangay
// OSM actually has a record of, resolved via Nominatim's structured search
// (city=<barangay name>, state=Nueva Ecija — OSM tags each as its own place
// node, but a freeform "<barangay>, San Jose City, Nueva Ecija" query misses
// most of them; see the live search fallback in lib/geocode.ts for where
// that same freeform approach is still the right call for arbitrary typed
// text). Looked up once and pinned here rather than geocoded live, the same
// reasoning as CLSU_GPS above: a landmark needs a fixed point, not a live
// network call on every render. Two barangays (Cabisuculan, Curva — both in
// Muñoz) aren't in this list at all: OSM has no record of either one under
// any spelling tried, confirmed against Overpass too, and a guessed point
// would be worse than the barangay simply not showing up in landmark search
// yet (see barangayLandmarks' filter below).
const SAN_JOSE_CITY_BARANGAY_GPS: Record<string, GeoCoords> = {
  'A. Pascual': { lat: 15.6979411, lng: 120.9681228 },
  'Abar 1st': { lat: 15.7891047, lng: 120.9816902 },
  'Abar 2nd': { lat: 15.7820301, lng: 120.9696677 },
  'Bagong Sikat': { lat: 15.7350168, lng: 121.0390535 },
  Caanawan: { lat: 15.7709428, lng: 120.9637338 },
  Calaocan: { lat: 15.7851405, lng: 120.9887273 },
  Camanacsacan: { lat: 15.7670359, lng: 120.9800881 },
  'Canuto Ramos Poblacion': { lat: 15.7899048, lng: 120.9924156 },
  'Crisanto Sanchez Poblacion': { lat: 15.7880629, lng: 120.9936997 },
  Culaylay: { lat: 15.783984, lng: 121.0261845 },
  Dizol: { lat: 15.7355973, lng: 120.9873086 },
  'Ferdinand E. Marcos Poblacion': { lat: 15.7935316, lng: 120.992775 },
  Kaliwanagan: { lat: 15.8105908, lng: 121.0330488 },
  'Kita-Kita': { lat: 15.8225829, lng: 121.0091579 },
  Malasin: { lat: 15.8053704, lng: 121.0004139 },
  Manicla: { lat: 15.8344558, lng: 121.0209408 },
  Palestina: { lat: 15.7700742, lng: 121.018283 },
  'Parang Mangga': { lat: 15.7378395, lng: 121.002742 },
  Pinili: { lat: 15.7689916, lng: 121.0363888 },
  Porais: { lat: 15.7556212, lng: 121.043458 },
  'Rafael Rueda, Sr. Poblacion': { lat: 15.793125, lng: 120.990024 },
  'Raymundo Eugenio Poblacion': { lat: 15.7892803, lng: 120.9915947 },
  'San Agustin': { lat: 15.8018035, lng: 121.0133339 },
  'San Juan': { lat: 15.7721134, lng: 121.0545426 },
  'San Mauricio': { lat: 15.6879285, lng: 120.971261 },
  'Santo Niño 1st': { lat: 15.7966799, lng: 120.9882796 },
  'Santo Niño 2nd': { lat: 15.7972142, lng: 120.9744581 },
  'Santo Niño 3rd': { lat: 15.8145726, lng: 120.9600413 },
  'Santo Tomas': { lat: 15.7550687, lng: 120.951764 },
  Sibut: { lat: 15.7887899, lng: 121.0006776 },
  'Sinipit Bubon': { lat: 15.7448212, lng: 120.9724674 },
  Tabulac: { lat: 15.7485995, lng: 121.0036111 },
  Tayabo: { lat: 15.833017, lng: 121.032292 },
  Tondod: { lat: 15.7182618, lng: 120.9699306 },
  Tulat: { lat: 15.7585047, lng: 121.0079446 },
  'Villa Floresca': { lat: 15.8487818, lng: 120.9853774 },
  'Villa Joson': { lat: 15.7461207, lng: 121.0532879 },
  'Villa Marina': { lat: 15.7954127, lng: 121.0308837 },
}

const SCIENCE_CITY_MUNOZ_BARANGAY_GPS: Record<string, GeoCoords> = {
  'Bagong Sikat': { lat: 15.7378068, lng: 120.9230382 },
  Balante: { lat: 15.732405, lng: 120.9099001 },
  Bantug: { lat: 15.7207017, lng: 120.9201188 },
  Bical: { lat: 15.7428928, lng: 120.9027508 },
  Calabalabaan: { lat: 15.7021991, lng: 120.864442 },
  Calisitan: { lat: 15.7311271, lng: 120.8519724 },
  Catalanacan: { lat: 15.7133148, lng: 120.884859 },
  Franza: { lat: 15.7536881, lng: 120.9049361 },
  Gabaldon: { lat: 15.7259273, lng: 120.8774802 },
  Labney: { lat: 15.6992607, lng: 120.8487886 },
  Licaong: { lat: 15.7504376, lng: 120.9416681 },
  Linglingay: { lat: 15.7659363, lng: 120.8909771 },
  Magtanggol: { lat: 15.7535457, lng: 120.9303533 },
  Maligaya: { lat: 15.6736227, lng: 120.889785 },
  Mangandingay: { lat: 15.7914715, lng: 120.8821526 },
  Mapangpang: { lat: 15.792164, lng: 120.899909 },
  Maragol: { lat: 15.70494, lng: 120.9507743 },
  Matingkis: { lat: 15.7028575, lng: 120.8810261 },
  Naglabrahan: { lat: 15.6787244, lng: 120.8395345 },
  Palusapis: { lat: 15.6835535, lng: 120.8618 },
  Pandalla: { lat: 15.7189408, lng: 120.8560735 },
  'Poblacion East': { lat: 15.7127183, lng: 120.9056555 },
  'Poblacion North': { lat: 15.7210373, lng: 120.9035056 },
  'Poblacion South': { lat: 15.7183677, lng: 120.9057319 },
  'Poblacion West': { lat: 15.7093567, lng: 120.9020412 },
  'Rang-ayan': { lat: 15.7436636, lng: 120.8822036 },
  Rizal: { lat: 15.7642017, lng: 120.9077825 },
  'San Andres': { lat: 15.7754559, lng: 120.9289867 },
  'San Antonio': { lat: 15.6867199, lng: 120.8562834 },
  'San Felipe': { lat: 15.7741932, lng: 120.8981338 },
  'Sapang Cawayan': { lat: 15.7076828, lng: 120.9381585 },
  'Villa Cuizon': { lat: 15.7259221, lng: 120.9425553 },
  'Villa Isla': { lat: 15.7714395, lng: 120.8694147 },
  'Villa Nati': { lat: 15.6933578, lng: 120.9386265 },
  'Villa Santos': { lat: 15.7372837, lng: 120.8713088 },
}

function barangayLandmarkId(city: string, barangay: string): string {
  const citySlug = city === 'San Jose City' ? 'sjc' : 'munoz'
  return `landmark-brgy-${citySlug}-${barangay
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')}`
}

// Only barangays Nominatim actually resolved (see the two GPS maps above)
// become a Landmark — Cabisuculan and Curva (both in Muñoz) aren't in OSM
// under any spelling tried (confirmed against Overpass too, not just
// Nominatim's index), so rather than invent a point for them they're simply
// not searchable yet, same call as the CLSU places above with no real match.
function barangayLandmarks(city: string, barangays: string[], gpsByName: Record<string, GeoCoords>): Landmark[] {
  return barangays
    .filter((b) => b !== 'CLSU' && gpsByName[b]) // CLSU is already its own landmark — see landmark-2 above
    .map((barangay) => ({
      id: barangayLandmarkId(city, barangay),
      name: `${barangay}, ${city}`,
      aliases: [barangay.toLowerCase(), `barangay ${barangay.toLowerCase()}`, `brgy ${barangay.toLowerCase()}`],
      category: 'other' as const,
      city,
      gps: gpsByName[barangay],
      todaOrgId: null,
    }))
}

const BARANGAY_LANDMARKS: Landmark[] = [
  ...barangayLandmarks('San Jose City', SAN_JOSE_CITY_BARANGAYS, SAN_JOSE_CITY_BARANGAY_GPS),
  ...barangayLandmarks('Science City of Muñoz', SCIENCE_CITY_MUNOZ_BARANGAYS, SCIENCE_CITY_MUNOZ_BARANGAY_GPS),
]

// Real named businesses/facilities from OpenStreetMap (Overpass, positive-key
// sweep over both nodes AND ways — a store mapped as a building outline
// rather than a point, e.g. Roper Hardware/Bettbien Montessori, is invisible
// to a node-only query — for: amenity/shop/office/tourism/leisure/craft/
// healthcare, deduped across both cities' bounding boxes since San Jose City
// and Muñoz are adjacent and the padded boxes overlap). Category is inferred
// from the OSM tag — most don't map onto this app's small category set, so
// they land under 'other' rather than being mis-slotted. Excludes OSM's own
// noise for this area: office=telecommunication (cell towers, not
// destinations) and shop=variety_store (every one of ~55 is tagged with the
// proprietor's own name instead of a store name — not something a rider
// would search for) are dropped wholesale, and a few individually-junk names
// (bare "r", phone numbers standing in for a name, a "... Anthony"/"... MBA"
// surveyor-artifact suffix seen repeated across several categories) are
// filtered by name. The bbox is padded generously (~5km past each city's
// outermost barangay) to reach genuine edge-of-town places, so anything that
// bbox catches is additionally required to sit within ~2.2km of one of this
// city's own barangays — without that, "nearest of these two cities"
// mislabels a real place in a neighboring municipality (Talugtug, Llanera,
// Cabaruan…) as if it were here, rather than correctly leaving it out.
const OSM_ESTABLISHMENT_LANDMARKS: Landmark[] = [
  { id: 'landmark-osm-sjc-n429674162', name: 'BPI', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7965836, lng: 120.9939747 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n429674164', name: 'Chinabank', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7966313, lng: 120.9940077 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n429674169', name: 'Southstar Drug', aliases: [], category: 'hospital', city: 'San Jose City', gps: { lat: 15.7931359, lng: 120.9911662 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n429674170', name: 'Mercury Drug', aliases: [], category: 'hospital', city: 'San Jose City', gps: { lat: 15.7922539, lng: 120.9905578 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n429687918', name: 'De Ocampo Tire & Vulcanizing Shop', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.790403, lng: 120.986753 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n429687920', name: 'DHL', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.7907923, lng: 120.9879405 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n429687921', name: 'Diadem Court (Drive-in Hotel)', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.80397, lng: 120.999321 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n429687926', name: 'JSR Auto & Electrical Supply', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7905459, lng: 120.9880583 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n429687927', name: 'LBC', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7904745, lng: 120.9876815 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n429687928', name: 'Magellan\'s Garden Grill & Restobar', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7982411, lng: 120.9945365 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n429687929', name: 'Manson Drug', aliases: [], category: 'hospital', city: 'San Jose City', gps: { lat: 15.7923629, lng: 120.9899965 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n429687930', name: 'Marquez Restaurant', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7979512, lng: 120.9944379 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n429687933', name: 'Mercury Drug', aliases: [], category: 'hospital', city: 'San Jose City', gps: { lat: 15.7943314, lng: 120.9921465 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n429687938', name: 'RCBC', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7902319, lng: 120.9869638 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n429687940', name: 'Shell', aliases: [], category: 'gas_station', city: 'San Jose City', gps: { lat: 15.8025823, lng: 120.9977852 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n429687942', name: 'Tikyo\'s Sizzling House', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7894498, lng: 120.9840237 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n943682544', name: 'Porto Novo Hotel', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.798099, lng: 120.9950769 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n943682555', name: 'Diadem Court', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.8040389, lng: 120.9994448 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n2241654915', name: 'Bits Bytes', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7903557, lng: 120.9866194 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n2241654918', name: 'EastWest Unibank', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7894868, lng: 120.9829366 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n2241654958', name: 'Hotel Albien', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7894289, lng: 120.9826824 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n2241655026', name: 'Petron', aliases: [], category: 'gas_station', city: 'San Jose City', gps: { lat: 15.8044578, lng: 120.9992131 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n2241655086', name: 'NE Super Bodega', aliases: [], category: 'market', city: 'San Jose City', gps: { lat: 15.7810407, lng: 120.9680997 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n2454139156', name: 'Jollibee', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7921567, lng: 120.9901665 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n2454140344', name: 'Goldilocks', aliases: [], category: 'market', city: 'San Jose City', gps: { lat: 15.7922884, lng: 120.9900265 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n2460539879', name: 'I. F. I. Church', aliases: [], category: 'church', city: 'San Jose City', gps: { lat: 15.7521578, lng: 121.0440492 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n2597821978', name: 'Asia United Bank', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7965191, lng: 120.9939299 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n2597822426', name: 'Orix Metro', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7984435, lng: 120.9949056 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n2597824142', name: 'Hotel Francesko', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.8036548, lng: 120.999192 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n2597824218', name: 'Malasin Barangay Hall', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.807366, lng: 121.001504 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n2597829411', name: 'Burger Machine', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.8001373, lng: 120.9962239 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n2597829460', name: '7 eleven', aliases: [], category: 'market', city: 'San Jose City', gps: { lat: 15.8029711, lng: 120.9974081 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n2597846784', name: 'Marquez Restaurant', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.793509, lng: 120.9907457 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n2597850655', name: 'Calaocan Barangay Hall', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.7851574, lng: 120.9885758 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n2598157048', name: 'J & F Department Store', aliases: [], category: 'mall', city: 'San Jose City', gps: { lat: 15.7926518, lng: 120.990878 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n2599234164', name: 'Pinili Barangay Hall', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.7694187, lng: 121.0373376 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n2605946383', name: 'Crisanto Sanchez Barangay Hall', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.7907916, lng: 120.9950385 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n3280608500', name: 'PTT', aliases: [], category: 'gas_station', city: 'San Jose City', gps: { lat: 15.7828036, lng: 120.9704277 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n3281378358', name: 'Milka Krem', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7415568, lng: 120.9414512 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n3281390561', name: 'DAISY Restobar', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7864536, lng: 120.988842 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n3281392724', name: 'All About You', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7903609, lng: 120.9865509 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n3281670087', name: 'Mix and Match Restaurant', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7731242, lng: 120.9644211 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n3281670148', name: 'Old 37', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7857707, lng: 120.9933193 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n3281670149', name: 'Goto King', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7859811, lng: 120.993212 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n3281857331', name: 'JRS Express', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.7912037, lng: 120.9892406 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n3281861273', name: 'Landbank', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7919424, lng: 120.9887938 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n3281861274', name: 'Metrobank', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7922044, lng: 120.9918784 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n3437233431', name: 'PSBank', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7969746, lng: 120.9941991 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n3437233432', name: 'City Savings', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7970592, lng: 120.9942562 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n3622673140', name: 'Ilagan Funeral Homes', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7887822, lng: 120.9814023 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n3765142030', name: 'Farmhouse Hotel & Cafe', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7633756, lng: 120.9577767 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n3930397418', name: 'Kalapaw Hotel', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7649954, lng: 120.9601307 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n3930397419', name: 'Kukai Ichiban Restaurant', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7596266, lng: 120.9556812 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n3930397423', name: 'SSS', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.7806489, lng: 120.9677229 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n3930397425', name: 'Tokyo Suites', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7859584, lng: 120.9729463 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4230867189', name: 'JD\'s Farm', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.74616, lng: 120.954846 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4321245415', name: 'Webpoint', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7917269, lng: 120.9922899 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4336791491', name: 'Jolly Cars Bosch Service', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7599963, lng: 120.9555784 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4338240390', name: 'RRJ', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7932285, lng: 120.9909898 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4338274189', name: 'Index Salon', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7932825, lng: 120.9910419 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4339030310', name: 'Basti\'s Grill', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7829366, lng: 120.9705486 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4339342189', name: 'Mulawin Pandesal', aliases: [], category: 'market', city: 'San Jose City', gps: { lat: 15.7915403, lng: 120.9926122 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4339442603', name: 'Iniang\'s Store', aliases: [], category: 'market', city: 'San Jose City', gps: { lat: 15.7911938, lng: 120.9926601 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4339447894', name: 'Emong\'s Malunggay Pandesal', aliases: [], category: 'market', city: 'San Jose City', gps: { lat: 15.7907049, lng: 120.9877225 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4339498189', name: 'Blue Windbell', aliases: [], category: 'mall', city: 'San Jose City', gps: { lat: 15.792734, lng: 120.991469 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n4355682655', name: 'BluhauzStore Internet Cafe', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7477993, lng: 120.9474547 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4356637199', name: 'Lerma\'s carinderia', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.8056046, lng: 120.9999728 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4362636391', name: 'Day Care Center', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7843869, lng: 120.9915358 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4362658289', name: 'Alpha-Vet', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7914534, lng: 120.99267 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4386506705', name: 'Markus Gamefarm', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7433656, lng: 121.0149422 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4396711602', name: 'Dacoco\'s', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.792707, lng: 120.9954 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4396830690', name: 'Violy\'s Minimart', aliases: [], category: 'market', city: 'San Jose City', gps: { lat: 15.7942039, lng: 120.9920574 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4414519090', name: 'Miapot', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7905108, lng: 120.9900072 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4423010994', name: '5 Star', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.8246271, lng: 121.0152888 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4458716389', name: 'RAQ Rivera Trading, Design and Construction', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7913902, lng: 120.9914101 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4469959089', name: 'The Christian Spiritists in the Philippines Inc. Tulat', aliases: [], category: 'church', city: 'San Jose City', gps: { lat: 15.7575505, lng: 121.0106038 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4559432792', name: 'The Christian Spiritists in the Philippines, Inc. Porais', aliases: [], category: 'church', city: 'San Jose City', gps: { lat: 15.7547305, lng: 121.0376878 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4677681090', name: 'Villa Marina', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.7970795, lng: 121.0369272 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4703053394', name: 'J.S.T. Farm/Pinili Credit Cooperative', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.7681486, lng: 121.0386505 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4717753290', name: 'Marquez Resort, Christianville Subdivision', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.793123, lng: 120.9789116 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4736947884', name: 'Marquez Carinderia', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7933219, lng: 120.9789214 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4736947885', name: 'SAN JOSE MUNICIPAL JAIL (BJMP )', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.809269, lng: 120.99904 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4787733566', name: 'Maurus', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7831832, lng: 120.9707981 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4873154421', name: 'Mariperk Eatery', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.8021368, lng: 120.9980215 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4893328821', name: 'Villa Marina', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.7957098, lng: 121.0311142 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4931720921', name: 'San Jose IPower', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.7788838, lng: 120.9977 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n5119660822', name: 'Aljeanar General Merchandise', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7902349, lng: 120.9861079 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n5124316605', name: 'Agribank', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7907068, lng: 120.9875746 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n5261361223', name: 'The Risen In Christ Global Network Ministry', aliases: [], category: 'church', city: 'San Jose City', gps: { lat: 15.749106, lng: 120.9484583 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n5261361224', name: 'Barit\'s Apartment', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7476963, lng: 120.9473404 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n5357916721', name: 'JBC PS/JESTONINO CRUZ', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7854864, lng: 120.9739625 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n5379786341', name: 'Marzen Kambingan', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.8523977, lng: 121.0214507 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n5379786628', name: 'Chikatz Encarnacion Salon', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7929283, lng: 120.9895116 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n5526545221', name: 'Tambahay', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.8041287, lng: 120.9985886 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n5679861438', name: 'HQ', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.8046796, lng: 120.9979463 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n6381165486', name: 'Amyazing cakes and coffee shop', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7949237, lng: 120.9922645 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n6581165885', name: 'Brgy Culaylay', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.7848406, lng: 121.0231524 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n6585541387', name: 'Jjang Authentic Korean Restaurant', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7834007, lng: 120.971047 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n6842795900', name: 'Fansol Resort, Sto. Niño 2nd', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7990725, lng: 120.966479 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n7509376444', name: 'STI College San Jose', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7920045, lng: 120.9919314 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n7919250086', name: 'Citidrive Driving School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7781788, lng: 120.982069 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n8016459906', name: 'Helen\'s Garden Indoor Plants', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7955804, lng: 120.9807694 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n8016506204', name: 'VMart', aliases: [], category: 'market', city: 'San Jose City', gps: { lat: 15.7929801, lng: 120.9883051 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n8354744157', name: 'IL Ristorante Ti Tayabo', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.8489082, lng: 121.0234541 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n8515644421', name: 'Christian Spiritists Kaliwanagan', aliases: [], category: 'church', city: 'San Jose City', gps: { lat: 15.8099764, lng: 121.0266017 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n8548142718', name: 'Christian Spiritists in the Philippines Inc. Calaocan', aliases: [], category: 'church', city: 'San Jose City', gps: { lat: 15.7834673, lng: 120.9927224 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n8619273691', name: 'Daisy\'s Private Pool', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.8297716, lng: 121.0196431 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n9301065291', name: 'Tugo\'s Brothers General Merchandising', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7892773, lng: 120.9836519 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n9868290717', name: 'Alfamart Canuto Ramos', aliases: [], category: 'market', city: 'San Jose City', gps: { lat: 15.7886023, lng: 120.9921233 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n9869556117', name: 'Alfamart Curamen, Sibut, SJC', aliases: [], category: 'market', city: 'San Jose City', gps: { lat: 15.7895585, lng: 120.9969377 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n9944194517', name: 'Alfamart', aliases: [], category: 'market', city: 'San Jose City', gps: { lat: 15.7752476, lng: 120.9656821 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n10167026417', name: 'staycation', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7695296, lng: 120.9629754 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n10857575105', name: 'Mariah Cali Farm & Resort', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.6729553, lng: 120.9893822 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n10941407305', name: 'fonekingdome', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7939833, lng: 120.9891267 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n10941407306', name: 'Alvin dreamworkz', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7925951, lng: 120.9903921 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n10941407605', name: 'mtc electronicz', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7937565, lng: 120.9890892 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n10945810312', name: '7-Eleven', aliases: [], category: 'market', city: 'San Jose City', gps: { lat: 15.7941481, lng: 120.9888933 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n10945810313', name: '7 eleven', aliases: [], category: 'market', city: 'San Jose City', gps: { lat: 15.7907051, lng: 120.9922226 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n10945810407', name: '7 eleven', aliases: [], category: 'market', city: 'San Jose City', gps: { lat: 15.7914204, lng: 120.9901664 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n10945815009', name: 'alfa mart', aliases: [], category: 'market', city: 'San Jose City', gps: { lat: 15.7682206, lng: 121.0411992 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n10948434609', name: 'alfa mart', aliases: [], category: 'market', city: 'San Jose City', gps: { lat: 15.7885944, lng: 120.9920474 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n10948434710', name: 'alfa mart', aliases: [], category: 'market', city: 'San Jose City', gps: { lat: 15.7895752, lng: 120.9967834 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n10948434907', name: '7-Eleven', aliases: [], category: 'market', city: 'San Jose City', gps: { lat: 15.7825655, lng: 120.970228 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n11103983805', name: 'Bo’s Coffee', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.8027417, lng: 120.9972143 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n12282076378', name: 'KD NATURES FARM', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7197201, lng: 121.0712394 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n12320052901', name: 'Tecno', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7976795, lng: 120.9938416 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n12320053001', name: 'Realme', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7976958, lng: 120.9938573 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n12320053002', name: 'Daily Tech', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7977363, lng: 120.9938137 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n12320053003', name: 'Rulls', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7975669, lng: 120.9939301 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n12320053101', name: 'Bisen', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7976981, lng: 120.9937638 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n12320053102', name: 'Jr. mx memo express', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7976417, lng: 120.9938819 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n12320053201', name: 'Alibaba', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7977356, lng: 120.9937841 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n12320053202', name: 'Oppo', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7977563, lng: 120.9938527 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n12320053204', name: 'Guanzon', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7975397, lng: 120.9939588 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n12320053205', name: 'FoneRange', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7975992, lng: 120.993902 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n12320053301', name: 'Samsung', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7977597, lng: 120.9938362 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n12320053302', name: 'Infinix', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7976953, lng: 120.9938865 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n12320054201', name: 'Vivo', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7977634, lng: 120.9938718 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n12619859134', name: 'Sangguniang Kabataan ng Santo Niño 2nd', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.797087, lng: 120.9742858 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n12619859135', name: 'Sangguniang Pambarangay ng Santo Niño 2nd', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.7970915, lng: 120.9743053 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n12721917801', name: 'Eatery', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7860387, lng: 120.9751948 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n12823931134', name: 'Portal Barangay Hall', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.7358103, lng: 121.0622026 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n13525263233', name: 'Imelda\'s Eatery', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7938667, lng: 120.990707 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n13734133101', name: 'Cabubulaunan Elementay School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.6745421, lng: 120.9888116 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n1297320302', name: 'Manson Drug', aliases: [], category: 'hospital', city: 'Science City of Muñoz', gps: { lat: 15.7131837, lng: 120.904636 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n1297320304', name: 'Mercury Drug', aliases: [], category: 'hospital', city: 'Science City of Muñoz', gps: { lat: 15.7121084, lng: 120.904637 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n1708017371', name: 'Muñoz Fire Station', aliases: [], category: 'government', city: 'Science City of Muñoz', gps: { lat: 15.7133111, lng: 120.9035498 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n1711163530', name: 'First Baker', aliases: [], category: 'market', city: 'Science City of Muñoz', gps: { lat: 15.7076466, lng: 120.9029034 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n1711168196', name: 'BDO', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7130671, lng: 120.9031947 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n1711168198', name: 'Edward Battery Shop', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7107997, lng: 120.9031665 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n2162297615', name: 'Tobias Law Office', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7120955, lng: 120.9056501 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n2162311386', name: 'Poblacion East Barangay Hall', aliases: [], category: 'government', city: 'Science City of Muñoz', gps: { lat: 15.7126892, lng: 120.9057857 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n2465616129', name: 'Bahamas Hotel & Resort', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7244821, lng: 120.9036507 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n3281378361', name: 'CLSU Post Office', aliases: [], category: 'government', city: 'Science City of Muñoz', gps: { lat: 15.7336008, lng: 120.9291951 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n3281857333', name: 'LANDBANK', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7296209, lng: 120.9284203 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n3611827714', name: 'RET Amphitheater', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7293707, lng: 120.9281122 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n3930401639', name: 'Our Home', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7238512, lng: 120.9229861 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n4249936290', name: 'Corpuz\' Boarding House', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7279923, lng: 120.9247313 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n4317815689', name: 'Matingkis Barangay Chapel', aliases: [], category: 'church', city: 'Science City of Muñoz', gps: { lat: 15.7027569, lng: 120.8809375 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n4317815690', name: 'Matingkis (Talavera) Catholic Chapel', aliases: [], category: 'church', city: 'Science City of Muñoz', gps: { lat: 15.7023381, lng: 120.8814633 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n4336795596', name: 'Sacred Heart Parish Church', aliases: [], category: 'church', city: 'Science City of Muñoz', gps: { lat: 15.7207212, lng: 120.9247519 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n4357189291', name: 'sarmiento petron', aliases: [], category: 'gas_station', city: 'Science City of Muñoz', gps: { lat: 15.6550063, lng: 120.8694002 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n4357209590', name: 'Iglesia ni Cristo', aliases: [], category: 'church', city: 'Science City of Muñoz', gps: { lat: 15.6638954, lng: 120.8585115 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n4391379389', name: 'Clock Tower', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7138822, lng: 120.9044895 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n4393324789', name: 'Eriel\'s Cakes and Pastries', aliases: [], category: 'market', city: 'Science City of Muñoz', gps: { lat: 15.7157431, lng: 120.9048294 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n4401153493', name: 'wycoco', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.6797272, lng: 120.8513349 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n4414571690', name: 'ALDABA\'s Reception Hall', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.6907879, lng: 120.8964869 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n4417512204', name: 'Sangguniang Barangay ng Franza', aliases: [], category: 'government', city: 'Science City of Muñoz', gps: { lat: 15.748563, lng: 120.9032389 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n4438463689', name: 'CLSU Alumni Hostel', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7308892, lng: 120.9284207 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n4451381890', name: 'Mameng ihaw ihaw', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.6661242, lng: 120.8546053 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n4485895519', name: 'Central Luzon Bidani Dev\'t Foundation', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7299924, lng: 120.9288281 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n4562771189', name: 'Mapangpang chapel', aliases: [], category: 'church', city: 'Science City of Muñoz', gps: { lat: 15.7919457, lng: 120.8965834 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n4725686090', name: 'Mapangpang Lupao Farm', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.8070254, lng: 120.901134 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n4968754579', name: 'RF 2 Vapeshop', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7284018, lng: 120.9307971 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n5057777521', name: 'Joesrics Place Sa Goat Kita', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7149994, lng: 120.9124808 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n5082551129', name: 'AGC INTERNET COMPUTER CORNER', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7280464, lng: 120.9248137 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n5125501948', name: 'Aulen\'s Agri Supply', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7102628, lng: 120.9046542 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n5232231021', name: 'BIDAY-INDAY EATERY', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7015634, lng: 120.9012664 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n5314883418', name: 'PhilRice Cafeteria', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.6689491, lng: 120.8901322 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n5314883419', name: 'PhilRice Hostel', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.6687244, lng: 120.889923 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n5314983635', name: 'Philippine Rice Research Institute', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.669915, lng: 120.8899766 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n5674221621', name: 'Hilario C. Dela Cruz Farm', aliases: [], category: 'market', city: 'Science City of Muñoz', gps: { lat: 15.6782883, lng: 120.8911917 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n6634595285', name: 'Landbank', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7128432, lng: 120.9052586 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n6698927885', name: 'Kasangga ng Rang-ay Irrigators’ Association Incorporated', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.722191, lng: 120.8768933 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n8331346204', name: 'Jorsel\'s Branded Factory Pullout', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7174425, lng: 120.9114682 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n8331348385', name: 'Eclipse Milk Tea Station', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7174718, lng: 120.9114743 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n8920947982', name: 'G Store', aliases: [], category: 'market', city: 'Science City of Muñoz', gps: { lat: 15.7141813, lng: 120.9117043 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n8920947998', name: 'Kel’z Cafe', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7143768, lng: 120.9115854 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n8920956634', name: 'Treats', aliases: [], category: 'market', city: 'Science City of Muñoz', gps: { lat: 15.6771078, lng: 120.8900911 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n9424077516', name: 'Sangguniang Barangay ng Poblacion Norte', aliases: [], category: 'government', city: 'Science City of Muñoz', gps: { lat: 15.7210618, lng: 120.9035727 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n10943582206', name: '7-Eleven', aliases: [], category: 'market', city: 'Science City of Muñoz', gps: { lat: 15.7066362, lng: 120.9027998 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n10943585805', name: '7 Eleven', aliases: [], category: 'market', city: 'Science City of Muñoz', gps: { lat: 15.7124556, lng: 120.9046224 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-n10956705405', name: 'Alfamart', aliases: [], category: 'market', city: 'Science City of Muñoz', gps: { lat: 15.7066377, lng: 120.9026636 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-n4423011093', name: '5 Star', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.8245919, lng: 121.0152459 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w236842389', name: 'Tierra Hotel', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.794236, lng: 120.9891801 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w236842725', name: 'Baliwag Transit Terminal', aliases: [], category: 'transport', city: 'San Jose City', gps: { lat: 15.7939054, lng: 120.9884253 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w236843223', name: 'San Jose City Hall', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.7923239, lng: 120.9887456 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w236844371', name: 'Petron', aliases: [], category: 'gas_station', city: 'San Jose City', gps: { lat: 15.7914709, lng: 120.9901798 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w236845415', name: 'San Jose West Central School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7886312, lng: 120.9895838 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w236845809', name: 'Calaocan Multi-purpose Covered Court', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7854691, lng: 120.9884952 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w236847813', name: 'Calaocan Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.785968, lng: 120.9946324 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w236849032', name: 'The Church of Jesus Christ of Latter-day Saints', aliases: [], category: 'church', city: 'San Jose City', gps: { lat: 15.7924958, lng: 120.99333 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w236849124', name: 'San Jose City United Methodist Church', aliases: [], category: 'church', city: 'San Jose City', gps: { lat: 15.7924741, lng: 120.9940692 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w236849235', name: 'San Jose City Hall of Justice', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.7956972, lng: 120.9938063 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w236852237', name: 'Iglesia ni Cristo - Lokal ng San Jose City', aliases: [], category: 'church', city: 'San Jose City', gps: { lat: 15.7994888, lng: 120.9952617 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w236852838', name: 'Saint Joseph High School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.8018427, lng: 120.9949993 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w236853196', name: 'Caltex', aliases: [], category: 'gas_station', city: 'San Jose City', gps: { lat: 15.8002002, lng: 120.9967312 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w236855729', name: 'Encarnacion Subdivision Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7994884, lng: 120.9909892 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w237099633', name: 'Bettbien High School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7861587, lng: 120.977351 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w237102463', name: 'Gracious Shephered Christian Academy', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7879961, lng: 120.9813947 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w237103356', name: 'Caltex', aliases: [], category: 'gas_station', city: 'San Jose City', gps: { lat: 15.7877684, lng: 120.979746 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w237103820', name: 'Victory Liner San Jose Terminal', aliases: [], category: 'transport', city: 'San Jose City', gps: { lat: 15.7879242, lng: 120.9800614 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w237104233', name: 'Abar 1st Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7896906, lng: 120.9809625 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w237104709', name: 'Abar 1st Barangay Hall', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.789053, lng: 120.9816359 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w237119303', name: 'School Gym', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7857391, lng: 120.9894853 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w237119358', name: 'Multi Purpose Hall', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7850579, lng: 120.9896306 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w237524691', name: 'St. John Academy', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7933339, lng: 120.9883467 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w237525281', name: 'Core Gateway College', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7902811, lng: 120.988985 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w237526723', name: 'Saver\'s Appliance Depot', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7903985, lng: 120.9876419 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w237529891', name: 'San Jose East Central School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7890128, lng: 120.9975827 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w237532023', name: 'ELIM School for Values & Excellence', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.788978, lng: 120.9998305 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w237534174', name: 'Swimming pool', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7864102, lng: 121.0065923 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w237541208', name: 'Genesis San Jose City Terminal', aliases: [], category: 'transport', city: 'San Jose City', gps: { lat: 15.7996382, lng: 120.997226 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w237544558', name: 'Malasin Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.8068944, lng: 121.0005373 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w237829650', name: 'San Jose Cockpit Coliseum', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7968658, lng: 120.9795355 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w238191481', name: 'Barangay Palestina Multipurpose Hall', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7703091, lng: 121.0182347 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w238191972', name: 'United Methodist Church', aliases: [], category: 'church', city: 'San Jose City', gps: { lat: 15.770343, lng: 121.0164219 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w238192377', name: 'Palestina Barangay Hall', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.7699732, lng: 121.0183416 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w238192774', name: 'Palestina Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7718148, lng: 121.020317 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w238195607', name: 'Pinili Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7687788, lng: 121.0357007 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w238195806', name: 'Brgy. Pinili Multi Purpose Hall', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7692253, lng: 121.0374624 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w238196405', name: 'Iglesia ni Cristo lokal ng Pinili', aliases: [], category: 'church', city: 'San Jose City', gps: { lat: 15.7689685, lng: 121.0408226 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w238197150', name: 'Dylan New Jersie Resort', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7676069, lng: 121.0423502 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w238198852', name: 'Porais National High School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.760198, lng: 121.0443779 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w238199249', name: 'Iglesia ni Cristo Lokal ng Porais', aliases: [], category: 'church', city: 'San Jose City', gps: { lat: 15.7591156, lng: 121.0422897 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w238200942', name: 'Brgy. Porais Multi Purpose Hall', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7546843, lng: 121.0425379 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w238202797', name: 'Porais Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7526622, lng: 121.0434854 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w238208369', name: 'Barangay Villa Joson Multi Purpose Hall', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7453823, lng: 121.0537953 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w238208874', name: 'Villa Joson Sports Gym', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7463011, lng: 121.0534327 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w238212562', name: 'Portal Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7361857, lng: 121.0622024 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w238212626', name: 'Portal Covered Court', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7357358, lng: 121.0622003 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w238913585', name: 'Accelerated Christian International School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7189848, lng: 120.9071198 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w238914270', name: 'Muñoz National High School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7157887, lng: 120.9102905 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w238915688', name: 'Bantug Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7202182, lng: 120.9185915 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w253918012', name: 'Savemore Market', aliases: [], category: 'market', city: 'San Jose City', gps: { lat: 15.7949794, lng: 120.9919209 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w253919622', name: 'Bettbien Montessori', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7969712, lng: 120.9945876 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w254084235', name: 'Mary Help of Christians Church', aliases: [], category: 'church', city: 'San Jose City', gps: { lat: 15.8020877, lng: 120.9962924 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w254084364', name: 'Roper Hardware', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7990075, lng: 120.9949848 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w255640571', name: 'San Jose City Central Terminal', aliases: [], category: 'transport', city: 'San Jose City', gps: { lat: 15.7972904, lng: 120.9768138 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w255670280', name: 'Keanney-Diaz Educational Institude', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.8312973, lng: 121.0200746 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w312167154', name: 'BDO', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.792743, lng: 120.9904551 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w312167284', name: 'Metrobank', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7943486, lng: 120.9916802 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w312167285', name: 'Producers Bank', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7944012, lng: 120.991768 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w312532032', name: 'PNP Station', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.769461, lng: 121.0427809 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w319046153', name: 'Calaocan (Melcar Subdivision) Multi-purpose Gym', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7830513, lng: 120.9911276 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w321396269', name: 'USHS Umali Gymnasium', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7318278, lng: 120.9308277 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w321396273', name: 'Lingap Kalikasan Park', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7425458, lng: 120.9344027 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w321396335', name: 'Don Bosco Technical School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.8027436, lng: 120.9945893 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w321396516', name: 'Mount Carmel Montessori Center', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7952825, lng: 120.9966166 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w321418121', name: 'Maharlika Suites', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.776805, lng: 120.9667546 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w321419267', name: 'Bettbien Montessori', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7823707, lng: 120.9665491 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w321441799', name: 'McDonald\'s', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.791764, lng: 120.9904125 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w354691703', name: 'CLSU Oval', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7364904, lng: 120.9317515 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w384984982', name: 'CLSU Infirmary', aliases: [], category: 'hospital', city: 'Science City of Muñoz', gps: { lat: 15.7304401, lng: 120.9278993 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w386280870', name: 'Keanney-Diaz Educational Institute', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.8197651, lng: 121.0062089 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w391707218', name: 'Philippine Carabao Center at CLSU', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7401121, lng: 120.9329905 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w451759780', name: 'Tan Yan Kee Gymnasium', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7318567, lng: 120.9290309 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w451763325', name: 'Regional Science and Teaching Center Hostel', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.733156, lng: 120.930322 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w451763329', name: 'College of Engineering Activity Center', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7356938, lng: 120.9308709 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w451763331', name: 'ISPEAR Gymnasium', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7382522, lng: 120.9325257 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w451763337', name: 'Football field', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7373906, lng: 120.9328569 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w451771229', name: 'Agri Food and Technology Businees Incubator', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7391968, lng: 120.9349042 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w451771230', name: 'Agri Food and Technology Businees Incubator', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7397478, lng: 120.9354813 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w451771262', name: 'RET Hostel', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7292429, lng: 120.9279619 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w451771264', name: 'RET Cafeteria', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7296452, lng: 120.927909 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w451783184', name: 'Bagong Sikat Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7375028, lng: 120.9225239 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w451783185', name: 'Bagong Sikat gymn', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7374743, lng: 120.923235 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w451786283', name: 'Choice Cable TV Office', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7313568, lng: 120.931643 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w550244292', name: 'Adonai Integrated Montessori School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7453139, lng: 120.9433389 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w613662568', name: 'CLSU Graduation Site', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7338301, lng: 120.9321204 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w637088668', name: 'Bagong Sikat Nature Park', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7366418, lng: 120.9234844 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w653510744', name: 'GT Oil', aliases: [], category: 'gas_station', city: 'San Jose City', gps: { lat: 15.8244275, lng: 121.0146382 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w668186294', name: 'Roseville Gas Station', aliases: [], category: 'gas_station', city: 'Science City of Muñoz', gps: { lat: 15.7465838, lng: 120.9456182 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w668186296', name: 'Philippine Center for Postharvest Development and Mechanization', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.741101, lng: 120.9392823 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w668186297', name: 'Philippine-Sino Center for Agricultural Technology', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7395755, lng: 120.941321 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w668186299', name: 'Veterinary Hospital', aliases: [], category: 'hospital', city: 'Science City of Muñoz', gps: { lat: 15.7347726, lng: 120.935908 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w668186303', name: 'New CLSU Marketing Center', aliases: [], category: 'market', city: 'Science City of Muñoz', gps: { lat: 15.7308469, lng: 120.931133 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w668186304', name: 'National Irrigation Administration', aliases: [], category: 'government', city: 'Science City of Muñoz', gps: { lat: 15.7269059, lng: 120.9274869 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w726019976', name: 'CLSU-BINHI Conservation Park', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7369338, lng: 120.9347834 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w756111974', name: 'Pinagcuartilan Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.802099, lng: 120.985644 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w756146294', name: 'Manicla Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.8349219, lng: 121.0214416 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w773688738', name: 'BLISS Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.8112657, lng: 120.9965844 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w779020442', name: 'Rizal Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7646256, lng: 120.9083464 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w781499968', name: 'Petron', aliases: [], category: 'gas_station', city: 'Science City of Muñoz', gps: { lat: 15.7133741, lng: 120.9081915 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w789798689', name: 'San Nicolas Primary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7269795, lng: 121.0126615 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w790383314', name: 'Santo Tomas Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7548618, lng: 120.9510217 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w793885058', name: 'Philippine Carabao Center National Headquarters', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7428058, lng: 120.9355265 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w793885060', name: 'Milka Krem', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.741828, lng: 120.9415404 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w794221279', name: 'Pelmoka-Lina Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.6812575, lng: 120.9276411 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w794221283', name: 'National Freshwater Fisheries Technology Center', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7317363, lng: 120.9495528 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w794250156', name: 'Tumana Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7799123, lng: 121.0080857 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w794431227', name: 'Central Luzon State University', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7352033, lng: 120.9377602 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w799736085', name: 'WalterMart', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7977771, lng: 120.993595 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w800203479', name: 'Saint Joseph School Elementary Department', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7925453, lng: 120.9892649 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w802781705', name: 'San Jose City Fire Station', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.7913237, lng: 120.9924964 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w802781728', name: 'Magic San Jose', aliases: [], category: 'mall', city: 'San Jose City', gps: { lat: 15.7921381, lng: 120.9917413 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w802781731', name: 'Landbank', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7911619, lng: 120.9923485 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w802781738', name: 'Land Transportation Office - San Jose City Regional Office', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.7910778, lng: 120.9922148 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w802781739', name: 'City Veterinary Office', aliases: [], category: 'hospital', city: 'San Jose City', gps: { lat: 15.7910135, lng: 120.9921505 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w802781746', name: 'Greenwich', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7925684, lng: 120.9903094 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w802781750', name: 'Chowking', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.792497, lng: 120.9901883 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w802781751', name: 'San Jose City Library', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7908204, lng: 120.9919575 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w802781752', name: 'PHLPost', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.7909181, lng: 120.9918635 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w802781755', name: 'Theophilus Academic and School of Values', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7904107, lng: 120.9934077 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w802781756', name: 'San Jose Conservative Baptist Church', aliases: [], category: 'church', city: 'San Jose City', gps: { lat: 15.7902133, lng: 120.9935582 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w802781760', name: 'Heart of Jesus Hospital', aliases: [], category: 'hospital', city: 'San Jose City', gps: { lat: 15.7959243, lng: 120.991309 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w802781793', name: 'Pag-asa Sports Complex', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7949835, lng: 120.9932242 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w802781794', name: 'Magic2', aliases: [], category: 'mall', city: 'San Jose City', gps: { lat: 15.7954139, lng: 120.9935287 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w802781796', name: 'San Jose City Public Market', aliases: [], category: 'market', city: 'San Jose City', gps: { lat: 15.7939861, lng: 120.9905696 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w802781806', name: 'Friendship Supermarket', aliases: [], category: 'market', city: 'San Jose City', gps: { lat: 15.8024914, lng: 120.9971261 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w802781810', name: 'Aglipayan Church', aliases: [], category: 'church', city: 'San Jose City', gps: { lat: 15.7911086, lng: 120.9928917 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w802781820', name: 'PNB', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7913348, lng: 120.9887123 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w802781837', name: 'San Jose Christian College', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7978645, lng: 120.9865314 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w802781844', name: 'San Jose City Park', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7916073, lng: 120.9891228 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w802781845', name: 'Saint Joseph the Worker Cathedral', aliases: [], category: 'church', city: 'San Jose City', gps: { lat: 15.7921901, lng: 120.9895278 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w810799470', name: 'Licaong Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7512043, lng: 120.9408059 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w814423309', name: 'Travieza Garden', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.773485, lng: 121.0008436 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w814423313', name: 'Coffee Brean', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.8026787, lng: 120.9974481 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w836961320', name: 'GT Oil', aliases: [], category: 'gas_station', city: 'Science City of Muñoz', gps: { lat: 15.7299301, lng: 120.9301228 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w837011299', name: 'Ciriaco Esteban Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7967568, lng: 120.9879776 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w837021415', name: 'San Jose City General Hospital', aliases: [], category: 'hospital', city: 'San Jose City', gps: { lat: 15.8074769, lng: 120.9998614 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w844556797', name: 'Villa Floresta Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.8490676, lng: 120.9857167 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w844556806', name: 'Nieves Pabalan Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.8253183, lng: 121.0033288 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w845037909', name: 'San Agustin Integrated School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.8025643, lng: 121.0158627 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w845048186', name: 'Kaliwanagan Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.8111731, lng: 121.032921 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w845053064', name: 'Balacat Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7973154, lng: 121.0376071 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w845058463', name: 'Culaylay Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7846331, lng: 121.0234132 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w845075153', name: 'San Juan Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7686635, lng: 121.0521017 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w845316022', name: 'Caridad Norte Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7550965, lng: 121.0184651 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w845316029', name: 'Tulat Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7598999, lng: 121.0100055 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w845340438', name: 'Santo Niño 2nd Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7976433, lng: 120.9753003 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w847077547', name: 'Governor Eduardo L. Joson Memorial School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.730558, lng: 120.9070565 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w847080668', name: 'Sapang Cawayan Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.70734, lng: 120.9383361 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w848480492', name: 'Villa Nati Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.6933784, lng: 120.9383939 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w849224574', name: 'Tondod Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7182131, lng: 120.9691685 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w849224580', name: 'Tondod National High School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.716934, lng: 120.9686605 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w849267478', name: 'Bulac Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.6831396, lng: 120.9700768 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w849267479', name: 'San Mauricio Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.6876607, lng: 120.9709955 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w849267480', name: 'Bulac National High School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.6835928, lng: 120.9699068 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w849270486', name: 'A. Pascual Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.6986254, lng: 120.9676172 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w849277684', name: 'Dizol Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7325818, lng: 120.991505 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w849283182', name: 'Sinipit Bubon Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7425471, lng: 120.9724027 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w854199975', name: 'Ligaya Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7291158, lng: 120.9993276 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w854206760', name: 'Caanawan Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7739524, lng: 120.9654326 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w854206770', name: 'Caanawan High School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7745848, lng: 120.9661835 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w855457269', name: 'Parilla Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7453442, lng: 121.0538784 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w856308167', name: 'Magtanggol Integrated School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7539513, lng: 120.9297605 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w860101206', name: 'San Jose City Police Station', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.7966894, lng: 120.9782718 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w866608638', name: 'Alumni Food Court', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7311669, lng: 120.9283284 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w866608653', name: 'University Science High School Senior High School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7319368, lng: 120.9307021 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w870795559', name: 'Chappel', aliases: [], category: 'church', city: 'Science City of Muñoz', gps: { lat: 15.7478226, lng: 120.9353469 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w890021933', name: 'Kingdom Hall of Jehovah’s Witnesses', aliases: [], category: 'church', city: 'San Jose City', gps: { lat: 15.7897732, lng: 120.9928254 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w890021937', name: 'St. Joseph the Husband Church', aliases: [], category: 'church', city: 'San Jose City', gps: { lat: 15.7873615, lng: 120.9773012 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w890021941', name: 'Iglesia ni Cristo - Lokal ng Abar', aliases: [], category: 'church', city: 'San Jose City', gps: { lat: 15.7838355, lng: 120.9709361 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w925923326', name: 'Nueva Ecija Fruits and Vegetables Seeds Center', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7428709, lng: 120.9468049 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w932668226', name: 'Junior Campo Primary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.8115064, lng: 120.974948 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w932668228', name: 'Naglaoag Primary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.8275846, lng: 120.9534508 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w932670987', name: 'Batong Lusong Primary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.8567449, lng: 120.9951923 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w934189743', name: 'Camanacsacan Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.768262, lng: 120.9814795 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w934189753', name: 'Abar 2nd Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7814945, lng: 120.9699098 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w935699431', name: 'Bagong Sikat Integrated School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7384823, lng: 121.0378723 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w935700041', name: 'Kumabol Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7738691, lng: 120.9440761 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w936587021', name: 'Cabisuculan Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7534191, lng: 120.9140534 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w936587032', name: 'San Andres Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7749532, lng: 120.9289867 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w936587042', name: 'Parang Mangga Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7380454, lng: 121.0031511 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w937057205', name: 'Maragol Integrated School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7034818, lng: 120.9491401 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w937060715', name: 'Caridad Sur Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7339341, lng: 121.0140194 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w964455662', name: 'Wheeltek', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7163772, lng: 120.9148615 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w964455664', name: 'Rusi', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.713047, lng: 120.9090175 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w964455666', name: 'Motorista Motors', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7157918, lng: 120.9136975 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w964455667', name: 'Iglesia ni Cristo - Lokal ng Muñoz', aliases: [], category: 'church', city: 'Science City of Muñoz', gps: { lat: 15.7115081, lng: 120.9073536 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w964455674', name: 'PBT Construction & Trading', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7145431, lng: 120.9109551 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w964455677', name: 'A2’s Sizzling Haus', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7143497, lng: 120.9108253 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w964455679', name: 'GT Oil', aliases: [], category: 'gas_station', city: 'Science City of Muñoz', gps: { lat: 15.7143352, lng: 120.9118157 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w1021547408', name: 'Tayabo Gym', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.8327696, lng: 121.0324682 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w1021793021', name: 'Magtanggol Gym', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7537223, lng: 120.9303125 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w1021800030', name: 'Maragol Gym', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7051427, lng: 120.9507461 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w1021800044', name: 'Sapang Cawayan Gym', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7075185, lng: 120.9378981 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w1036508302', name: 'Tabulac Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7492824, lng: 121.0042313 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w1063783526', name: 'Shakey\'s', aliases: [], category: 'other', city: 'San Jose City', gps: { lat: 15.7900709, lng: 120.9868112 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w1064213210', name: 'PTT', aliases: [], category: 'gas_station', city: 'San Jose City', gps: { lat: 15.7920994, lng: 120.9923453 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w1064213213', name: 'GT Oil', aliases: [], category: 'gas_station', city: 'San Jose City', gps: { lat: 15.7922454, lng: 120.9921233 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w1213679980', name: 'Petron', aliases: [], category: 'gas_station', city: 'San Jose City', gps: { lat: 15.7833067, lng: 121.0070152 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w1213915724', name: 'GT Oil', aliases: [], category: 'gas_station', city: 'San Jose City', gps: { lat: 15.8134425, lng: 120.9631929 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w1213915726', name: 'Santo Niño de Belareez', aliases: [], category: 'church', city: 'San Jose City', gps: { lat: 15.8129772, lng: 120.9641381 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w1298281233', name: 'Bantug Barangay Hall', aliases: [], category: 'government', city: 'Science City of Muñoz', gps: { lat: 15.7209767, lng: 120.919912 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w1323783916', name: 'Phoenix', aliases: [], category: 'gas_station', city: 'San Jose City', gps: { lat: 15.7785989, lng: 120.9669243 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w1340130573', name: '7-Eleven', aliases: [], category: 'market', city: 'San Jose City', gps: { lat: 15.7617968, lng: 120.9575632 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w1344346145', name: 'Villa Cuizon Barangay Health Center', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7262365, lng: 120.9426479 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w1363012635', name: 'Bahay Pamahalaan ng Barangay Santo Niño 2nd', aliases: [], category: 'government', city: 'San Jose City', gps: { lat: 15.7970607, lng: 120.974289 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w1375215708', name: 'Palasapas Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.8520922, lng: 121.0138189 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w1375215715', name: 'Lomboy Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.8469343, lng: 121.0239744 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w1375215722', name: 'Delaen Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.7815558, lng: 120.9490603 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w1375215729', name: 'Habitat Elementary School', aliases: [], category: 'school', city: 'San Jose City', gps: { lat: 15.8253505, lng: 120.9706581 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w1384650829', name: 'Petron', aliases: [], category: 'gas_station', city: 'San Jose City', gps: { lat: 15.7878238, lng: 120.97846 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w1384653152', name: 'Jetti', aliases: [], category: 'gas_station', city: 'San Jose City', gps: { lat: 15.7890268, lng: 121.0020938 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w1384653156', name: 'MileAge Gasoline Station', aliases: [], category: 'gas_station', city: 'San Jose City', gps: { lat: 15.7887925, lng: 121.0017193 }, todaOrgId: null },
  { id: 'landmark-osm-sjc-w1384662803', name: 'Iglesia ni Cristo - Locale of Santo Tomas', aliases: [], category: 'church', city: 'San Jose City', gps: { lat: 15.7515135, lng: 120.9492834 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w238589673', name: 'Muñoz City Public Market', aliases: [], category: 'market', city: 'Science City of Muñoz', gps: { lat: 15.7122428, lng: 120.9040284 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w238705647', name: 'Bical Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7429663, lng: 120.9006093 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w238763746', name: 'Muñoz North Central School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7205528, lng: 120.9038735 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w238767569', name: 'Muñoz Central School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7147173, lng: 120.9050465 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w238767890', name: 'Muñoz Sports Center', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7142901, lng: 120.9037708 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w238768734', name: 'San Sebastian School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7145524, lng: 120.9018344 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w238913459', name: 'The Church of Jesus Christ of Latter-day Saints', aliases: [], category: 'church', city: 'Science City of Muñoz', gps: { lat: 15.7188031, lng: 120.9041752 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w238914027', name: 'Covered Court', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.721854, lng: 120.9060846 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w312167680', name: 'PNB', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.713602, lng: 120.9046345 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w550249050', name: 'PhilRice Tennis Court', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.6719913, lng: 120.8898188 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w550249180', name: 'PhilRice Basketball Court', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.672498, lng: 120.8909616 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w550249838', name: 'PhilRice Volleyball Court', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.6715009, lng: 120.8897637 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w550257508', name: 'Maligaya Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.6732293, lng: 120.8891612 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w550258258', name: 'Maligaya Barangay Hall', aliases: [], category: 'government', city: 'Science City of Muñoz', gps: { lat: 15.6726877, lng: 120.8895378 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w550258445', name: 'San Miguel Arkanghel Chapel', aliases: [], category: 'church', city: 'Science City of Muñoz', gps: { lat: 15.672779, lng: 120.8889986 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w550259085', name: 'Maligaya Multipurpose Court', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.6727353, lng: 120.8892531 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w550268766', name: 'Philippine Rice Research Institute Central Experiment Station', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.6707833, lng: 120.8963323 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w730950233', name: 'Ricardo Viola Adriano Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.6997268, lng: 120.8486855 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w773669298', name: 'Franza Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7542207, lng: 120.905172 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w788526200', name: 'Mangandingay Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7915128, lng: 120.8830364 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w791824097', name: 'Muñoz City Fruits, Vegetables, and Meat Market', aliases: [], category: 'market', city: 'Science City of Muñoz', gps: { lat: 15.7136556, lng: 120.90189 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w791824105', name: 'Bakal II Integrated School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.6977108, lng: 120.8985806 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w791824110', name: 'Bakal 2 Barangay Hall', aliases: [], category: 'government', city: 'Science City of Muñoz', gps: { lat: 15.6972979, lng: 120.8991679 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w793700971', name: 'Bakal Ⅲ Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7034688, lng: 120.8990391 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w793700972', name: 'Gratia Plena Social Action Center', aliases: [], category: 'government', city: 'Science City of Muñoz', gps: { lat: 15.698673, lng: 120.9030339 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w793885056', name: 'Bakal 3 Barangay Hall', aliases: [], category: 'government', city: 'Science City of Muñoz', gps: { lat: 15.7069005, lng: 120.9030634 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w797977381', name: 'Bakal I Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.6872113, lng: 120.8925012 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w798819195', name: 'Friendship Supermarket', aliases: [], category: 'market', city: 'Science City of Muñoz', gps: { lat: 15.7119734, lng: 120.9027118 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w813705543', name: 'Villa Isla Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7707749, lng: 120.8692116 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w824633818', name: 'Bunol Integrated School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.6663524, lng: 120.8356696 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w836954864', name: 'GT Oil', aliases: [], category: 'gas_station', city: 'Science City of Muñoz', gps: { lat: 15.7035183, lng: 120.9018179 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w836954870', name: 'Muñoz Police Station', aliases: [], category: 'government', city: 'Science City of Muñoz', gps: { lat: 15.713468, lng: 120.9001382 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w836954876', name: 'Jollibee', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7134395, lng: 120.9048183 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w844281024', name: 'Burgos Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.8093066, lng: 120.874169 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w844297293', name: 'Mapangpang Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7918923, lng: 120.8962643 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w844297294', name: 'Mapangpang Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.8047006, lng: 120.8977966 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w846922628', name: 'Malayantoc Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.6610754, lng: 120.8882982 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w847067842', name: 'Catalanacan Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7136272, lng: 120.8850822 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w848007870', name: 'Gabaldon Integrated School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7217532, lng: 120.8722244 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w848015065', name: 'Calisitan Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7308553, lng: 120.8507486 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w848020948', name: 'Villa Santos Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7367578, lng: 120.8709839 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w848025735', name: 'Rang-ayan Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7430931, lng: 120.882052 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w848045665', name: 'Muñoz National High School – Annex', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7619623, lng: 120.9002348 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w848045666', name: 'Department of Education - Division Office', aliases: [], category: 'government', city: 'Science City of Muñoz', gps: { lat: 15.7616875, lng: 120.8995072 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w848045688', name: 'Linglingay Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7657796, lng: 120.8916074 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w855476970', name: 'Sinulatan Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.6883792, lng: 120.8224198 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w855507486', name: 'Curva Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.6706865, lng: 120.8457741 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w856298535', name: 'Culiat Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7212755, lng: 120.837573 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w870795561', name: 'San Sebastian Parish Church', aliases: [], category: 'church', city: 'Science City of Muñoz', gps: { lat: 15.7150873, lng: 120.9038603 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w936578530', name: 'San Felipe Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7739324, lng: 120.8987542 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w937041425', name: 'Pandalla Primary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7186323, lng: 120.856164 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w937061776', name: 'Matingkis Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.7020022, lng: 120.8808685 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w937063789', name: 'Calabalabaan Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.702161, lng: 120.8639974 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w937064388', name: 'Naglabrahan Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.6803736, lng: 120.8363512 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w964455660', name: 'Kingdom Hall of Jehovah’s Witnesses', aliases: [], category: 'church', city: 'Science City of Muñoz', gps: { lat: 15.7098052, lng: 120.9052316 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w964455661', name: 'Agri Mall', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.6774463, lng: 120.8897649 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w964455681', name: 'Iglesia ni Cristo - Lokal ng Maligaya-M', aliases: [], category: 'church', city: 'Science City of Muñoz', gps: { lat: 15.678446, lng: 120.8903184 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w979839200', name: 'Poblacion North Barangay Hall', aliases: [], category: 'government', city: 'Science City of Muñoz', gps: { lat: 15.7210181, lng: 120.9035097 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w1021573474', name: 'Lokal ng Gabaldon', aliases: [], category: 'church', city: 'Science City of Muñoz', gps: { lat: 15.7216772, lng: 120.8759321 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w1021573478', name: 'Gabaldon Gym', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7258088, lng: 120.877325 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w1021793003', name: 'Bical Gym', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7436444, lng: 120.9024799 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w1021793006', name: 'Franza Barangay Hall', aliases: [], category: 'government', city: 'Science City of Muñoz', gps: { lat: 15.7485205, lng: 120.9032639 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w1021794129', name: 'Palusapis Barangay Health Station', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.6834792, lng: 120.8617796 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w1021794130', name: 'Palusapis Gym', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.6837341, lng: 120.8616856 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w1342925226', name: 'Munoz Health Center', aliases: [], category: 'hospital', city: 'Science City of Muñoz', gps: { lat: 15.7131549, lng: 120.9042507 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w1342925232', name: 'Munoz Tennis Club', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.7145067, lng: 120.9041457 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w1360030741', name: 'Bakal Ⅱ Barangay Health Station', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.6972296, lng: 120.8992974 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w1364710567', name: 'San Antonio Barangay Health Station', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.6863552, lng: 120.8565684 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w1364710569', name: 'San Antonio Gym', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.6864839, lng: 120.8561737 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w1364889432', name: 'Inday Melencio National High School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.6893564, lng: 120.8657367 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w1375171535', name: 'Ilog Baliwag Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.6635289, lng: 120.8491896 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w1375222897', name: 'Calisitan Elementary School', aliases: [], category: 'school', city: 'Science City of Muñoz', gps: { lat: 15.73512, lng: 120.8401804 }, todaOrgId: null },
  { id: 'landmark-osm-munoz-w1422934483', name: 'Bunol Barangay Health Station', aliases: [], category: 'other', city: 'Science City of Muñoz', gps: { lat: 15.6685764, lng: 120.8251445 }, todaOrgId: null },
]

// All 89 official barangays of Cabanatuan City, Nueva Ecija — cross-checked
// against PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/cabanatuan.html) and
// Wikipedia's article for Cabanatuan City, Nueva Ecija.
// Spelling follows PhilAtlas where Wikipedia's list differs (e.g. "Daang
// Sarile" vs Wikipedia's "Daan Sarile", "Campo Tinio" vs "Camp Tinio", "Ibabao
// Bana" vs "Ibabao-Bana", "Villa Ofelia-Caridad" vs "Villa Ofelia
// Subdivision", "Zulueta District" vs "Zuleta District").
const CABANATUAN_CITY_BARANGAYS = [
  'Aduas Centro',
  'Aduas Norte',
  'Aduas Sur',
  'Bagong Buhay',
  'Bagong Sikat',
  'Bakero',
  'Bakod Bayan',
  'Balite',
  'Bangad',
  'Bantug Bulalo',
  'Bantug Norte',
  'Barlis',
  'Barrera District',
  'Bernardo District',
  'Bitas',
  'Bonifacio District',
  'Buliran',
  'Caalibangbangan',
  'Cabu',
  'Calawagan',
  'Campo Tinio',
  'Caridad',
  'Caudillo',
  'Cinco-Cinco',
  'City Supermarket',
  'Communal',
  'Cruz Roja',
  'Daang Sarile',
  'Dalampang',
  'Dicarma',
  'Dimasalang',
  'Dionisio S. Garcia',
  'Fatima',
  'General Luna',
  'Hermogenes C. Concepcion, Sr.',
  'Ibabao Bana',
  'Imelda District',
  'Isla',
  'Kalikid Norte',
  'Kalikid Sur',
  'Kapitan Pepe',
  'Lagare',
  'Lourdes',
  'M. S. Garcia',
  'Mabini Extension',
  'Mabini Homesite',
  'Macatbong',
  'Magsaysay District',
  'Magsaysay South',
  'Maria Theresa',
  'Matadero',
  'Mayapyap Norte',
  'Mayapyap Sur',
  'Melojavilla',
  'Nabao',
  'Obrero',
  'Padre Burgos',
  'Padre Crisostomo',
  'Pagas',
  'Palagay',
  'Pamaldan',
  'Pangatian',
  'Patalac',
  'Polilio',
  'Pula',
  'Quezon District',
  'Rizdelis',
  'Samon',
  'San Isidro',
  'San Josef Norte',
  'San Josef Sur',
  'San Juan Poblacion',
  'San Roque Norte',
  'San Roque Sur',
  'Sanbermicristi',
  'Sangitan',
  'Sangitan East',
  'Santa Arcadia',
  'Santo Niño',
  'Sapang',
  'Sumacab Este',
  'Sumacab Norte',
  'Sumacab South',
  'Talipapa',
  'Valdefuente',
  'Valle Cruz',
  'Vijandre District',
  'Villa Ofelia-Caridad',
  'Zulueta District',
]

// All 23 official barangays of Gapan City, Nueva Ecija — cross-checked against
// PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/gapan.html) and Wikipedia's
// article for Gapan City, Nueva Ecija.
const GAPAN_CITY_BARANGAYS = [
  'Balante',
  'Bayanihan',
  'Bulak',
  'Bungo',
  'Kapalangan',
  'Mabunga',
  'Maburak',
  'Mahipon',
  'Makabaclay',
  'Malimba',
  'Mangino',
  'Marelo',
  'Pambuan',
  'Parcutela',
  'Puting Tubig',
  'San Lorenzo',
  'San Nicolas',
  'San Roque',
  'San Vicente',
  'Santa Cruz',
  'Santo Cristo Norte',
  'Santo Cristo Sur',
  'Santo Niño',
]

// All 19 official barangays of Palayan City, Nueva Ecija — cross-checked
// against PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/palayan.html) and
// Wikipedia's article for Palayan City, Nueva Ecija.
const PALAYAN_CITY_BARANGAYS = [
  'Atate',
  'Aulo',
  'Bagong Buhay',
  'Bo. Militar',
  'Caballero',
  'Caimito',
  'Doña Josefa',
  'Ganaderia',
  'Imelda Valley',
  'Langka',
  'Malate',
  'Maligaya',
  'Manacnac',
  'Mapait',
  'Marcos Village',
  'Popolon Pagas',
  'Santolan',
  'Sapang Buho',
  'Singalat',
]

// All 26 official barangays of Aliaga, Nueva Ecija — cross-checked against
// PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/aliaga.html) and Wikipedia's
// article for Aliaga, Nueva Ecija.
const ALIAGA_BARANGAYS = [
  'Betes',
  'Bibiclat',
  'Bucot',
  'La Purisima',
  'Macabucod',
  'Magsaysay',
  'Pantoc',
  'Poblacion Centro',
  'Poblacion East I',
  'Poblacion East II',
  'Poblacion West III',
  'Poblacion West IV',
  'San Carlos',
  'San Emiliano',
  'San Eustacio',
  'San Felipe Bata',
  'San Felipe Matanda',
  'San Juan',
  'San Pablo Bata',
  'San Pablo Matanda',
  'Santa Monica',
  'Santiago',
  'Santo Rosario',
  'Santo Tomas',
  'Sunson',
  'Umangan',
]

// All 28 official barangays of Bongabon, Nueva Ecija — cross-checked against
// PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/bongabon.html) and
// Wikipedia's article for Bongabon, Nueva Ecija.
const BONGABON_BARANGAYS = [
  'Antipolo',
  'Ariendo',
  'Bantug',
  'Calaanan',
  'Commercial',
  'Cruz',
  'Curva',
  'Digmala',
  'Kaingin',
  'Labi',
  'Larcon',
  'Lusok',
  'Macabaclay',
  'Magtanggol',
  'Mantile',
  'Olivete',
  'Palo Maria',
  'Pesa',
  'Rizal',
  'Sampalucan',
  'San Roque',
  'Santor',
  'Sinipit',
  'Sisilang na Ligaya',
  'Social',
  'Tugatug',
  'Tulay na Bato',
  'Vega',
]

// All 23 official barangays of Cabiao, Nueva Ecija — cross-checked against
// PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/cabiao.html) and Wikipedia's
// article for Cabiao, Nueva Ecija.
const CABIAO_BARANGAYS = [
  'Bagong Buhay',
  'Bagong Sikat',
  'Bagong Silang',
  'Concepcion',
  'Entablado',
  'Maligaya',
  'Natividad North',
  'Natividad South',
  'Palasinan',
  'Polilio',
  'San Antonio',
  'San Carlos',
  'San Fernando Norte',
  'San Fernando Sur',
  'San Gregorio',
  'San Juan North',
  'San Juan South',
  'San Roque',
  'San Vicente',
  'Santa Ines',
  'Santa Isabel',
  'Santa Rita',
  'Sinipit',
]

// All 17 official barangays of Carranglan, Nueva Ecija — cross-checked against
// PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/carranglan.html) and
// Wikipedia's article for Carranglan, Nueva Ecija.
const CARRANGLAN_BARANGAYS = [
  'Bantug',
  'Bunga',
  'Burgos',
  'Capintalan',
  'D. L. Maglanoc Poblacion',
  'F. C. Otic Poblacion',
  'G. S. Rosario Poblacion',
  'General Luna',
  'Joson',
  'Minuli',
  'Piut',
  'Puncan',
  'Putlan',
  'R. A. Padilla',
  'Salazar',
  'San Agustin',
  'T. L. Padilla Poblacion',
]

// All 51 official barangays of Cuyapo, Nueva Ecija — cross-checked against
// PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/cuyapo.html) and Wikipedia's
// article for Cuyapo, Nueva Ecija.
// "District III" is genuinely absent from both sources (Districts I, II,
// IV–VIII exist, with no III) — not an accidental omission here.
const CUYAPO_BARANGAYS = [
  'Baloy',
  'Bambanaba',
  'Bantug',
  'Bentigan',
  'Bibiclat',
  'Bonifacio',
  'Bued',
  'Bulala',
  'Burgos',
  'Cabatuan',
  'Cabileo',
  'Cacapasan',
  'Calancuasan Norte',
  'Calancuasan Sur',
  'Colosboa',
  'Columbitin',
  'Curva',
  'District I',
  'District II',
  'District IV',
  'District V',
  'District VI',
  'District VII',
  'District VIII',
  'Landig',
  'Latap',
  'Loob',
  'Luna',
  'Malbeg-Patalan',
  'Malineng',
  'Matindeg',
  'Maycaban',
  'Nacuralan',
  'Nagmisahan',
  'Paitan Norte',
  'Paitan Sur',
  'Piglisan',
  'Pugo',
  'Rizal',
  'Sabit',
  'Salagusog',
  'San Antonio',
  'San Jose',
  'San Juan',
  'Santa Clara',
  'Santa Cruz',
  'Sinimbaan',
  'Tagtagumbao',
  'Tutuloy',
  'Ungab',
  'Villaflores',
]

// All 16 official barangays of Gabaldon, Nueva Ecija — cross-checked against
// PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/gabaldon.html) and
// Wikipedia's article for Gabaldon, Nueva Ecija.
const GABALDON_BARANGAYS = [
  'Bagong Sikat',
  'Bagting',
  'Bantug',
  'Bitulok',
  'Bugnan',
  'Calabasa',
  'Camachile',
  'Cuyapa',
  'Ligaya',
  'Macasandal',
  'Malinao',
  'Pantoc',
  'Pinamalisan',
  'Sawmill',
  'South Poblacion',
  'Tagumpay',
]

// All 20 official barangays of General Mamerto Natividad, Nueva Ecija —
// cross-checked against PhilAtlas
// (philatlas.com/luzon/r03/nueva-ecija/general-mamerto-natividad.html) and
// Wikipedia's article for General Mamerto Natividad, Nueva Ecija.
const GENERAL_MAMERTO_NATIVIDAD_BARANGAYS = [
  'Balangkare Norte',
  'Balangkare Sur',
  'Balaring',
  'Belen',
  'Bravo',
  'Burol',
  'Kabulihan',
  'Mag-asawang Sampaloc',
  'Manarog',
  'Mataas na Kahoy',
  'Panacsac',
  'Picaleon',
  'Pinahan',
  'Platero',
  'Poblacion',
  'Pula',
  'Pulong Singkamas',
  'Sapang Bato',
  'Talabutab Norte',
  'Talabutab Sur',
]

// All 13 official barangays of General Tinio, Nueva Ecija — cross-checked
// against PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/general-tinio.html)
// and Wikipedia's article for General Tinio, Nueva Ecija.
const GENERAL_TINIO_BARANGAYS = [
  'Bago',
  'Concepcion',
  'Nazareth',
  'Padolina',
  'Palale',
  'Pias',
  'Poblacion Central',
  'Poblacion East',
  'Poblacion West',
  'Pulong Matong',
  'Rio Chico',
  'Sampaguita',
  'San Pedro',
]

// All 64 official barangays of Guimba, Nueva Ecija — cross-checked against
// PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/guimba.html) and Wikipedia's
// article for Guimba, Nueva Ecija.
const GUIMBA_BARANGAYS = [
  'Agcano',
  'Ayos Lomboy',
  'Bacayao',
  'Bagong Barrio',
  'Balbalino',
  'Balingog East',
  'Balingog West',
  'Banitan',
  'Bantug',
  'Bulakid',
  'Bunol',
  'Caballero',
  'Cabaruan',
  'Caingin Tabing Ilog',
  'Calem',
  'Camiling',
  'Cardinal',
  'Casongsong',
  'Catimon',
  'Cavite',
  'Cawayan Bugtong',
  'Consuelo',
  'Culong',
  'Escano',
  'Faigal',
  'Galvan',
  'Guiset',
  'Lamorito',
  'Lennec',
  'Macamias',
  'Macapabellag',
  'Macatcatuit',
  'Manacsac',
  'Manggang Marikit',
  'Maturanoc',
  'Maybubon',
  'Naglabrahan',
  'Nagpandayan',
  'Narvacan I',
  'Narvacan II',
  'Pacac',
  'Partida I',
  'Partida II',
  'Pasong Inchic',
  'Saint John District',
  'San Agustin',
  'San Andres',
  'San Bernardino',
  'San Marcelino',
  'San Miguel',
  'San Rafael',
  'San Roque',
  'Santa Ana',
  'Santa Cruz',
  'Santa Lucia',
  'Santa Veronica District',
  'Santo Cristo District',
  'Saranay District',
  'Sinulatan',
  'Subol',
  'Tampac I',
  'Tampac II & III',
  'Triala',
  'Yuson',
]

// All 27 official barangays of Jaen, Nueva Ecija — cross-checked against
// PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/jaen.html) and Wikipedia's
// article for Jaen, Nueva Ecija.
const JAEN_BARANGAYS = [
  'Calabasa',
  'Dampulan',
  'Don Mariano Marcos',
  'Hilera',
  'Imbunia',
  'Imelda Poblacion',
  'Lambakin',
  'Langla',
  'Magsalisi',
  'Malabon-Kaingin',
  'Marawa',
  'Niyugan',
  'Ocampo-Rivera District',
  'Pakol',
  'Pamacpacan',
  'Pinanggaan',
  'Putlod',
  'San Jose',
  'San Josef',
  'San Pablo',
  'San Roque',
  'San Vicente',
  'Santa Rita',
  'Santo Tomas North',
  'Santo Tomas South',
  'Sapang',
  'Ulanin-Pitak',
]

// All 17 official barangays of Laur, Nueva Ecija — cross-checked against
// PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/laur.html) and Wikipedia's
// article for Laur, Nueva Ecija.
const LAUR_BARANGAYS = [
  'Barangay I',
  'Barangay II',
  'Barangay III',
  'Barangay IV',
  'Betania',
  'Canantong',
  'Nauzon',
  'Pangarulong',
  'Pinagbayanan',
  'Sagana',
  'San Felipe',
  'San Fernando',
  'San Isidro',
  'San Josef',
  'San Juan',
  'San Vicente',
  'Siclong',
]

// All 11 official barangays of Licab, Nueva Ecija — cross-checked against
// PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/licab.html) and Wikipedia's
// article for Licab, Nueva Ecija.
const LICAB_BARANGAYS = [
  'Aquino',
  'Linao',
  'Poblacion Norte',
  'Poblacion Sur',
  'San Casimiro',
  'San Cristobal',
  'San Jose',
  'San Juan',
  'Santa Maria',
  'Tabing Ilog',
  'Villarosa',
]

// All 22 official barangays of Llanera, Nueva Ecija — cross-checked against
// PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/llanera.html) and Wikipedia's
// article for Llanera, Nueva Ecija.
const LLANERA_BARANGAYS = [
  'A. Bonifacio',
  'Bagumbayan',
  'Bosque',
  'Caridad Norte',
  'Caridad Sur',
  'Casile',
  'Florida Blanca',
  'General Luna',
  'General Ricarte',
  'Gomez',
  'Inanama',
  'Ligaya',
  'Mabini',
  'Murcon',
  'Plaridel',
  'San Felipe',
  'San Francisco',
  'San Nicolas',
  'San Vicente',
  'Santa Barbara',
  'Victoria',
  'Villa Viniegas',
]

// All 24 official barangays of Lupao, Nueva Ecija — cross-checked against
// PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/lupao.html) and Wikipedia's
// article for Lupao, Nueva Ecija.
const LUPAO_BARANGAYS = [
  'Agupalo Este',
  'Agupalo Weste',
  'Alalay Chica',
  'Alalay Grande',
  'Bagong Flores',
  'Balbalungao',
  'Burgos',
  'Cordero',
  'J. U. Tienzo',
  'Mapangpang',
  'Namulandayan',
  'Parista',
  'Poblacion East',
  'Poblacion North',
  'Poblacion South',
  'Poblacion West',
  'Salvacion I',
  'Salvacion II',
  'San Antonio Este',
  'San Antonio Weste',
  'San Isidro',
  'San Pedro',
  'San Roque',
  'Santo Domingo',
]

// All 21 official barangays of Nampicuan, Nueva Ecija — cross-checked against
// PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/nampicuan.html) and
// Wikipedia's article for Nampicuan, Nueva Ecija.
const NAMPICUAN_BARANGAYS = [
  'Alemania',
  'Ambasador Alzate Village',
  'Cabaducan East',
  'Cabaducan West',
  'Cabawangan',
  'East Central Poblacion',
  'Edy',
  'Estacion',
  'Maeling',
  'Mayantoc',
  'Medico',
  'Monic',
  'North Poblacion',
  'Northwest Poblacion',
  'Recuerdo',
  'South Central Poblacion',
  'Southeast Poblacion',
  'Southwest Poblacion',
  'Tony',
  'West Central Poblacion',
  'West Poblacion',
]

// All 14 official barangays of Pantabangan, Nueva Ecija — cross-checked
// against PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/pantabangan.html) and
// Wikipedia's article for Pantabangan, Nueva Ecija.
const PANTABANGAN_BARANGAYS = [
  'Cadaclan',
  'Cambitala',
  'Conversion',
  'Fatima',
  'Ganduz',
  'Liberty',
  'Malbang',
  'Marikit',
  'Napon-Napon',
  'Poblacion East',
  'Poblacion West',
  'Sampaloc',
  'San Juan',
  'Villarica',
]

// All 10 official barangays of Peñaranda, Nueva Ecija — cross-checked against
// PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/penaranda.html) and
// Wikipedia's article for Peñaranda, Nueva Ecija.
const PENARANDA_BARANGAYS = [
  'Callos',
  'Las Piñas',
  'Poblacion I',
  'Poblacion II',
  'Poblacion III',
  'Poblacion IV',
  'San Josef',
  'San Mariano',
  'Santo Tomas',
  'Sinasajan',
]

// All 16 official barangays of Quezon, Nueva Ecija — cross-checked against
// PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/quezon.html) and Wikipedia's
// article for Quezon, Nueva Ecija.
const QUEZON_BARANGAYS = [
  'Barangay I',
  'Barangay II',
  'Bertese',
  'Doña Lucia',
  'Dulong Bayan',
  'Ilog Baliwag',
  'Pulong Bahay',
  'San Alejandro',
  'San Andres I',
  'San Andres II',
  'San Manuel',
  'San Miguel',
  'Santa Clara',
  'Santa Rita',
  'Santo Cristo',
  'Santo Tomas Feria',
]

// All 26 official barangays of Rizal, Nueva Ecija — cross-checked against
// PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/rizal.html) and Wikipedia's
// article for Rizal, Nueva Ecija.
const RIZAL_BARANGAYS = [
  'Agbannawag',
  'Aglipay',
  'Bicos',
  'Cabucbucan',
  'Calaocan District',
  'Canaan East',
  'Canaan West',
  'Casilagan',
  'Del Pilar',
  'Estrella',
  'General Luna',
  'Macapsing',
  'Maligaya',
  'Paco Roman',
  'Pag-asa',
  'Poblacion Central',
  'Poblacion East',
  'Poblacion Norte',
  'Poblacion Sur',
  'Poblacion West',
  'Portal',
  'San Esteban',
  'San Gregorio',
  'Santa Monica',
  'Villa Labrador',
  'Villa Paraiso',
]

// All 16 official barangays of San Antonio, Nueva Ecija — cross-checked
// against PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/san-antonio.html) and
// Wikipedia's article for San Antonio, Nueva Ecija.
const SAN_ANTONIO_BARANGAYS = [
  'Buliran',
  'Cama Juan',
  'Julo',
  'Lawang Kupang',
  'Luyos',
  'Maugat',
  'Panabingan',
  'Papaya',
  'Poblacion',
  'San Francisco',
  'San Jose',
  'San Mariano',
  'Santa Barbara',
  'Santa Cruz',
  'Santo Cristo',
  'Tikiw',
]

// All 9 official barangays of San Isidro, Nueva Ecija — cross-checked against
// PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/san-isidro.html) and PSA's
// PSGC entry for San Isidro
// (psa.gov.ph/classification/psgc/barangays/0304925000).
const SAN_ISIDRO_BARANGAYS = [
  'Alua',
  'Calaba',
  'Malapit',
  'Mangga',
  'Poblacion',
  'Pulo',
  'San Roque',
  'Santo Cristo',
  'Tabon',
]

// All 15 official barangays of San Leonardo, Nueva Ecija — cross-checked
// against PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/san-leonardo.html)
// and Wikipedia's article for San Leonardo, Nueva Ecija.
// Spelling follows PhilAtlas (e.g. "San Bartolome" without the accent, plain
// "District" suffixes) over Wikipedia's "San Bartolomé" and "(Población)"
// suffixes.
const SAN_LEONARDO_BARANGAYS = [
  'Bonifacio District',
  'Burgos District',
  'Castellano',
  'Diversion',
  'Magpapalayoc',
  'Mallorca',
  'Mambangnan',
  'Nieves',
  'Rizal District',
  'San Anton',
  'San Bartolome',
  'San Roque',
  'Tabuating',
  'Tagumpay',
  'Tambo Adorable',
]

// All 33 official barangays of Santa Rosa, Nueva Ecija — cross-checked against
// PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/santa-rosa.html) and
// Wikipedia's article for Santa Rosa, Nueva Ecija.
// PhilAtlas spells one barangay "San Josep"; Wikipedia spells it "San Joseph"
// — PhilAtlas spelling kept per this file's convention.
const SANTA_ROSA_BARANGAYS = [
  'Aguinaldo',
  'Berang',
  'Burgos',
  'Cojuangco',
  'Del Pilar',
  'Gomez',
  'Inspector',
  'Isla',
  'La Fuente',
  'Liwayway',
  'Lourdes',
  'Luna',
  'Mabini',
  'Malacañang',
  'Maliolio',
  'Mapalad',
  'Rajal Centro',
  'Rajal Norte',
  'Rajal Sur',
  'Rizal',
  'San Gregorio',
  'San Isidro',
  'San Josep',
  'San Mariano',
  'San Pedro',
  'Santa Teresita',
  'Santo Rosario',
  'Sapsap',
  'Soledad',
  'Tagpos',
  'Tramo',
  'Valenzuela',
  'Zamora',
]

// All 24 official barangays of Santo Domingo, Nueva Ecija — cross-checked
// against PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/santo-domingo.html)
// and Wikipedia's article for Santo Domingo, Nueva Ecija.
const SANTO_DOMINGO_BARANGAYS = [
  'Baloc',
  'Buasao',
  'Burgos',
  'Cabugao',
  'Casulucan',
  'Comitang',
  'Concepcion',
  'Dolores',
  'General Luna',
  'Hulo',
  'Mabini',
  'Malasin',
  'Malaya',
  'Malayantoc',
  'Mambarao',
  'Poblacion',
  'Pulong Buli',
  'Sagaba',
  'San Agustin',
  'San Fabian',
  'San Francisco',
  'San Pascual',
  'Santa Rita',
  'Santo Rosario',
]

// All 53 official barangays of Talavera, Nueva Ecija — cross-checked against
// PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/talavera.html) and
// Wikipedia's article for Talavera, Nueva Ecija.
// Spelling follows PhilAtlas over Wikipedia in a couple of spots (e.g. "Andal
// Alino" vs Wikipedia's "Andal Aliño", "Bantug Hamog" vs Wikipedia's "Basang
// Hamog").
const TALAVERA_BARANGAYS = [
  'Andal Alino',
  'Bagong Sikat',
  'Bagong Silang',
  'Bakal I',
  'Bakal II',
  'Bakal III',
  'Baluga',
  'Bantug',
  'Bantug Hacienda',
  'Bantug Hamog',
  'Bugtong na Buli',
  'Bulac',
  'Burnay',
  'Caaniplahan',
  'Cabubulaonan',
  'Calipahan',
  'Campos',
  'Caputican',
  'Casulucan Este',
  'Collado',
  'Dimasalang Norte',
  'Dimasalang Sur',
  'Dinarayat',
  'Esguerra District',
  'Gulod',
  'Homestead I',
  'Homestead II',
  'Kinalanguyan',
  'La Torre',
  'Lomboy',
  'Mabuhay',
  'Maestrang Kikay',
  'Mamandil',
  'Marcos District',
  'Matingkis',
  'Minabuyoc',
  'Pag-asa',
  'Paludpod',
  'Pantoc Bulac',
  'Pinagpanaan',
  'Poblacion Sur',
  'Pula',
  'Pulong San Miguel',
  'Purok Matias',
  'Sampaloc',
  'San Miguel na Munti',
  'San Pascual',
  'San Ricardo',
  'Sibul',
  'Sicsican Matanda',
  'Tabacao',
  'Tagaytay',
  'Valle',
]

// All 28 official barangays of Talugtug, Nueva Ecija — cross-checked against
// PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/talugtug.html) and
// Wikipedia's article for Talugtug, Nueva Ecija.
const TALUGTUG_BARANGAYS = [
  'Alula',
  'Baybayabas',
  'Buted',
  'Cabiangan',
  'Calisitan',
  'Cinense',
  'Culiat',
  'Maasin',
  'Magsaysay',
  'Mayamot I',
  'Mayamot II',
  'Nangabulan',
  'Osmeña',
  'Pangit',
  'Patola',
  'Quezon',
  'Quirino',
  'Roxas',
  'Saguing',
  'Sampaloc',
  'Santa Catalina',
  'Santo Domingo',
  'Saringaya',
  'Saverona',
  'Tandoc',
  'Tibag',
  'Villa Boado',
  'Villa Rosario',
]

// All 19 official barangays of Zaragoza, Nueva Ecija — cross-checked against
// PhilAtlas (philatlas.com/luzon/r03/nueva-ecija/zaragoza.html) and
// Wikipedia's article for Zaragoza, Nueva Ecija.
const ZARAGOZA_BARANGAYS = [
  'Batitang',
  'Carmen',
  'Concepcion',
  'Del Pilar',
  'General Luna',
  'H. Romero',
  'Macarse',
  'Manaul',
  'Mayamot',
  'Pantoc',
  'San Isidro',
  'San Rafael',
  'San Vicente',
  'Santa Cruz',
  'Santa Lucia Old',
  'Santa Lucia Young',
  'Santo Rosario Old',
  'Santo Rosario Young',
  'Valeriana',
]

// A small illustrative Province → City/Municipality → Barangay tree for the
// TODA/driver/passenger/parent registration address picker — NOT the full
// PSGC registry, just enough real-shaped sample data to demo a cascading
// address select. Reuses the same barangay names already seeded elsewhere in
// this app (Poblacion, San Isidro, San Roque) so the world stays consistent.
export const PH_ADDRESS_TREE: Record<string, Record<string, string[]>> = {
  // Default province for every address form in the app (see
  // PhAddressFields' EMPTY_PH_ADDRESS) — listed first, and Nueva Ecija's
  // full real set of 5 cities + 27 municipalities is filled in (unlike the
  // other provinces below, which only sample a couple of cities each) so
  // the City/Municipality dropdown is actually complete once the province
  // defaults here. Every Nueva Ecija city/municipality below now has its own
  // real, individually-verified barangay list (see the named *_BARANGAYS
  // constants above, each with its sourcing noted). San Jose City and
  // Science City of Muñoz are listed first (object key order = the
  // dropdown's display order) since they're this app's two default booking
  // cities — see DEFAULT_BOOKING_CITY and the CLSU-first barangay ordering
  // in SCIENCE_CITY_MUNOZ_BARANGAYS below.
  'Nueva Ecija': {
    'San Jose City': SAN_JOSE_CITY_BARANGAYS,
    'Science City of Muñoz': SCIENCE_CITY_MUNOZ_BARANGAYS,
    'Cabanatuan City': CABANATUAN_CITY_BARANGAYS,
    'Gapan City': GAPAN_CITY_BARANGAYS,
    'Palayan City': PALAYAN_CITY_BARANGAYS,
    Aliaga: ALIAGA_BARANGAYS,
    Bongabon: BONGABON_BARANGAYS,
    Cabiao: CABIAO_BARANGAYS,
    Carranglan: CARRANGLAN_BARANGAYS,
    Cuyapo: CUYAPO_BARANGAYS,
    Gabaldon: GABALDON_BARANGAYS,
    'General Mamerto Natividad': GENERAL_MAMERTO_NATIVIDAD_BARANGAYS,
    'General Tinio': GENERAL_TINIO_BARANGAYS,
    Guimba: GUIMBA_BARANGAYS,
    Jaen: JAEN_BARANGAYS,
    Laur: LAUR_BARANGAYS,
    Licab: LICAB_BARANGAYS,
    Llanera: LLANERA_BARANGAYS,
    Lupao: LUPAO_BARANGAYS,
    Nampicuan: NAMPICUAN_BARANGAYS,
    Pantabangan: PANTABANGAN_BARANGAYS,
    Peñaranda: PENARANDA_BARANGAYS,
    Quezon: QUEZON_BARANGAYS,
    Rizal: RIZAL_BARANGAYS,
    'San Antonio': SAN_ANTONIO_BARANGAYS,
    'San Isidro': SAN_ISIDRO_BARANGAYS,
    'San Leonardo': SAN_LEONARDO_BARANGAYS,
    'Santa Rosa': SANTA_ROSA_BARANGAYS,
    'Santo Domingo': SANTO_DOMINGO_BARANGAYS,
    Talavera: TALAVERA_BARANGAYS,
    Talugtug: TALUGTUG_BARANGAYS,
    Zaragoza: ZARAGOZA_BARANGAYS,
  },
  Batangas: {
    'San Juan': ['Poblacion', 'San Isidro', 'San Roque', 'Sto. Niño', 'Bagong Silang'],
    Rosario: ['Barangay 1', 'Barangay 2', 'Barangay 3', 'Barangay Bagong Pook'],
  },
  Cavite: {
    Tagaytay: ['Barangay Kaybagal', 'Barangay Sungay', 'Barangay Maitim'],
  },
  Laguna: {
    'Sta. Cruz': ['Barangay Poblacion', 'Barangay Bubukal', 'Barangay Duhat'],
  },
}

export const PH_PROVINCES = Object.keys(PH_ADDRESS_TREE)

export function getCitiesForProvince(province: string): string[] {
  return Object.keys(PH_ADDRESS_TREE[province] ?? {})
}

export function getBarangaysForCity(province: string, city: string): string[] {
  return PH_ADDRESS_TREE[province]?.[city] ?? []
}

// App Admin isn't self-service (unlike Passenger/Parent/Driver, nobody
// signs up as Admin) — this prototype has exactly one operator account,
// provisioned here instead of through a registration flow.
//
// No longer printed on the login screen. That was fine while every device
// kept its own copy of the world: the worst a curious visitor could do was
// rearrange their own demo. Since the pilot moved to one shared database,
// the same click changes the service switches, tariffs and partner records
// for every tester at once — so the credential has to be something you hand
// out, not something the screen hands out.
//
// Still not real security: these strings ship inside the JavaScript bundle
// and anyone willing to open devtools can read them. It is the difference
// between a door that is closed and a door with the key taped to it.
export const APP_ADMIN_CREDENTIALS = { username: 'admin', password: 'admin321' }

// A second accepted identity for the same single App Admin/Super Admin
// role — lets the operator log in with their real email instead of the
// generic 'admin' username, same password (this whole panel is already
// shown as a plaintext demo credential above, so this doesn't weaken
// anything). Not a separate account/permission tier — it's the same
// role='admin' session either way.
export const APP_SUPER_ADMIN_EMAIL = 'cmmacalinao@gmail.com'

// Super Admin now signs in with its OWN credentials, not the Admin ones.
// Keeping them separate is the whole point of the tier: someone running
// day-to-day operations should not be one click away from the toggles that
// switch services off for every user, the TaaS partner hierarchy, or the
// banner ads. The Founder's email works here too, so they can use a real
// address rather than a generic username.
// Where Contact us messages are addressed. Change this one line to point at
// a different support mailbox.
export const APP_SUPPORT_EMAIL = 'support@todasaferide.ph'

export const APP_SUPER_ADMIN_CREDENTIALS = { username: 'superadmin', password: 'super321' }
// Who that email belongs to — shown on the login screen and the Accounting
// allowlist so the Founder's access reads as a named person rather than an
// anonymous address.
export const APP_SUPER_ADMIN_NAME = 'Cesar Macalinao'

// A second, separate credential gating the Accounting & Compliance panel —
// deliberately independent of APP_ADMIN_CREDENTIALS so that "can operate
// the platform" and "can see income/expense records" are different
// permissions, matching how a real TODA/cooperative would restrict its
// books to a treasurer/finance officer rather than every admin user. Shown
// on the lock screen since, like the admin login above, there's no other
// way to discover it in a demo.
export const ACCOUNTING_OFFICER_CREDENTIALS = { password: 'finance2026' }

// Seed roster for the Accounting & Compliance allowlist — who's registered
// to unlock that page (see AccountingOfficer in types). Only these emails
// (case-insensitive) pass the lock screen; the App Admin adds/removes
// officers from the main Admin dashboard, not from inside the restricted
// page itself.
// Real dialable numbers, not simulated data. Only entries that could actually
// be sourced are seeded here — deliberately NOT filled out with plausible
// city-level numbers, because a wrong emergency number is worse than a
// missing one. The App Admin adds local numbers per city from Rides & Safety,
// and each starts unverified until someone confirms it by calling.
//
// Sourced 19 Aug 2026:
//   National — https://ehotlines.e.gov.ph/ and https://stg.portal.gov.ph/hotlines
//   Nueva Ecija PDRRMO / Cabanatuan BFP — PDRRMO Nueva Ecija public listings
export const MOCK_EMERGENCY_HOTLINES: EmergencyHotline[] = [
  {
    id: 'hl-nat-911',
    name: 'National Emergency Hotline',
    number: '911',
    category: 'rescue',
    province: null,
    city: null,
    source: 'https://ehotlines.e.gov.ph/',
    verified: true,
    addedAt: '2026-08-19T00:00:00.000Z',
  },
  {
    id: 'hl-nat-pnp',
    name: 'Philippine National Police',
    number: '117',
    category: 'police',
    province: null,
    city: null,
    source: 'https://ehotlines.e.gov.ph/',
    verified: true,
    addedAt: '2026-08-19T00:00:00.000Z',
  },
  {
    id: 'hl-nat-bfp',
    name: 'Bureau of Fire Protection',
    number: '160',
    category: 'fire',
    province: null,
    city: null,
    source: 'https://ehotlines.e.gov.ph/',
    verified: true,
    addedAt: '2026-08-19T00:00:00.000Z',
  },
  {
    id: 'hl-nat-redcross',
    name: 'Philippine Red Cross',
    number: '143',
    category: 'medical',
    province: null,
    city: null,
    source: 'https://ehotlines.e.gov.ph/',
    verified: true,
    addedAt: '2026-08-19T00:00:00.000Z',
  },
  {
    id: 'hl-ne-pdrrmo-1',
    name: 'Nueva Ecija PDRRMO',
    number: '(044) 940-5760',
    category: 'disaster',
    province: 'Nueva Ecija',
    city: null,
    source: 'PDRRMO Nueva Ecija public listing',
    verified: false,
    addedAt: '2026-08-19T00:00:00.000Z',
  },
  {
    id: 'hl-ne-pdrrmo-2',
    name: 'Nueva Ecija PDRRMO (mobile)',
    number: '0916-362-2365',
    category: 'disaster',
    province: 'Nueva Ecija',
    city: null,
    source: 'PDRRMO Nueva Ecija public listing',
    verified: false,
    addedAt: '2026-08-19T00:00:00.000Z',
  },
  {
    id: 'hl-cab-bfp',
    name: 'BFP Cabanatuan',
    number: '(044) 600-5696',
    category: 'fire',
    province: 'Nueva Ecija',
    city: 'Cabanatuan City',
    source: 'Cabanatuan City emergency hotline listing',
    verified: false,
    addedAt: '2026-08-19T00:00:00.000Z',
  },
  // San Jose City — from the LGU's published emergency hotline poster,
  // supplied by the App Admin. Marked verified because these came from the
  // operator's own local source rather than a scraped web listing.
  {
    id: 'hl-sjc-pnp',
    name: 'PNP San Jose City',
    number: '0933-852-4307',
    category: 'police',
    province: 'Nueva Ecija',
    city: 'San Jose City',
    source: 'San Jose City emergency hotline poster (via App Admin)',
    verified: true,
    addedAt: '2026-08-19T00:00:00.000Z',
  },
  {
    id: 'hl-sjc-bfp',
    name: 'BFP San Jose City',
    number: '0915-257-2733',
    category: 'fire',
    province: 'Nueva Ecija',
    city: 'San Jose City',
    source: 'San Jose City emergency hotline poster (via App Admin)',
    verified: true,
    addedAt: '2026-08-19T00:00:00.000Z',
  },
  {
    id: 'hl-sjc-bfp-2',
    name: 'BFP San Jose City (second line)',
    number: '0925-453-0777',
    category: 'fire',
    province: 'Nueva Ecija',
    city: 'San Jose City',
    source: 'San Jose City emergency hotline poster (via App Admin)',
    verified: true,
    addedAt: '2026-08-19T00:00:00.000Z',
  },
  {
    id: 'hl-sjc-drrm',
    name: 'DRRM San Jose City',
    number: '0915-168-9878',
    category: 'disaster',
    province: 'Nueva Ecija',
    city: 'San Jose City',
    source: 'San Jose City emergency hotline poster (via App Admin)',
    verified: true,
    addedAt: '2026-08-19T00:00:00.000Z',
  },
  // Science City of Muñoz — from the official LGU directory, supplied by the
  // App Admin. Each line is its own entry so every number is individually
  // tappable; a caller shouldn't have to retype a second number by hand when
  // the first one rings out.
  {
    id: 'hl-mun-cdrrmo',
    name: 'CDRRMO Muñoz',
    number: '(044) 456-3119',
    category: 'disaster',
    province: 'Nueva Ecija',
    city: 'Science City of Muñoz',
    source: 'Science City of Muñoz LGU directory (via App Admin)',
    notes: '24/7',
    verified: true,
    addedAt: '2026-08-19T00:00:00.000Z',
  },
  {
    id: 'hl-mun-cdrrmo-m1',
    name: 'CDRRMO Muñoz (mobile)',
    number: '0965-058-5644',
    category: 'disaster',
    province: 'Nueva Ecija',
    city: 'Science City of Muñoz',
    source: 'Science City of Muñoz LGU directory (via App Admin)',
    notes: '24/7',
    verified: true,
    addedAt: '2026-08-19T00:00:00.000Z',
  },
  {
    id: 'hl-mun-cdrrmo-m2',
    name: 'CDRRMO Muñoz (mobile 2)',
    number: '0912-846-6896',
    category: 'disaster',
    province: 'Nueva Ecija',
    city: 'Science City of Muñoz',
    source: 'Science City of Muñoz LGU directory (via App Admin)',
    notes: '24/7',
    verified: true,
    addedAt: '2026-08-19T00:00:00.000Z',
  },
  {
    id: 'hl-mun-pnp',
    name: 'PNP Muñoz',
    number: '(044) 456-0104',
    category: 'police',
    province: 'Nueva Ecija',
    city: 'Science City of Muñoz',
    source: 'Science City of Muñoz LGU directory (via App Admin)',
    notes: '24/7',
    verified: true,
    addedAt: '2026-08-19T00:00:00.000Z',
  },
  {
    id: 'hl-mun-pnp-m1',
    name: 'PNP Muñoz (mobile)',
    number: '0915-599-1424',
    category: 'police',
    province: 'Nueva Ecija',
    city: 'Science City of Muñoz',
    source: 'Science City of Muñoz LGU directory (via App Admin)',
    notes: '24/7',
    verified: true,
    addedAt: '2026-08-19T00:00:00.000Z',
  },
  {
    id: 'hl-mun-pnp-m2',
    name: 'PNP Muñoz (mobile 2)',
    number: '0998-598-5417',
    category: 'police',
    province: 'Nueva Ecija',
    city: 'Science City of Muñoz',
    source: 'Science City of Muñoz LGU directory (via App Admin)',
    notes: '24/7',
    verified: true,
    addedAt: '2026-08-19T00:00:00.000Z',
  },
  {
    id: 'hl-mun-bfp',
    name: 'BFP Muñoz',
    number: '0954-178-1747',
    category: 'fire',
    province: 'Nueva Ecija',
    city: 'Science City of Muñoz',
    source: 'Science City of Muñoz LGU directory (via App Admin)',
    notes: '24/7',
    verified: true,
    addedAt: '2026-08-19T00:00:00.000Z',
  },
  {
    id: 'hl-mun-oslam',
    name: 'OsLAM',
    number: '(044) 511-6234',
    category: 'medical',
    province: 'Nueva Ecija',
    city: 'Science City of Muñoz',
    source: 'Science City of Muñoz LGU directory (via App Admin)',
    notes: '24/7',
    verified: true,
    addedAt: '2026-08-19T00:00:00.000Z',
  },
  {
    id: 'hl-mun-oslam-m',
    name: 'OsLAM (mobile)',
    number: '0977-776-9802',
    category: 'medical',
    province: 'Nueva Ecija',
    city: 'Science City of Muñoz',
    source: 'Science City of Muñoz LGU directory (via App Admin)',
    notes: '24/7',
    verified: true,
    addedAt: '2026-08-19T00:00:00.000Z',
  },
]

export const MOCK_ACCOUNTING_OFFICERS: AccountingOfficer[] = [
  {
    // The Founder holds Super Admin (see APP_SUPER_ADMIN_EMAIL) but that's a
    // deliberately separate permission from seeing the books, so he needs an
    // entry here too — same email, listed explicitly rather than special-cased
    // in the lock screen, so he can be removed like any other officer.
    id: 'officer-founder',
    name: APP_SUPER_ADMIN_NAME,
    email: APP_SUPER_ADMIN_EMAIL,
    position: 'Other',
    otherPositionLabel: 'Founder',
    addedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'officer-1',
    name: 'Celeste M.',
    email: 'celeste.president@todaride.ph',
    position: 'President',
    otherPositionLabel: null,
    addedAt: '2026-01-05T00:00:00.000Z',
  },
  {
    id: 'officer-2',
    name: 'Elena D.',
    email: 'elena.treasurer@todaride.ph',
    position: 'Treasurer',
    otherPositionLabel: null,
    addedAt: '2026-01-05T00:00:00.000Z',
  },
]

// Seed cap table — the proposed corporate structure as configurable data,
// not hard-coded logic (see EquityAllocation in types). Founder/Investors/
// Developers/Strategic/Future pools sum to 100%; percentages and holder
// names are editable from the Cap Table section, same restricted-page
// pattern as the rest of Accounting & Compliance. Illustrative starting
// point only — not a substitute for actual corporate/legal documentation.
export const MOCK_EQUITY_ALLOCATIONS: EquityAllocation[] = [
  {
    id: 'equity-1',
    holderName: 'Cesar Macalinao',
    category: 'Founder',
    otherCategoryLabel: null,
    percentage: 35,
    notes: 'Founder & Main Developer — contribution-based (concept, software, IP, leadership), not a cash requirement.',
    addedAt: '2026-01-05T00:00:00.000Z',
  },
  {
    id: 'equity-2',
    holderName: 'Investor Pool',
    category: 'Investors',
    otherCategoryLabel: null,
    percentage: 30,
    notes: 'Reserved pool — allocated per investment round as investors join.',
    addedAt: '2026-01-05T00:00:00.000Z',
  },
  {
    id: 'equity-3',
    holderName: 'Developers & Key Personnel Pool',
    category: 'Developers & Key Personnel',
    otherCategoryLabel: null,
    percentage: 15,
    notes: 'Reserved pool — allocated per person with vesting, not issued automatically.',
    addedAt: '2026-01-05T00:00:00.000Z',
  },
  {
    id: 'equity-4',
    holderName: 'Strategic / Community Partner Pool',
    category: 'Strategic / Community Pool',
    otherCategoryLabel: null,
    percentage: 10,
    notes: 'Reserved — not automatically issued to any partner.',
    addedAt: '2026-01-05T00:00:00.000Z',
  },
  {
    id: 'equity-5',
    holderName: 'Future Investor / Employee Pool',
    category: 'Future Investor / Employee Pool',
    otherCategoryLabel: null,
    percentage: 10,
    notes: 'Reserved for future investors, executives, or key hires.',
    addedAt: '2026-01-05T00:00:00.000Z',
  },
]

// Deliberately blank/zero — this is real legal filing data (SEC Articles of
// Incorporation / General Information Sheet figures) that must come from an
// actual registration, never a placeholder guess. Filled in from the
// Capitalization & Stockholding page once the company is actually
// registered.
export const DEFAULT_CORPORATE_REGISTRATION: CorporateRegistrationInfo = {
  companyName: '',
  secRegistrationNo: '',
  registrationDate: null,
  tin: '',
  principalOfficeAddress: '',
  primaryPurpose: '',
  corporateTermYears: null,
  authorizedCapitalStock: 0,
  parValuePerShare: 0,
  numberOfSharesAuthorized: 0,
  subscribedCapitalStock: 0,
  paidUpCapitalStock: 0,
  treasurerInTrust: null,
  updatedAt: null,
}

// Starting TODARIDE COINS amounts per earning action — Admin-configurable
// via setRewardRules (Income & Promotion → Rewards tab).
export const DEFAULT_REWARD_RULES: RewardRules = {
  registration: 50,
  verification: 25,
  ride: 5,
  rating: 5,
  review: 10,
  referral: 100,
  socialShare: 10,
  safety: 15,
  campaign: 20,
}

// Coin → ride-credit conversion tiers — admin-configurable list, not fixed
// math (see RideCreditTier). These are the brief's own example tiers.
export const DEFAULT_RIDE_CREDIT_TIERS: RideCreditTier[] = [
  { id: 'credit-tier-1', coins: 100, pesoValue: 5 },
  { id: 'credit-tier-2', coins: 200, pesoValue: 10 },
  { id: 'credit-tier-3', coins: 500, pesoValue: 25 },
]

export const DEFAULT_INCOME_PROMOTION_SETTINGS: IncomePromotionSettings = {
  theoreticalCommissionRatePct: 7.5,
  coinExpirationDays: null,
  fraudReferralThreshold: 5,
  defaultCampaignDailyLimit: null,
  defaultCampaignWeeklyLimit: null,
  defaultCampaignMonthlyLimit: null,
}

// A single starter advertiser + campaign so the header ad banner (see
// AdBanner.tsx) has something real to show out of the box, instead of an
// empty header or a hardcoded string outside the actual Advertiser/Campaign
// data model. Admin can edit or delete this from Income & Promotion →
// Advertisers/Campaigns like any other record — it's real seed data, not a
// separate hardcoded demo.
export const MOCK_ADVERTISERS: Advertiser[] = [
  {
    id: 'advertiser-sample-1',
    businessName: "Ka-Load Padala Center",
    category: 'Load, Bills Payment & Padala',
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'Crisanto Sanchez Poblacion',
    addressDetail: 'Beside the Public Market Terminal',
    contactName: 'Julie Santos',
    contactPhone: '0917-555-0001',
    contactEmail: null,
    plan: 'standard',
    monthlyValue: 800,
    status: 'active',
    joinedAt: '2026-01-05T00:00:00.000Z',
    notes: 'Sample advertiser, shown in the header ad banner as a working demo.',
  },
]

export const MOCK_CAMPAIGNS: Campaign[] = [
  {
    id: 'campaign-sample-1',
    name: 'Ka-Load Padala Center — Grand Opening',
    description: 'Load, bills payment, and padala — right beside the Terminal. Fast and reliable, para sa drivers at pasahero!',
    type: 'merchant_promotion',
    targetAudience: 'public',
    startDate: '2026-01-05',
    endDate: null,
    rewardCoins: 0,
    rewardNote: null,
    budget: 800,
    dailyLimit: null,
    weeklyLimit: null,
    monthlyLimit: null,
    status: 'active',
    advertiserId: 'advertiser-sample-1',
    reach: 0,
    clicks: 0,
    shares: 0,
    participants: 0,
    createdAt: '2026-01-05T00:00:00.000Z',
    updatedAt: null,
  },
]

// Off by default — see AdSenseSettings in types/index.ts. Admin pastes in a
// real Publisher ID + slot IDs from an actual AdSense account under
// Income & Promotion → Settings to turn this on; nothing here fabricates
// working credentials.
export const DEFAULT_ADSENSE_SETTINGS: AdSenseSettings = {
  enabled: false,
  publisherId: null,
  slots: {
    landing: null,
    passengerTop: null,
    passengerBottom: null,
    driverTop: null,
    driverBottom: null,
    parentBottom: null,
  },
}

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  driver_incentives: 'Driver incentives',
  fuel_subsidy: 'Fuel subsidy',
  maintenance: 'Vehicle & equipment maintenance',
  marketing: 'Marketing & promotions',
  sms_api_fees: 'SMS / API / hosting fees',
  office_admin: 'Office & admin supplies',
  salaries: 'Staff salaries',
  permits_fees: 'Permits, licenses & government fees',
  other: 'Other',
}

export const TODA_EXPENSE_CATEGORY_LABELS: Record<TodaExpenseCategory, string> = {
  fuel_subsidy: 'Fuel subsidy',
  terminal_maintenance: 'Terminal maintenance',
  event: 'Fiesta / event',
  officer_honorarium: 'Officer honorarium',
  office_admin: 'Office & admin supplies',
  other: 'Other',
}

// A starting checklist of Philippine compliance items relevant to running a
// tricycle-dispatch platform as an actual registered business — not legal
// advice, just the common obligations an operator would otherwise have to
// piece together from several agencies. Admin can check items off as
// they're completed; the list itself is fixed (add new items here as
// requirements change, rather than making it admin-editable).
export interface ComplianceChecklistItem {
  id: string
  label: string
  detail: string
}

export const COMPLIANCE_CHECKLIST: ComplianceChecklistItem[] = [
  {
    id: 'dti-sec',
    label: 'DTI (sole proprietor) or SEC (partnership/corporation) registration',
    detail: 'Registers the business name itself — the prerequisite for every other registration below.',
  },
  {
    id: 'lgu-permit',
    label: "Mayor's / Business Permit from the LGU",
    detail: 'Renewed annually with the city/municipality where the business operates.',
  },
  {
    id: 'bir-cor',
    label: 'BIR Certificate of Registration (Form 2303) + registered Books of Accounts',
    detail: 'Required before legally issuing any receipt or filing any tax return.',
  },
  {
    id: 'bir-receipts',
    label: 'BIR-registered official receipts/invoices for platform fees collected',
    detail: 'Commission and service fees collected from drivers/riders should be receipted, not informal.',
  },
  {
    id: 'bir-filing',
    label: 'Percentage tax or VAT registration, filed monthly/quarterly as required',
    detail: 'Which one applies depends on gross annual receipts — confirm the threshold with BIR or an accountant.',
  },
  {
    id: 'bir-annual',
    label: 'Annual Income Tax Return filing',
    detail: 'Due the following tax year on gross income minus allowable deductions (including logged expenses).',
  },
  {
    id: 'ltfrb-toda',
    label: 'LTFRB/LGU franchise or accreditation for TODA tricycle operation',
    detail: "Confirms the app's dispatched trips are covered by each TODA's actual franchise, not just the app's own terms.",
  },
  {
    id: 'data-privacy',
    label: 'Data Privacy Act compliance / NPC registration',
    detail: 'The app collects GPS location, driver IDs/licenses, and contact info — registrable personal data processing.',
  },
  {
    id: 'sss-philhealth',
    label: 'SSS, PhilHealth, Pag-IBIG registration & remittance for actual employees',
    detail: 'Applies to hired staff (dispatchers, admins) — independent drivers are a separate classification question.',
  },
  {
    id: 'toda-agreements',
    label: 'Written agreements with each TODA on commission/revenue-sharing terms',
    detail: "Matches what's configured in the TODA commission approvals above — put it in writing too, not just in-app.",
  },
  {
    id: 'insurance',
    label: 'Passenger/third-party liability insurance coverage',
    detail: 'Standard practice for any passenger transport service, independent of individual driver insurance.',
  },
  {
    id: 'reconciliation',
    label: 'Regular reconciliation of driver payouts vs. platform revenue vs. TODA commissions',
    detail: 'Bookkeeping hygiene — cross-check the income breakdown chart against actual bank/e-wallet movements periodically.',
  },
]

// TaaS Level 1 — SaaS Partner pricing tiers, per the TODASafeRide-as-a-Service
// business roadmap (Starter ₱2,500/mo, Standard ₱5,000/mo, Premium ₱8,000-
// 10,000/mo — using the midpoint here). Used both to seed new TodaOrganizations
// and by AdminPage.tsx's plan-change control.
// Where platform fees are settled to: the GCash account TODASafeRide itself
// collects on. Seeded here and editable by the App Admin at runtime, because
// a wrong number here is a pilot's first support ticket.
export const PLATFORM_GCASH_ACCOUNT: PaymentAccountDetails = {
  accountName: 'TODA Ride Mobility Platform',
  accountNumber: '0917-800-2020',
  qrDataUrl: null,
}

export const SAAS_PLAN_FEES: Record<SaasPlan, number> = {
  starter: 2500,
  standard: 5000,
  premium: 9000,
}

// NATO — the University Transport System operating inside CLSU. Its three
// gate terminals are the ones students actually queue at, so they are seeded
// as real records rather than left as an address on the organisation.
export const UTS_ORG_ID = 'toda-nato-uts'

// Coordinates are approximations placed off the campus anchor — close enough
// to dispatch and draw from, and meant to be corrected with a real reading
// from each gate.
// The terminals live in terminals.seed.json rather than in this file, so the
// app itself can write them back: Admin > Terminals has a Save-to-seed action
// that posts the current list to a dev-server endpoint, which rewrites that
// file. A pin someone walked to the gate to place is worth more than one
// typed here, and this is what keeps it out of a single browser’s storage.
export const MOCK_TERMINALS: Terminal[] = terminalSeed as Terminal[]

// Named places a passenger can search for as a destination instead of
// picking a barangay — Nueva Ecija addressing runs on landmarks ("palengke",
// "sa may simbahan"), not street names. Reuses coordinates and addresses
// already seeded elsewhere in this file (the vendors, CLSU/UTS) so a
// landmark search result and an existing booking address agree, rather than
// inventing a second set of Nueva Ecija coordinates. See lib/landmarkSearch.ts
// for how a typed query gets matched against these.
export const MOCK_LANDMARKS: Landmark[] = [
  {
    id: 'landmark-1',
    name: 'San Jose City Public Market',
    aliases: ['palengke', 'pamilihan', 'san jose market', 'public market'],
    category: 'market',
    city: 'San Jose City',
    gps: { lat: 15.7996, lng: 120.9861 },
    todaOrgId: null,
  },
  {
    id: 'landmark-2',
    name: 'Central Luzon State University',
    aliases: ['clsu', 'unibersidad', 'university', 'clsu main gate'],
    category: 'school',
    city: 'Science City of Muñoz',
    gps: { lat: 15.7312, lng: 120.9298 },
    todaOrgId: null,
  },
  {
    id: 'landmark-3',
    name: 'San Jose City Cathedral',
    aliases: ['simbahan', 'church', 'san jose cathedral', 'parokya'],
    category: 'church',
    city: 'San Jose City',
    gps: { lat: 15.795, lng: 120.985 },
    todaOrgId: null,
  },
  {
    id: 'landmark-5',
    name: 'San Jose City Hall',
    aliases: ['city hall', 'munisipyo', 'bayan'],
    category: 'government',
    city: 'San Jose City',
    gps: { lat: 15.79, lng: 120.98 },
    todaOrgId: null,
  },
  {
    id: 'landmark-6',
    name: 'Genesis San Jose City Terminal',
    aliases: ['terminal', 'bus terminal', 'byahe', 'genesis terminal'],
    category: 'transport',
    city: 'San Jose City',
    gps: { lat: 15.802, lng: 120.995 },
    todaOrgId: null,
  },
  {
    id: 'landmark-7',
    name: 'Malasin Covered Court',
    aliases: ['covered court', 'basketball court', 'malasin court'],
    category: 'other',
    city: 'San Jose City',
    gps: { lat: 15.806, lng: 120.999 },
    todaOrgId: null,
  },
  {
    id: 'landmark-8',
    name: 'CLSU Gate 2, Science City of Muñoz',
    aliases: ['clsu gate 2', 'munoz gate', 'gate 2'],
    category: 'school',
    city: 'Science City of Muñoz',
    gps: { lat: 15.7325, lng: 120.9312 },
    todaOrgId: null,
  },
  ...CLSU_CAMPUS_LANDMARKS,
  ...BARANGAY_LANDMARKS,
  ...OSM_ESTABLISHMENT_LANDMARKS,
]

// The CLSU campus as OpenStreetMap has it (way 794431227, ODbL), thinned
// from 170 vertices to the 61 that keep the outline within about 8 m of the
// original — enough to tell inside from outside without carrying a survey
// file around. Seeded rather than drawn because a real boundary anyone can
// check beats a rectangle someone tapped out to see the feature work.
export const CLSU_CAMPUS_BOUNDARY: GeoCoords[] = [
  { lat: 15.741999, lng: 120.9219 },
  { lat: 15.738132, lng: 120.922745 },
  { lat: 15.738219, lng: 120.92357 },
  { lat: 15.737282, lng: 120.923738 },
  { lat: 15.737329, lng: 120.923982 },
  { lat: 15.735955, lng: 120.92323 },
  { lat: 15.732759, lng: 120.923934 },
  { lat: 15.732764, lng: 120.924147 },
  { lat: 15.732687, lng: 120.92395 },
  { lat: 15.726165, lng: 120.925393 },
  { lat: 15.726222, lng: 120.92564 },
  { lat: 15.728214, lng: 120.927749 },
  { lat: 15.726991, lng: 120.929016 },
  { lat: 15.726377, lng: 120.92837 },
  { lat: 15.726185, lng: 120.928575 },
  { lat: 15.726635, lng: 120.929064 },
  { lat: 15.726448, lng: 120.929287 },
  { lat: 15.726238, lng: 120.929083 },
  { lat: 15.726458, lng: 120.930545 },
  { lat: 15.726329, lng: 120.930608 },
  { lat: 15.725735, lng: 120.930448 },
  { lat: 15.725654, lng: 120.930536 },
  { lat: 15.725835, lng: 120.942436 },
  { lat: 15.726287, lng: 120.942435 },
  { lat: 15.72629, lng: 120.943374 },
  { lat: 15.726409, lng: 120.943373 },
  { lat: 15.726453, lng: 120.94414 },
  { lat: 15.725841, lng: 120.94413 },
  { lat: 15.726, lng: 120.954071 },
  { lat: 15.729015, lng: 120.95362 },
  { lat: 15.728197, lng: 120.949256 },
  { lat: 15.73184, lng: 120.948218 },
  { lat: 15.731531, lng: 120.946157 },
  { lat: 15.734229, lng: 120.945486 },
  { lat: 15.734876, lng: 120.950024 },
  { lat: 15.735606, lng: 120.950235 },
  { lat: 15.735676, lng: 120.950144 },
  { lat: 15.737768, lng: 120.950826 },
  { lat: 15.737339, lng: 120.952217 },
  { lat: 15.739716, lng: 120.952032 },
  { lat: 15.744402, lng: 120.951093 },
  { lat: 15.744713, lng: 120.950757 },
  { lat: 15.744739, lng: 120.949827 },
  { lat: 15.741003, lng: 120.945777 },
  { lat: 15.743075, lng: 120.943782 },
  { lat: 15.738835, lng: 120.939341 },
  { lat: 15.740894, lng: 120.937351 },
  { lat: 15.740987, lng: 120.937443 },
  { lat: 15.743427, lng: 120.936828 },
  { lat: 15.743605, lng: 120.936965 },
  { lat: 15.743879, lng: 120.936714 },
  { lat: 15.743581, lng: 120.936062 },
  { lat: 15.743431, lng: 120.934271 },
  { lat: 15.742209, lng: 120.931409 },
  { lat: 15.742857, lng: 120.929581 },
  { lat: 15.743421, lng: 120.928984 },
  { lat: 15.743294, lng: 120.927558 },
  { lat: 15.742947, lng: 120.926613 },
  { lat: 15.744327, lng: 120.926583 },
  { lat: 15.744191, lng: 120.921493 },
  { lat: 15.742295, lng: 120.921835 },
]

export const MOCK_BOUNDARIES: MapBoundary[] = [
  {
    id: 'boundary-clsu-campus',
    name: 'CLSU Boundary',
    kind: 'toda',
    todaOrgId: UTS_ORG_ID,
    city: 'Science City of Muñoz',
    points: CLSU_CAMPUS_BOUNDARY,
    source: 'OpenStreetMap way 794431227 (ODbL)',
  },
]

export function terminalsForOrg(terminals: Terminal[], orgId: string): Terminal[] {
  return terminals.filter((t) => t.todaOrgId === orgId && t.isActive)
}

// The terminal a point should be dispatched from: the nearest active one.
// With one terminal this is the old behaviour; with three it is what lets a
// passenger at the Second Gate be served from the Second Gate.
export function nearestTerminal(terminals: Terminal[], gps: GeoCoords | null): Terminal | null {
  if (!gps) return null
  const withGps = terminals.filter((t) => t.isActive && t.gps)
  if (withGps.length === 0) return null
  return withGps.reduce((best, t) =>
    haversineDistanceMeters(t.gps!, gps) < haversineDistanceMeters(best.gps!, gps) ? t : best,
  )
}

export const MOCK_TODA_ORGANIZATIONS: TodaOrganization[] = [
  {
    id: UTS_ORG_ID,
    name: 'NATO — University Transport System (CLSU)',
    terminalLocationId: 'loc-clsu-main-gate',
    proposedCommissionPerRide: null,
    commissionApprovedByMembers: false,
    commissionApprovedByAdmin: false,
    adminPin: '7070',
    contactPhone: '0917-700-7070',
    officers: [
      { name: 'Rico Alvarez', role: 'President' },
      { name: 'Marites Bautista', role: 'Secretary' },
    ],
    province: DEFAULT_BOOKING_PROVINCE,
    city: DEFAULT_BOOKING_CITY,
    barangay: DEFAULT_BOOKING_BARANGAY,
    addressDetail: 'CLSU Main Gate, Maharlika Highway',
    terminalGps: CLSU_GPS,
    verificationStatus: 'approved',
    registrationNote: null,
    registrationNoteDeadline: null,
    rating: 4.8,
    ratingCount: 34,
    saasPlan: 'starter',
    monthlyPlatformFee: SAAS_PLAN_FEES.starter,
    perBookingFee: 0,
    operatorId: null,
  },
  {
    id: 'toda-poblacion',
    name: 'Poblacion TODA',
    terminalLocationId: 'loc-terminal',
    proposedCommissionPerRide: null,
    commissionApprovedByMembers: false,
    commissionApprovedByAdmin: false,
    adminPin: '1010',
    contactPhone: '0917-100-1010',
    officers: [
      { name: 'Ramon Villanueva', role: 'President' },
      { name: 'Betty Ocampo', role: 'Secretary' },
    ],
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'Crisanto Sanchez Poblacion',
    addressDetail: 'Public Market Terminal, Zone 1',
    terminalGps: null,
    verificationStatus: 'approved',
    registrationNote: null,
    registrationNoteDeadline: null,
    rating: 4.7,
    ratingCount: 28,
    saasPlan: 'starter',
    monthlyPlatformFee: SAAS_PLAN_FEES.starter,
    perBookingFee: 0,
    operatorId: null,
  },
  {
    id: 'toda-sanisidro',
    name: 'San Isidro TODA',
    terminalLocationId: 'loc-home-2',
    proposedCommissionPerRide: null,
    commissionApprovedByMembers: false,
    commissionApprovedByAdmin: false,
    adminPin: '2020',
    contactPhone: '0917-200-2020',
    officers: [
      { name: 'Elena Fernandez', role: 'President' },
      { name: 'Jun Torres', role: 'Secretary' },
    ],
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'San Agustin',
    addressDetail: 'Purok 3 Terminal',
    terminalGps: null,
    verificationStatus: 'approved',
    registrationNote: null,
    registrationNoteDeadline: null,
    rating: 4.8,
    ratingCount: 41,
    saasPlan: 'starter',
    monthlyPlatformFee: SAAS_PLAN_FEES.starter,
    perBookingFee: 0,
    operatorId: null,
  },
  {
    id: 'toda-sanroque',
    name: 'San Roque TODA',
    terminalLocationId: 'loc-church',
    proposedCommissionPerRide: null,
    commissionApprovedByMembers: false,
    commissionApprovedByAdmin: false,
    adminPin: '3030',
    contactPhone: '0917-300-3030',
    officers: [
      { name: 'Lito Cruz', role: 'President' },
      { name: 'Maria Santos', role: 'Secretary' },
    ],
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'San Juan',
    addressDetail: 'San Juan Parish Church grounds',
    terminalGps: null,
    verificationStatus: 'approved',
    registrationNote: null,
    registrationNoteDeadline: null,
    rating: 4.5,
    ratingCount: 15,
    saasPlan: 'starter',
    monthlyPlatformFee: SAAS_PLAN_FEES.starter,
    perBookingFee: 0,
    operatorId: null,
  },
  {
    id: 'toda-clsu',
    name: 'CLSU TODA',
    // Not part of the legacy grid-based priority-dispatch system (same as
    // any newly self-registered org) — relies on terminalGps below instead.
    terminalLocationId: null,
    proposedCommissionPerRide: null,
    commissionApprovedByMembers: false,
    commissionApprovedByAdmin: false,
    adminPin: '4040',
    contactPhone: '0917-400-4040',
    officers: [
      { name: 'Rodel Pineda', role: 'President' },
      { name: 'Grace Manalo', role: 'Secretary' },
    ],
    province: 'Nueva Ecija',
    city: 'Science City of Muñoz',
    barangay: 'CLSU',
    addressDetail: 'Near the CLSU Main Gate',
    terminalGps: CLSU_GPS,
    verificationStatus: 'approved',
    registrationNote: null,
    registrationNoteDeadline: null,
    rating: 4.6,
    ratingCount: 0,
    saasPlan: 'standard',
    monthlyPlatformFee: SAAS_PLAN_FEES.standard,
    perBookingFee: 2,
    operatorId: 'op-nueva-ecija-north',
  },
]

// TaaS Level 2 — one seed "Authorized Operator" so the full 3-level chain
// (Franchise → Operator → TODA) is demoable without any manual setup: CLSU
// TODA above reports to this Operator, which itself reports to the seed
// Franchise below.
export const MOCK_OPERATORS: Operator[] = [
  {
    id: 'op-nueva-ecija-north',
    name: 'Nueva Ecija North Operator',
    contactPerson: 'Ramon dela Cruz',
    contactPhone: '09171234567',
    adminPin: '5050',
    province: 'Nueva Ecija',
    city: 'Science City of Muñoz',
    email: 'ramon@nuevaecijanorth.ph',
    barangay: 'CLSU',
    addressDetail: 'Unit 2B, Muñoz Commercial Complex',
    businessRegistrationNo: 'DTI-2024-00512',
    // The pilot's sponsoring civic partner. A path under /public rather than
    // a data: URL — same as the seeded banner ad — because a file the build
    // ships is smaller in state and cheaper to load than base64. An Operator
    // replacing it from their own portal writes a data: URL here instead;
    // both render through the same <img> (see NavBar/PublicHeader).
    logoDataUrl: '/partner-logo.png',
    // The same partner's banner, on the sign-in screen — same reasoning.
    // Unset: the seeded file baked the old logo into the image itself, so a
    // rebrand can't just swap a src — left null until an Operator uploads a
    // current one from their own portal (falls back to the plain
    // PilotBranding text badge in the meantime, see LandingPage).
    bannerDataUrl: null,
    activationFee: 45000,
    monthlyPlatformFee: 8000,
    perBookingFee: 2,
    franchiseId: 'fr-nueva-ecija',
    verificationStatus: 'approved',
    registrationNote: null,
  },
]

// TaaS Level 3 — one seed Franchise (territory), pre-approved so its fee
// schedule and Operator roster are visible immediately.
export const MOCK_FRANCHISES: Franchise[] = [
  {
    id: 'fr-nueva-ecija',
    name: 'Nueva Ecija Franchise',
    contactPerson: 'Celeste Macalinao',
    contactPhone: '09181234567',
    adminPin: '6060',
    province: 'Nueva Ecija',
    city: 'San Jose City',
    email: 'celeste@nuevaecijafranchise.ph',
    barangay: 'Crisanto Sanchez Poblacion',
    addressDetail: '2nd Floor, San Jose City Business Center',
    businessRegistrationNo: 'SEC-2024-001234',
    initialFranchiseFee: 150000,
    monthlyTechnologyFee: 10000,
    royaltyPct: 5,
    verificationStatus: 'approved',
    registrationNote: null,
  },
]

// Live-computed B2B billing estimate for a TODA's Level-1 SaaS subscription —
// never wired into the ride-fare split (see Payment/COMPLETE_RIDE), purely
// informational for TodaAdminPage's "My Subscription" section.
export function estimatedMonthlyTodaFee(org: TodaOrganization, drivers: Driver[], rides: Ride[]): number {
  if (org.perBookingFee <= 0) return org.monthlyPlatformFee
  const memberIds = new Set(drivers.filter((d) => d.todaOrgId === org.id).map((d) => d.id))
  return org.monthlyPlatformFee + org.perBookingFee * countCompletedRidesThisMonth(rides, memberIds)
}

// Same idea one level up — rolls up every TodaOrganization reporting to this
// Operator, not just the Operator's own direct bookings.
export function estimatedMonthlyOperatorFee(
  operator: Operator,
  todaOrgs: TodaOrganization[],
  drivers: Driver[],
  rides: Ride[],
): number {
  if (operator.perBookingFee <= 0) return operator.monthlyPlatformFee
  const orgIds = new Set(todaOrgs.filter((o) => o.operatorId === operator.id).map((o) => o.id))
  const memberIds = new Set(drivers.filter((d) => d.todaOrgId && orgIds.has(d.todaOrgId)).map((d) => d.id))
  return operator.monthlyPlatformFee + operator.perBookingFee * countCompletedRidesThisMonth(rides, memberIds)
}

export function countCompletedRidesThisMonth(rides: Ride[], driverIds: Set<string>): number {
  const now = new Date()
  return rides.filter((r) => {
    if (r.status !== 'completed' || !r.completedAt || !r.driverId || !driverIds.has(r.driverId)) return false
    const completed = new Date(r.completedAt)
    return completed.getMonth() === now.getMonth() && completed.getFullYear() === now.getFullYear()
  }).length
}

// "Income status" for a Level-2/3 dashboard — an all-time rollup of the
// actual ride activity happening across the org's portfolio (their TODAs'
// drivers), NOT their own B2B subscription bill (see estimatedMonthly*Fee
// above, which is the opposite direction of money). Gross fares/driver
// payouts/TODA commissions here are read straight off each completed ride's
// stored Payment — never recomputed — so this always matches what actually
// happened, including rides completed before any fee/plan change.
export interface PortfolioStats {
  todaCount: number
  driverCount: number
  completedRides: number
  grossFares: number
  driverPayouts: number
  todaCommissions: number
}

function summarizePortfolio(driverIds: Set<string>, todaCount: number, rides: Ride[]): PortfolioStats {
  const completed = rides.filter((r) => r.status === 'completed' && r.driverId && driverIds.has(r.driverId) && r.payment)
  return {
    todaCount,
    driverCount: driverIds.size,
    completedRides: completed.length,
    grossFares: completed.reduce((sum, r) => sum + (r.payment?.amount ?? 0), 0),
    driverPayouts: completed.reduce((sum, r) => sum + (r.payment?.driverPayout ?? 0), 0),
    todaCommissions: completed.reduce((sum, r) => sum + (r.payment?.todaCommission ?? 0), 0),
  }
}

export function operatorPortfolioStats(operator: Operator, todaOrgs: TodaOrganization[], drivers: Driver[], rides: Ride[]): PortfolioStats {
  const orgIds = new Set(todaOrgs.filter((o) => o.operatorId === operator.id).map((o) => o.id))
  const driverIds = new Set(drivers.filter((d) => d.todaOrgId && orgIds.has(d.todaOrgId)).map((d) => d.id))
  return summarizePortfolio(driverIds, orgIds.size, rides)
}

export function franchisePortfolioStats(
  franchise: Franchise,
  operators: Operator[],
  todaOrgs: TodaOrganization[],
  drivers: Driver[],
  rides: Ride[],
): PortfolioStats & { operatorCount: number } {
  const operatorIds = new Set(operators.filter((o) => o.franchiseId === franchise.id).map((o) => o.id))
  const orgIds = new Set(todaOrgs.filter((o) => o.operatorId && operatorIds.has(o.operatorId)).map((o) => o.id))
  const driverIds = new Set(drivers.filter((d) => d.todaOrgId && orgIds.has(d.todaOrgId)).map((d) => d.id))
  return { ...summarizePortfolio(driverIds, orgIds.size, rides), operatorCount: operatorIds.size }
}

// A TODA's own per-ride commission only actually applies once both the
// members (simulated) and the App Admin have signed off on it.
export function getActiveTodaCommission(org: TodaOrganization | undefined | null): number {
  if (!org || org.proposedCommissionPerRide === null) return 0
  if (!org.commissionApprovedByMembers || !org.commissionApprovedByAdmin) return 0
  return org.proposedCommissionPerRide
}

// Which TODA has dispatch priority for a given pickup point: whichever
// org's terminal is geographically closest to that pickup.
export function getPriorityTodaOrgId(pickup: MockLocation): string | null {
  let closest: TodaOrganization | null = null
  let closestDist = Infinity
  for (const org of MOCK_TODA_ORGANIZATIONS) {
    const terminal = MOCK_LOCATIONS.find((l) => l.id === org.terminalLocationId)
    if (!terminal) continue
    const dist = Math.hypot(pickup.coords.x - terminal.coords.x, pickup.coords.y - terminal.coords.y)
    if (dist < closestDist) {
      closestDist = dist
      closest = org
    }
  }
  return closest?.id ?? null
}

// Used when a driver skips picking their TODA at registration — Philippine
// TODAs are conventionally tied to a single barangay, so matching the
// driver's own registered address to an approved org's address is enough to
// auto-fill the right one without making them search. Falls back to null
// (freelance) when no org's address matches exactly.
export function autoDetectTodaOrgId(
  orgs: TodaOrganization[],
  address: { province: string; city: string; barangay: string },
): string | null {
  const match = orgs.find(
    (o) =>
      o.verificationStatus === 'approved' &&
      o.province === address.province &&
      o.city === address.city &&
      o.barangay === address.barangay,
  )
  return match?.id ?? null
}

// The ordered terminal queue for a TODA: approved members who have
// currently "registered" (joined) the queue, oldest join first — mirrors
// how a real terminal line works, first come first served.
export function getTodaQueue(todaOrgId: string, drivers: Driver[]): Driver[] {
  return drivers
    .filter(
      (d) =>
        d.todaOrgId === todaOrgId &&
        d.verificationStatus === 'approved' &&
        d.accessStatus === 'active' &&
        d.queueJoinedAt !== null,
    )
    .sort((a, b) => new Date(a.queueJoinedAt!).getTime() - new Date(b.queueJoinedAt!).getTime())
}

// Where the app believes a driver is standing right now. There is no live
// GPS feed for a driver who is simply waiting, so this walks the same
// fallbacks the driver's own dashboard uses: the position they were at when
// they joined the queue, then the terminal they picked, then their TODA's
// registered terminal pin. Returns null for a driver the app cannot place —
// those sort last rather than pretending to be nearby.
export function driverDispatchGps(
  driver: Driver,
  terminals: Terminal[],
  orgs: TodaOrganization[],
): GeoCoords | null {
  if (driver.lastKnownGps) return driver.lastKnownGps
  const chosen = driver.homeTerminalId ? terminals.find((t) => t.id === driver.homeTerminalId) : null
  if (chosen?.gps) return chosen.gps
  const org = driver.todaOrgId ? orgs.find((o) => o.id === driver.todaOrgId) : null
  return getTerminalGps(org)
}

// Orders dispatch candidates by how far each one is from the pickup, nearest
// first — the rule a passenger actually feels, since the shortest distance is
// the shortest wait. Two drivers at the same terminal come out at the same
// distance, and because Array.prototype.sort is stable (ES2019+) the line at
// that terminal keeps its own join order among themselves. A driver the app
// cannot place goes to the back rather than to the front.
export function orderByDispatchDistance(
  candidates: Driver[],
  pickupGps: GeoCoords | null,
  terminals: Terminal[],
  orgs: TodaOrganization[],
): Driver[] {
  if (!pickupGps) return candidates
  const distanceOf = new Map<string, number>()
  for (const d of candidates) {
    const gps = driverDispatchGps(d, terminals, orgs)
    distanceOf.set(d.id, gps ? haversineDistanceMeters(gps, pickupGps) : Number.POSITIVE_INFINITY)
  }
  return [...candidates].sort((a, b) => distanceOf.get(a.id)! - distanceOf.get(b.id)!)
}

// Members of a TODA who are free to take work but are not standing in the
// terminal line: online, cleared to drive, and not already on a trip. They
// are the "no passenger nearby" half of dispatch — a driver who happens to be
// closer to the pickup than anyone in the queue is still the fastest answer.
export function getFreeTodaDrivers(
  todaOrgId: string,
  drivers: Driver[],
  busyDriverIds: Set<string>,
): Driver[] {
  return drivers.filter(
    (d) =>
      d.todaOrgId === todaOrgId &&
      d.verificationStatus === 'approved' &&
      d.accessStatus === 'active' &&
      d.online &&
      d.queueJoinedAt === null &&
      !busyDriverIds.has(d.id),
  )
}

// Purely a display check — never mutates state on its own. An "approve as
// noted" deadline that has passed just means the queue should show this
// application as needing rejection; the actual reject is still an explicit
// admin click, same as everywhere else in this app.
export function isPastDeadline(deadline: string | null): boolean {
  return deadline !== null && Date.now() > new Date(deadline).getTime()
}

export const MOCK_DRIVERS: Driver[] = [
  {
    id: 'drv-uts-01',
    name: 'Kuya Boyet',
    plateNumber: 'UTS-2001',
    licenseNo: 'DL-5201-2022',
    licenseExpiry: '2029-06-30',
    pin: '2001',
    rating: 4.5,
    ratingCount: 11,
    online: true,
    verificationStatus: 'approved',
    documents: submittedDocs(),
    todaOrgId: UTS_ORG_ID,
    province: DEFAULT_BOOKING_PROVINCE,
    city: DEFAULT_BOOKING_CITY,
    barangay: DEFAULT_BOOKING_BARANGAY,
    addressDetail: 'CLSU campus area',
    phone: '0917-3101-2001',
    email: null,
    facebook: null,
    queueJoinedAt: '2026-01-01T00:02:00.000Z',
    // Assigned to a gate to start with; each driver can move themselves to
    // another of the TODA's terminals from their own queue card.
    homeTerminalId: 'CLSU-01',
    pabiliPriority: false,
    accessStatus: 'active',
    accessNote: null,
    pendingNote: null,
    pendingNoteDeadline: null,
    rejectionReason: null,
    appealMessage: null,
    appealedAt: null,
  },
  {
    id: 'drv-uts-02',
    name: 'Mang Elmer',
    plateNumber: 'UTS-2002',
    licenseNo: 'DL-5202-2022',
    licenseExpiry: '2029-06-30',
    pin: '2002',
    rating: 4.6,
    ratingCount: 14,
    online: true,
    verificationStatus: 'approved',
    documents: submittedDocs(),
    todaOrgId: UTS_ORG_ID,
    province: DEFAULT_BOOKING_PROVINCE,
    city: DEFAULT_BOOKING_CITY,
    barangay: DEFAULT_BOOKING_BARANGAY,
    addressDetail: 'CLSU campus area',
    phone: '0917-3102-2002',
    email: null,
    facebook: null,
    queueJoinedAt: '2026-01-01T00:04:00.000Z',
    // Assigned to a gate to start with; each driver can move themselves to
    // another of the TODA's terminals from their own queue card.
    homeTerminalId: 'CLSU-01',
    pabiliPriority: false,
    accessStatus: 'active',
    accessNote: null,
    pendingNote: null,
    pendingNoteDeadline: null,
    rejectionReason: null,
    appealMessage: null,
    appealedAt: null,
  },
  {
    id: 'drv-uts-03',
    name: 'Kuya Dante',
    plateNumber: 'UTS-2003',
    licenseNo: 'DL-5203-2022',
    licenseExpiry: '2029-06-30',
    pin: '2003',
    rating: 4.7,
    ratingCount: 17,
    online: true,
    verificationStatus: 'approved',
    documents: submittedDocs(),
    todaOrgId: UTS_ORG_ID,
    province: DEFAULT_BOOKING_PROVINCE,
    city: DEFAULT_BOOKING_CITY,
    barangay: DEFAULT_BOOKING_BARANGAY,
    addressDetail: 'CLSU campus area',
    phone: '0917-3103-2003',
    email: null,
    facebook: null,
    queueJoinedAt: '2026-01-01T00:06:00.000Z',
    // Assigned to a gate to start with; each driver can move themselves to
    // another of the TODA's terminals from their own queue card.
    homeTerminalId: 'CLSU-01',
    pabiliPriority: false,
    accessStatus: 'active',
    accessNote: null,
    pendingNote: null,
    pendingNoteDeadline: null,
    rejectionReason: null,
    appealMessage: null,
    appealedAt: null,
  },
  {
    id: 'drv-uts-04',
    name: 'Mang Rudy',
    plateNumber: 'UTS-2004',
    licenseNo: 'DL-5204-2022',
    licenseExpiry: '2029-06-30',
    pin: '2004',
    rating: 4.8,
    ratingCount: 20,
    online: true,
    verificationStatus: 'approved',
    documents: submittedDocs(),
    todaOrgId: UTS_ORG_ID,
    province: DEFAULT_BOOKING_PROVINCE,
    city: DEFAULT_BOOKING_CITY,
    barangay: DEFAULT_BOOKING_BARANGAY,
    addressDetail: 'CLSU campus area',
    phone: '0917-3104-2004',
    email: null,
    facebook: null,
    queueJoinedAt: '2026-01-01T00:08:00.000Z',
    // Assigned to a gate to start with; each driver can move themselves to
    // another of the TODA's terminals from their own queue card.
    homeTerminalId: 'CLSU-01',
    pabiliPriority: true,
    accessStatus: 'active',
    accessNote: null,
    pendingNote: null,
    pendingNoteDeadline: null,
    rejectionReason: null,
    appealMessage: null,
    appealedAt: null,
  },
  {
    id: 'drv-uts-05',
    name: 'Kuya Nilo',
    plateNumber: 'UTS-2005',
    licenseNo: 'DL-5205-2022',
    licenseExpiry: '2029-06-30',
    pin: '2005',
    rating: 4.4,
    ratingCount: 23,
    online: true,
    verificationStatus: 'approved',
    documents: submittedDocs(),
    todaOrgId: UTS_ORG_ID,
    province: DEFAULT_BOOKING_PROVINCE,
    city: DEFAULT_BOOKING_CITY,
    barangay: DEFAULT_BOOKING_BARANGAY,
    addressDetail: 'CLSU campus area',
    phone: '0917-3105-2005',
    email: null,
    facebook: null,
    queueJoinedAt: '2026-01-01T00:10:00.000Z',
    // Assigned to a gate to start with; each driver can move themselves to
    // another of the TODA's terminals from their own queue card.
    homeTerminalId: 'CLSU-02',
    pabiliPriority: false,
    accessStatus: 'active',
    accessNote: null,
    pendingNote: null,
    pendingNoteDeadline: null,
    rejectionReason: null,
    appealMessage: null,
    appealedAt: null,
  },
  {
    id: 'drv-uts-06',
    name: 'Mang Tonio',
    plateNumber: 'UTS-2006',
    licenseNo: 'DL-5206-2022',
    licenseExpiry: '2029-06-30',
    pin: '2006',
    rating: 4.5,
    ratingCount: 26,
    online: true,
    verificationStatus: 'approved',
    documents: submittedDocs(),
    todaOrgId: UTS_ORG_ID,
    province: DEFAULT_BOOKING_PROVINCE,
    city: DEFAULT_BOOKING_CITY,
    barangay: DEFAULT_BOOKING_BARANGAY,
    addressDetail: 'CLSU campus area',
    phone: '0917-3106-2006',
    email: null,
    facebook: null,
    queueJoinedAt: '2026-01-01T00:12:00.000Z',
    // Assigned to a gate to start with; each driver can move themselves to
    // another of the TODA's terminals from their own queue card.
    homeTerminalId: 'CLSU-02',
    pabiliPriority: false,
    accessStatus: 'active',
    accessNote: null,
    pendingNote: null,
    pendingNoteDeadline: null,
    rejectionReason: null,
    appealMessage: null,
    appealedAt: null,
  },
  {
    id: 'drv-uts-07',
    name: 'Kuya Erwin',
    plateNumber: 'UTS-2007',
    licenseNo: 'DL-5207-2022',
    licenseExpiry: '2029-06-30',
    pin: '2007',
    rating: 4.6,
    ratingCount: 29,
    online: true,
    verificationStatus: 'approved',
    documents: submittedDocs(),
    todaOrgId: UTS_ORG_ID,
    province: DEFAULT_BOOKING_PROVINCE,
    city: DEFAULT_BOOKING_CITY,
    barangay: DEFAULT_BOOKING_BARANGAY,
    addressDetail: 'CLSU campus area',
    phone: '0917-3107-2007',
    email: null,
    facebook: null,
    queueJoinedAt: '2026-01-01T00:14:00.000Z',
    // Assigned to a gate to start with; each driver can move themselves to
    // another of the TODA's terminals from their own queue card.
    homeTerminalId: 'CLSU-02',
    pabiliPriority: false,
    accessStatus: 'active',
    accessNote: null,
    pendingNote: null,
    pendingNoteDeadline: null,
    rejectionReason: null,
    appealMessage: null,
    appealedAt: null,
  },
  {
    id: 'drv-uts-08',
    name: 'Mang Pepito',
    plateNumber: 'UTS-2008',
    licenseNo: 'DL-5208-2022',
    licenseExpiry: '2029-06-30',
    pin: '2008',
    rating: 4.7,
    ratingCount: 32,
    online: true,
    verificationStatus: 'approved',
    documents: submittedDocs(),
    todaOrgId: UTS_ORG_ID,
    province: DEFAULT_BOOKING_PROVINCE,
    city: DEFAULT_BOOKING_CITY,
    barangay: DEFAULT_BOOKING_BARANGAY,
    addressDetail: 'CLSU campus area',
    phone: '0917-3108-2008',
    email: null,
    facebook: null,
    queueJoinedAt: '2026-01-01T00:16:00.000Z',
    // Assigned to a gate to start with; each driver can move themselves to
    // another of the TODA's terminals from their own queue card.
    homeTerminalId: 'CLSU-02',
    pabiliPriority: true,
    accessStatus: 'active',
    accessNote: null,
    pendingNote: null,
    pendingNoteDeadline: null,
    rejectionReason: null,
    appealMessage: null,
    appealedAt: null,
  },
  {
    id: 'drv-uts-09',
    name: 'Kuya Ariel',
    plateNumber: 'UTS-2009',
    licenseNo: 'DL-5209-2022',
    licenseExpiry: '2029-06-30',
    pin: '2009',
    rating: 4.8,
    ratingCount: 35,
    online: true,
    verificationStatus: 'approved',
    documents: submittedDocs(),
    todaOrgId: UTS_ORG_ID,
    province: DEFAULT_BOOKING_PROVINCE,
    city: DEFAULT_BOOKING_CITY,
    barangay: DEFAULT_BOOKING_BARANGAY,
    addressDetail: 'CLSU campus area',
    phone: '0917-3109-2009',
    email: null,
    facebook: null,
    queueJoinedAt: '2026-01-01T00:18:00.000Z',
    // Assigned to a gate to start with; each driver can move themselves to
    // another of the TODA's terminals from their own queue card.
    homeTerminalId: 'CLSU-03',
    pabiliPriority: false,
    accessStatus: 'active',
    accessNote: null,
    pendingNote: null,
    pendingNoteDeadline: null,
    rejectionReason: null,
    appealMessage: null,
    appealedAt: null,
  },
  {
    id: 'drv-uts-10',
    name: 'Mang Ising',
    plateNumber: 'UTS-2010',
    licenseNo: 'DL-5210-2022',
    licenseExpiry: '2029-06-30',
    pin: '2010',
    rating: 4.4,
    ratingCount: 38,
    online: true,
    verificationStatus: 'approved',
    documents: submittedDocs(),
    todaOrgId: UTS_ORG_ID,
    province: DEFAULT_BOOKING_PROVINCE,
    city: DEFAULT_BOOKING_CITY,
    barangay: DEFAULT_BOOKING_BARANGAY,
    addressDetail: 'CLSU campus area',
    phone: '0917-3110-2010',
    email: null,
    facebook: null,
    queueJoinedAt: '2026-01-01T00:20:00.000Z',
    // Assigned to a gate to start with; each driver can move themselves to
    // another of the TODA's terminals from their own queue card.
    homeTerminalId: 'CLSU-03',
    pabiliPriority: false,
    accessStatus: 'active',
    accessNote: null,
    pendingNote: null,
    pendingNoteDeadline: null,
    rejectionReason: null,
    appealMessage: null,
    appealedAt: null,
  },
  {
    id: 'drv-uts-11',
    name: 'Kuya Marlon',
    plateNumber: 'UTS-2011',
    licenseNo: 'DL-5211-2022',
    licenseExpiry: '2029-06-30',
    pin: '2011',
    rating: 4.5,
    ratingCount: 41,
    online: true,
    verificationStatus: 'approved',
    documents: submittedDocs(),
    todaOrgId: UTS_ORG_ID,
    province: DEFAULT_BOOKING_PROVINCE,
    city: DEFAULT_BOOKING_CITY,
    barangay: DEFAULT_BOOKING_BARANGAY,
    addressDetail: 'CLSU campus area',
    phone: '0917-3111-2011',
    email: null,
    facebook: null,
    queueJoinedAt: '2026-01-01T00:22:00.000Z',
    // Assigned to a gate to start with; each driver can move themselves to
    // another of the TODA's terminals from their own queue card.
    homeTerminalId: 'CLSU-03',
    pabiliPriority: false,
    accessStatus: 'active',
    accessNote: null,
    pendingNote: null,
    pendingNoteDeadline: null,
    rejectionReason: null,
    appealMessage: null,
    appealedAt: null,
  },
  {
    id: 'drv-uts-12',
    name: 'Mang Berting',
    plateNumber: 'UTS-2012',
    licenseNo: 'DL-5212-2022',
    licenseExpiry: '2029-06-30',
    pin: '2012',
    rating: 4.6,
    ratingCount: 44,
    online: true,
    verificationStatus: 'approved',
    documents: submittedDocs(),
    todaOrgId: UTS_ORG_ID,
    province: DEFAULT_BOOKING_PROVINCE,
    city: DEFAULT_BOOKING_CITY,
    barangay: DEFAULT_BOOKING_BARANGAY,
    addressDetail: 'CLSU campus area',
    phone: '0917-3112-2012',
    email: null,
    facebook: null,
    queueJoinedAt: '2026-01-01T00:24:00.000Z',
    // Assigned to a gate to start with; each driver can move themselves to
    // another of the TODA's terminals from their own queue card.
    homeTerminalId: 'CLSU-03',
    pabiliPriority: true,
    accessStatus: 'active',
    accessNote: null,
    pendingNote: null,
    pendingNoteDeadline: null,
    rejectionReason: null,
    appealMessage: null,
    appealedAt: null,
  },
  {
    id: 'drv-1',
    name: 'Mang Ramon',
    plateNumber: 'TRC-1023',
    licenseNo: 'DL-4471-2021',
    licenseExpiry: '2028-03-15',
    pin: '1111',
    rating: 4.8,
    ratingCount: 34,
    online: true,
    verificationStatus: 'approved',
    documents: submittedDocs(),
    // CLSU, not San Jose City. A driver with no saved position of their own
    // is placed at their TODA's terminal, so this one line is what decides
    // where he appears on the map — and in Poblacion TODA he was plotted an
    // hour's drive from the pilot area, close to nobody the pilot serves.
    todaOrgId: 'toda-clsu',
    province: 'Nueva Ecija',
    city: 'Science City of Muñoz',
    barangay: 'CLSU',
    addressDetail: 'Purok 2',
    phone: '0917-100-1001',
    email: null,
    facebook: null,
    queueJoinedAt: null,
    pabiliPriority: false,
    accessStatus: 'active',
    accessNote: null,
    pendingNote: null,
    pendingNoteDeadline: null,
    rejectionReason: null,
    appealMessage: null,
    appealedAt: null,
  },
  {
    id: 'drv-2',
    name: 'Aling Betty',
    plateNumber: 'TRC-0451',
    licenseNo: 'DL-2290-2019',
    licenseExpiry: '2027-11-02',
    pin: '2222',
    rating: 4.9,
    ratingCount: 51,
    online: true,
    verificationStatus: 'approved',
    documents: submittedDocs(),
    todaOrgId: 'toda-sanisidro',
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'San Agustin',
    addressDetail: 'Purok 3',
    phone: '0917-100-1002',
    email: null,
    facebook: null,
    queueJoinedAt: null,
    pabiliPriority: false,
    accessStatus: 'active',
    accessNote: null,
    pendingNote: null,
    pendingNoteDeadline: null,
    rejectionReason: null,
    appealMessage: null,
    appealedAt: null,
  },
  {
    id: 'drv-3',
    name: 'Kuya Jun',
    plateNumber: 'TRC-2210',
    licenseNo: 'DL-8834-2022',
    licenseExpiry: '2029-06-20',
    pin: '3333',
    rating: 4.6,
    ratingCount: 19,
    online: true,
    verificationStatus: 'approved',
    documents: submittedDocs(),
    todaOrgId: null,
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'Manicla',
    addressDetail: 'Sitio Maligaya',
    phone: '0917-100-1003',
    email: null,
    facebook: null,
    queueJoinedAt: null,
    pabiliPriority: false,
    accessStatus: 'active',
    accessNote: null,
    pendingNote: null,
    pendingNoteDeadline: null,
    rejectionReason: null,
    appealMessage: null,
    appealedAt: null,
  },
  {
    id: 'drv-4',
    name: 'Tonyo Reyes',
    plateNumber: 'TRC-3391',
    licenseNo: 'DL-5512-2026',
    licenseExpiry: '2030-01-10',
    pin: '4444',
    rating: 0,
    ratingCount: 0,
    online: false,
    verificationStatus: 'pending',
    documents: submittedDocs(),
    todaOrgId: 'toda-poblacion',
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'Crisanto Sanchez Poblacion',
    addressDetail: 'Purok 5',
    phone: '0917-100-1004',
    email: null,
    facebook: null,
    queueJoinedAt: null,
    pabiliPriority: false,
    accessStatus: 'active',
    accessNote: null,
    pendingNote: null,
    pendingNoteDeadline: null,
    rejectionReason: null,
    appealMessage: null,
    appealedAt: null,
  },
  {
    id: 'drv-5',
    name: 'Lito Cruz',
    plateNumber: 'TRC-4487',
    licenseNo: 'DL-6603-2026',
    licenseExpiry: '2029-09-05',
    pin: '5555',
    rating: 0,
    ratingCount: 0,
    online: false,
    verificationStatus: 'pending',
    documents: submittedDocs(),
    todaOrgId: 'toda-sanroque',
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'San Juan',
    addressDetail: 'Zone 4',
    phone: '0917-100-1005',
    email: null,
    facebook: null,
    queueJoinedAt: null,
    pabiliPriority: false,
    accessStatus: 'active',
    accessNote: null,
    pendingNote: null,
    pendingNoteDeadline: null,
    rejectionReason: null,
    appealMessage: null,
    appealedAt: null,
  },
]

export const MOCK_PASSENGERS: Passenger[] = [
  {
    id: 'pax-1',
    name: 'Celeste M.',
    age: 28,
    isStudent: false,
    isPwdSenior: false,
    phone: '0917-200-2001',
    email: null,
    pin: '2001',
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'Crisanto Sanchez Poblacion',
    addressDetail: 'Sitio Maligaya',
    guardianPhone: '0917-400-4001',
    favoriteDriverId: null,
    savedLocations: [],
  },
  {
    id: 'pax-2',
    name: 'Miguel D. (Student)',
    age: 15,
    isStudent: true,
    isPwdSenior: false,
    phone: '0917-200-2002',
    email: null,
    // Minor registered through a Parent account — doesn't log in on their
    // own, so no PIN of their own.
    pin: null,
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'San Agustin',
    addressDetail: 'Purok 3',
    guardianPhone: null,
    favoriteDriverId: null,
    savedLocations: [],
  },
  {
    id: 'pax-3',
    name: 'Lola Nena (Senior)',
    age: 68,
    isStudent: false,
    isPwdSenior: true,
    phone: '0917-200-2003',
    email: null,
    pin: '2003',
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'Crisanto Sanchez Poblacion',
    addressDetail: 'Sitio Maligaya',
    guardianPhone: null,
    favoriteDriverId: null,
    savedLocations: [],
  },
  {
    id: 'pax-4',
    name: 'Ces Macalinao',
    age: 30,
    isStudent: false,
    isPwdSenior: false,
    phone: '0929-805-2527',
    email: 'cmmacalinao@gmail.com',
    pin: '2527',
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'Crisanto Sanchez Poblacion',
    addressDetail: 'Sitio Maligaya',
    guardianPhone: null,
    favoriteDriverId: null,
    savedLocations: [],
  },
  {
    id: 'pax-5',
    name: 'Elito Circa',
    age: 30,
    isStudent: false,
    isPwdSenior: false,
    phone: '0927-973-3887',
    email: null,
    pin: '3887',
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'Crisanto Sanchez Poblacion',
    addressDetail: 'Sitio Maligaya',
    guardianPhone: null,
    favoriteDriverId: null,
    savedLocations: [],
  },
]

export const MOCK_PARENTS: Parent[] = [
  {
    id: 'parent-1',
    name: 'Elena D.',
    phone: '0917-300-3001',
    email: null,
    pin: '3001',
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'San Agustin',
    addressDetail: 'Purok 3',
    favoriteDriverId: null,
  },
]

export const MOCK_PARENT_LINKS: ParentLink[] = [
  {
    parentId: 'parent-1',
    studentPassengerId: 'pax-2',
    relationship: 'Mother',
    consentGiven: true,
    proofOfAuthorityDataUrl: null,
    consentedAt: '2026-01-05T00:00:00.000Z',
  },
]

export const MINOR_AGE_LIMIT = 18

// Real, commonly-found Philippine pharmacy chains — offered as a picker for
// "Buy Medicine" bookings instead of a single auto-resolved "Pharmacy" pin,
// so the passenger controls which branch the driver actually goes to. Each
// name is geocoded live per the passenger's own city (see
// resolveNearbyPharmacy in lib/customLocation.ts) rather than using a fixed
// coordinate, since which branches exist — and where — varies by town.
export const PHARMACY_CHAINS = [
  'Mercury Drug',
  'Watsons',
  'Rose Pharmacy',
  'Southstar Drug',
  'The Generics Pharmacy',
  'Generika Drugstore',
] as const

// TODARIDE MEDS seed pharmacies — every one ships pre-approved
// (verificationStatus: 'approved') since this MVP pass has no Admin
// approval UI yet (see the Pharmacy type comment). Locations sit near
// already-verified real landmarks in this file (San Jose City's public
// market/cathedral area, and CLSU_GPS in Muñoz) rather than fresh
// unverified coordinates — same "anchor near something real" approach used
// for loc-public-market-sjc above. adminPin is each pharmacy's own portal
// login credential, mirroring TodaOrganization.adminPin.
// A seed store's logo: its initials on a coloured disc, as an SVG data URL
// — no file to ship, and it draws crisp at any size the page uses.
function seedVendorLogo(initials: string, color: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">` +
    `<circle cx="64" cy="64" r="60" fill="${color}"/>` +
    `<circle cx="64" cy="64" r="52" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="3"/>` +
    `<text x="64" y="78" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="44" font-weight="800" fill="#ffffff">${initials}</text>` +
    `</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export const MOCK_PHARMACIES: Pharmacy[] = [
  {
    id: 'pharm-1',
    name: 'Mercury Drug — San Jose Poblacion',
    businessType: 'pharmacy',
    adminPin: '1111',
    contactPhone: '0917-500-1001',
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'Rafael Rueda, Sr. Poblacion',
    addressDetail: 'Maharlika Highway, near the public market',
    coords: { x: 62, y: 65 },
    locationGps: { lat: 15.79241, lng: 120.98965 },
    isOpen: true,
    verificationStatus: 'approved',
    gcashAccount: { accountName: 'Mercury Drug SJC Branch', accountNumber: '0917-500-1001', qrDataUrl: null },
    mayaAccount: null,
  },
  {
    id: 'pharm-2',
    name: 'Watsons — Town Center',
    businessType: 'pharmacy',
    adminPin: '2222',
    contactPhone: '0917-500-1002',
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'Manicla',
    addressDetail: 'Town Center Mall',
    coords: { x: 22, y: 98 },
    locationGps: { lat: 15.8296, lng: 120.9605 },
    isOpen: true,
    verificationStatus: 'approved',
    gcashAccount: null,
    mayaAccount: null,
  },
  {
    id: 'pharm-7',
    name: 'Rose Pharmacy — San Jose City',
    businessType: 'pharmacy',
    adminPin: '7777',
    contactPhone: '0917-500-1007',
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'Abar 1st',
    addressDetail: 'Along Maharlika Highway, near the terminal',
    coords: { x: 58, y: 60 },
    locationGps: { lat: 15.8012, lng: 120.9838 },
    isOpen: true,
    verificationStatus: 'approved',
    gcashAccount: null,
    mayaAccount: null,
  },
  {
    id: 'pharm-8',
    name: 'Southstar Drug — San Jose City',
    businessType: 'pharmacy',
    adminPin: '8888',
    contactPhone: '0917-500-1008',
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'Kaliwanagan',
    addressDetail: 'Near the city hall',
    coords: { x: 65, y: 55 },
    locationGps: { lat: 15.7889, lng: 120.9921 },
    isOpen: true,
    verificationStatus: 'approved',
    gcashAccount: null,
    mayaAccount: null,
  },
  {
    id: 'pharm-9',
    name: 'Generika Drugstore — San Jose City',
    businessType: 'pharmacy',
    adminPin: '9999',
    contactPhone: '0917-500-1009',
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'Santo Niño 1st',
    addressDetail: 'Near Sto. Nino Elementary School',
    coords: { x: 52, y: 87 },
    locationGps: { lat: 15.8155, lng: 120.9782 },
    isOpen: false,
    verificationStatus: 'approved',
    gcashAccount: null,
    mayaAccount: null,
  },
  {
    id: 'pharm-3',
    name: 'The Generics Pharmacy — Muñoz',
    businessType: 'pharmacy',
    adminPin: '3333',
    contactPhone: '0917-500-1003',
    province: 'Nueva Ecija',
    city: 'Science City of Muñoz',
    barangay: 'CLSU',
    addressDetail: 'Near CLSU Main Gate',
    coords: { x: 15, y: 20 },
    locationGps: { lat: 15.7328, lng: 120.9317 },
    isOpen: true,
    verificationStatus: 'approved',
    gcashAccount: null,
    mayaAccount: null,
  },
  {
    id: 'pharm-4',
    name: 'Mercury Drug — Muñoz Poblacion',
    businessType: 'pharmacy',
    adminPin: '4444',
    contactPhone: '0917-500-1004',
    province: 'Nueva Ecija',
    city: 'Science City of Muñoz',
    barangay: 'Poblacion North',
    addressDetail: 'Near the public market, town proper',
    coords: { x: 20, y: 30 },
    locationGps: { lat: 15.7238, lng: 120.8972 },
    isOpen: true,
    verificationStatus: 'approved',
    gcashAccount: null,
    mayaAccount: null,
  },
  {
    id: 'pharm-5',
    name: 'Generika Drugstore — Muñoz Town Center',
    businessType: 'pharmacy',
    adminPin: '5555',
    contactPhone: '0917-500-1005',
    province: 'Nueva Ecija',
    city: 'Science City of Muñoz',
    barangay: 'Poblacion South',
    addressDetail: 'Near the Municipal Hall',
    coords: { x: 18, y: 25 },
    locationGps: { lat: 15.7256, lng: 120.9008 },
    isOpen: true,
    verificationStatus: 'approved',
    gcashAccount: null,
    mayaAccount: null,
  },
  {
    id: 'pharm-6',
    name: 'Southstar Drug — CLSU Gate',
    businessType: 'pharmacy',
    adminPin: '6666',
    contactPhone: '0917-500-1006',
    province: 'Nueva Ecija',
    city: 'Science City of Muñoz',
    barangay: 'CLSU',
    addressDetail: 'Along Academic Avenue, near the CLSU main gate',
    coords: { x: 13, y: 18 },
    locationGps: { lat: 15.7312, lng: 120.9298 },
    isOpen: false,
    verificationStatus: 'approved',
    gcashAccount: null,
    mayaAccount: null,
  },
  // Registered Vendor demo seeds — real priced menus so the customer-facing
  // tab (browse vendor -> menu -> cart -> checkout) is demoable without
  // anyone having to register and stock a vendor account first.
  {
    id: 'vendor-2',
    name: 'CLSU Grill & Rice Bowl',
    businessType: 'resto_food',
    adminPin: '1232',
    contactPhone: '0917-600-2002',
    province: 'Nueva Ecija',
    city: 'Science City of Muñoz',
    barangay: 'CLSU',
    addressDetail: 'Food strip near the CLSU main gate',
    coords: { x: 16, y: 21 },
    locationGps: { lat: 15.7325, lng: 120.9312 },
    isOpen: true,
    verificationStatus: 'approved',
    gcashAccount: null,
    mayaAccount: null,
  },
  // Three more Food Express vendors so the Featured Vendors grid, the
  // vendor search and the ordering flow can be tried against a row of
  // stores rather than one. Added after the pilot's shared state already
  // existed, so they are merged into it on load (see withSeedVendors in
  // RideContext.tsx) rather than only appearing on a fresh install. Their
  // menus are in MOCK_VENDOR_MENU_ITEMS below, with photos from the food
  // catalog (see lib/foodCatalog.ts).
  {
    id: 'vendor-3',
    name: "Kuya Ben's Ihaw-Ihaw",
    businessType: 'resto_food',
    adminPin: '1233',
    contactPhone: '0917-600-2003',
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'Malasin',
    addressDetail: 'Corner stall across the Malasin covered court',
    coords: { x: 64, y: 58 },
    locationGps: { lat: 15.806, lng: 120.999 },
    isOpen: true,
    verificationStatus: 'approved',
    gcashAccount: { accountName: "Kuya Ben's Ihaw-Ihaw", accountNumber: '0917-600-2003', qrDataUrl: null },
    mayaAccount: null,
    tagline: 'Sarap ng inihaw, gabi-gabi!',
    themeColor: 'red',
    // A lettered badge for the logo and a catalog dish cut-out for the
    // banner photo, so the seed stores look dressed like a real one. Paths,
    // not data URLs — an <img src> takes either, and these ship with the app.
    logoDataUrl: seedVendorLogo('KB', '#dc2626'),
    coverPhotoDataUrl: '/store-profiles/food_3.webp',
    coverPhotoPosition: { x: 78, y: 50, scale: 1.15 },
  },
  {
    id: 'vendor-4',
    name: "Manang Cora's Lugawan",
    businessType: 'resto_food',
    adminPin: '1234',
    contactPhone: '0917-600-2004',
    province: 'Nueva Ecija',
    city: 'Science City of Muñoz',
    barangay: 'Poblacion East',
    addressDetail: 'Beside the public market, Muñoz Poblacion',
    coords: { x: 22, y: 26 },
    locationGps: { lat: 15.716, lng: 120.905 },
    isOpen: true,
    verificationStatus: 'approved',
    gcashAccount: null,
    mayaAccount: { accountName: "Manang Cora's Lugawan", accountNumber: '0917-600-2004', qrDataUrl: null },
    tagline: 'Mainit na lugaw, 24 oras',
    themeColor: 'gold',
    logoDataUrl: seedVendorLogo('MC', '#b45309'),
    coverPhotoDataUrl: '/store-profiles/food_9.webp',
    coverPhotoPosition: { x: 78, y: 50, scale: 1.15 },
  },
  {
    id: 'vendor-5',
    name: 'Tita Marites Kakanin & Merienda',
    businessType: 'resto_food',
    adminPin: '1235',
    contactPhone: '0917-600-2005',
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'Abar 1st',
    addressDetail: 'Front of the barangay hall, Abar 1st',
    coords: { x: 56, y: 66 },
    locationGps: { lat: 15.793, lng: 120.98 },
    isOpen: true,
    verificationStatus: 'approved',
    gcashAccount: { accountName: 'Tita Marites Kakanin', accountNumber: '0917-600-2005', qrDataUrl: null },
    mayaAccount: null,
    tagline: 'Matamis na alaala ng probinsya',
    themeColor: 'pink',
    logoDataUrl: seedVendorLogo('TM', '#be185d'),
    coverPhotoDataUrl: '/store-profiles/food_8.webp',
    coverPhotoPosition: { x: 78, y: 50, scale: 1.15 },
  },
  // PaDeliver's Store seed — an 'other_commodity' vendor, so the screen has
  // something to browse instead of always reading "No registered vendors
  // yet". No coverPhotoDataUrl (no seeded goods-store photo the way the
  // food vendors have /store-profiles/food_*.webp) — falls back to the
  // generic themed gradient + businessType emoji, same as any real store
  // that hasn't uploaded a cover yet.
  {
    id: 'vendor-6',
    name: "Nanay Rosing's Sari-Sari Store",
    businessType: 'other_commodity',
    adminPin: '1236',
    contactPhone: '0917-600-2006',
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'Malasin',
    addressDetail: 'Beside the barangay basketball court, Malasin',
    coords: { x: 60, y: 62 },
    locationGps: { lat: 15.804, lng: 120.997 },
    isOpen: true,
    verificationStatus: 'approved',
    gcashAccount: { accountName: 'Nanay Rosing Store', accountNumber: '0917-600-2006', qrDataUrl: null },
    mayaAccount: null,
    tagline: 'Sari-sari needs, para sa buong pamilya',
    themeColor: 'blue',
    logoDataUrl: seedVendorLogo('NR', '#2563eb'),
    // A sample post so the Merchant/Store Partners feed has at least one
    // store that has actually posted — the feed only ever shows those, see
    // VendorMenuBooking. vendor-7 is left without one on purpose, so the
    // filtering is visible in the demo rather than every seed looking alike.
    posts: [
      {
        id: 'post-v6-1',
        text: 'LPG tank exchange available na ulit — ready stock! Tawag lang o i-book sa PaDeliver. 🔥',
        photoDataUrl: null,
        productId: 'menu-v6-7',
        createdAt: '2026-09-11T02:00:00.000Z',
      },
    ],
  },
  {
    id: 'vendor-7',
    name: 'Mang Tomas Hardware & Construction Supply',
    businessType: 'other_commodity',
    adminPin: '1237',
    contactPhone: '0917-600-2007',
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'Abar 2nd',
    addressDetail: 'Along the highway, across the gasoline station, Abar 2nd',
    coords: { x: 66, y: 60 },
    locationGps: { lat: 15.807, lng: 121.001 },
    isOpen: true,
    verificationStatus: 'approved',
    gcashAccount: { accountName: 'Mang Tomas Hardware', accountNumber: '0917-600-2007', qrDataUrl: null },
    mayaAccount: null,
    tagline: 'Tools and materials, para sa bahay at negosyo',
    themeColor: 'orange',
    logoDataUrl: seedVendorLogo('MT', '#c2410c'),
  },
  {
    id: 'vendor-8',
    name: "Criselda's School & Office Supplies",
    businessType: 'other_commodity',
    adminPin: '1238',
    contactPhone: '0917-600-2008',
    province: 'Nueva Ecija',
    city: 'San Jose City',
    barangay: 'Crisanto Sanchez Poblacion',
    addressDetail: 'Beside the elementary school gate, Crisanto Sanchez Poblacion',
    coords: { x: 58, y: 58 },
    locationGps: { lat: 15.796, lng: 120.99 },
    isOpen: true,
    verificationStatus: 'approved',
    gcashAccount: { accountName: "Criselda's Supplies", accountNumber: '0917-600-2008', qrDataUrl: null },
    mayaAccount: null,
    tagline: 'Para sa eskwela at opisina',
    themeColor: 'purple',
    logoDataUrl: seedVendorLogo('CS', '#7e22ce'),
    posts: [
      {
        id: 'post-v8-1',
        text: 'Back-to-school bundle promo! Bond paper, notebooks and ballpens — pa-deliver diretso sa bahay. ✏️',
        photoDataUrl: null,
        productId: 'menu-v8-1',
        createdAt: '2026-09-12T05:30:00.000Z',
      },
    ],
  },
]

// A handful of products per pharmacy spanning all three MedicineCategory
// values, so the customer-facing catalog can demonstrate every badge
// (OTC / Rx required / Restricted) without needing a real inventory feed.
export const MOCK_MEDICINE_PRODUCTS: MedicineProduct[] = [
  { id: 'med-1', pharmacyId: 'pharm-1', name: 'Biogesic 500mg', genericName: 'Paracetamol', category: 'otc', price: 5, inStock: true },
  { id: 'med-2', pharmacyId: 'pharm-1', name: 'Cecon 500mg', genericName: 'Vitamin C (Ascorbic Acid)', category: 'otc', price: 8, inStock: true },
  { id: 'med-3', pharmacyId: 'pharm-1', name: 'Amoxil 500mg', genericName: 'Amoxicillin', category: 'rx', price: 12, inStock: true },
  { id: 'med-4', pharmacyId: 'pharm-1', name: 'Virlix 10mg', genericName: 'Cetirizine', category: 'otc', price: 10, inStock: true },
  { id: 'med-5', pharmacyId: 'pharm-1', name: 'Tramadol 50mg', genericName: 'Tramadol HCl', category: 'restricted', price: 25, inStock: true },
  { id: 'med-6', pharmacyId: 'pharm-2', name: 'Biogesic 500mg', genericName: 'Paracetamol', category: 'otc', price: 6, inStock: true },
  { id: 'med-7', pharmacyId: 'pharm-2', name: 'Imodium 2mg', genericName: 'Loperamide', category: 'otc', price: 15, inStock: true },
  { id: 'med-8', pharmacyId: 'pharm-2', name: 'Glucophage 500mg', genericName: 'Metformin', category: 'rx', price: 7, inStock: true },
  { id: 'med-9', pharmacyId: 'pharm-2', name: 'Valium 5mg', genericName: 'Diazepam', category: 'restricted', price: 30, inStock: false },
  { id: 'med-10', pharmacyId: 'pharm-3', name: 'Biogesic 500mg', genericName: 'Paracetamol', category: 'otc', price: 5, inStock: true },
  { id: 'med-11', pharmacyId: 'pharm-3', name: 'Ceelin Plus', genericName: 'Vitamin C + Zinc', category: 'otc', price: 9, inStock: true },
  { id: 'med-12', pharmacyId: 'pharm-3', name: 'Amoxil 500mg', genericName: 'Amoxicillin', category: 'rx', price: 11, inStock: true },
  { id: 'med-13', pharmacyId: 'pharm-3', name: 'Tramadol 50mg', genericName: 'Tramadol HCl', category: 'restricted', price: 28, inStock: true },
  { id: 'med-14', pharmacyId: 'pharm-4', name: 'Biogesic 500mg', genericName: 'Paracetamol', category: 'otc', price: 5, inStock: true },
  { id: 'med-15', pharmacyId: 'pharm-4', name: 'Neozep Forte', genericName: 'Phenylephrine + Paracetamol', category: 'otc', price: 8, inStock: true },
  { id: 'med-16', pharmacyId: 'pharm-4', name: 'Amoxil 500mg', genericName: 'Amoxicillin', category: 'rx', price: 12, inStock: true },
  { id: 'med-17', pharmacyId: 'pharm-4', name: 'Tramadol 50mg', genericName: 'Tramadol HCl', category: 'restricted', price: 26, inStock: true },
  { id: 'med-18', pharmacyId: 'pharm-5', name: 'Biogesic 500mg', genericName: 'Paracetamol', category: 'otc', price: 5, inStock: true },
  { id: 'med-19', pharmacyId: 'pharm-5', name: 'Bioflu', genericName: 'Paracetamol + Phenylephrine + Chlorphenamine', category: 'otc', price: 9, inStock: true },
  { id: 'med-20', pharmacyId: 'pharm-5', name: 'Losartan 50mg', genericName: 'Losartan Potassium', category: 'rx', price: 10, inStock: true },
  { id: 'med-21', pharmacyId: 'pharm-5', name: 'Ceelin Plus', genericName: 'Vitamin C + Zinc', category: 'otc', price: 9, inStock: false },
  { id: 'med-22', pharmacyId: 'pharm-6', name: 'Biogesic 500mg', genericName: 'Paracetamol', category: 'otc', price: 5, inStock: true },
  { id: 'med-23', pharmacyId: 'pharm-6', name: 'Amoxil 500mg', genericName: 'Amoxicillin', category: 'rx', price: 12, inStock: true },
  { id: 'med-24', pharmacyId: 'pharm-6', name: 'Diazepam 5mg', genericName: 'Diazepam', category: 'restricted', price: 27, inStock: true },
  { id: 'med-25', pharmacyId: 'pharm-7', name: 'Biogesic 500mg', genericName: 'Paracetamol', category: 'otc', price: 5, inStock: true },
  { id: 'med-26', pharmacyId: 'pharm-7', name: 'Kremil-S', genericName: 'Antacid', category: 'otc', price: 8, inStock: true },
  { id: 'med-27', pharmacyId: 'pharm-7', name: 'Amoxil 500mg', genericName: 'Amoxicillin', category: 'rx', price: 13, inStock: true },
  { id: 'med-28', pharmacyId: 'pharm-7', name: 'Tramadol 50mg', genericName: 'Tramadol HCl', category: 'restricted', price: 29, inStock: true },
  { id: 'med-29', pharmacyId: 'pharm-8', name: 'Biogesic 500mg', genericName: 'Paracetamol', category: 'otc', price: 5, inStock: true },
  { id: 'med-30', pharmacyId: 'pharm-8', name: 'Neozep Forte', genericName: 'Phenylephrine + Paracetamol', category: 'otc', price: 8, inStock: true },
  { id: 'med-31', pharmacyId: 'pharm-8', name: 'Metformin 500mg', genericName: 'Metformin', category: 'rx', price: 6, inStock: true },
  { id: 'med-32', pharmacyId: 'pharm-9', name: 'Biogesic 500mg', genericName: 'Paracetamol', category: 'otc', price: 5, inStock: true },
  { id: 'med-33', pharmacyId: 'pharm-9', name: 'Cecon 500mg', genericName: 'Vitamin C (Ascorbic Acid)', category: 'otc', price: 8, inStock: true },
  { id: 'med-34', pharmacyId: 'pharm-9', name: 'Amoxil 500mg', genericName: 'Amoxicillin', category: 'rx', price: 12, inStock: false },
]

// Registered Vendor demo menus — `category` is unused for a vendor item
// (it's a MedicineCategory value that has no meaning for a dish) and stays
// 'otc' so CREATE_MEDS_ORDER's Rx-prescription check never fires on a food
// order; `menuCategory`/`photoDataUrl` are what actually organize a menu.
export const MOCK_VENDOR_MENU_ITEMS: MedicineProduct[] = [
  { id: 'menu-9', pharmacyId: 'vendor-2', name: 'Pork BBQ (2 sticks)', genericName: null, category: 'otc', price: 60, inStock: true, menuCategory: 'Grill', photoDataUrl: null },
  { id: 'menu-10', pharmacyId: 'vendor-2', name: 'Chicken Inasal', genericName: null, category: 'otc', price: 95, inStock: true, menuCategory: 'Grill', photoDataUrl: null },
  { id: 'menu-11', pharmacyId: 'vendor-2', name: 'Sisig Rice Bowl', genericName: null, category: 'otc', price: 85, inStock: true, menuCategory: 'Rice Bowls', photoDataUrl: null },
  { id: 'menu-12', pharmacyId: 'vendor-2', name: 'Bangus Rice Bowl', genericName: null, category: 'otc', price: 80, inStock: true, menuCategory: 'Rice Bowls', photoDataUrl: null },
  { id: 'menu-13', pharmacyId: 'vendor-2', name: 'Extra Rice', genericName: null, category: 'otc', price: 15, inStock: true, menuCategory: 'Rice Bowls', photoDataUrl: null },
  { id: 'menu-14', pharmacyId: 'vendor-2', name: 'Bottled Water', genericName: null, category: 'otc', price: 15, inStock: true, menuCategory: 'Drinks', photoDataUrl: null },
  { id: 'menu-15', pharmacyId: 'vendor-2', name: 'Softdrinks (16oz)', genericName: null, category: 'otc', price: 30, inStock: true, menuCategory: 'Drinks', photoDataUrl: null },

  // Kuya Ben's Ihaw-Ihaw — grill and street food. photoDataUrl carries a
  // catalog photo path here (an <img src> takes either); a vendor's own
  // uploads replace it with a data URL.
  { id: 'menu-v3-1', pharmacyId: 'vendor-3', name: 'Chicken Inasal', genericName: null, category: 'otc', price: 110, inStock: true, menuCategory: 'Chicken', photoDataUrl: '/food-photos/005-chicken-inasal.jpg', description: 'Ilonggo-style grilled chicken leg quarter with rice and sinamak.', badge: 'best_seller', stockCount: 30 },
  { id: 'menu-v3-2', pharmacyId: 'vendor-3', name: 'Pork Sisig', genericName: null, category: 'otc', price: 95, inStock: true, menuCategory: 'Pork', photoDataUrl: '/food-photos/018-pork-sisig.jpg', description: 'Sizzling chopped pork with onion, chili and calamansi, topped with egg.', badge: 'must_try', stockCount: 20 },
  { id: 'menu-v3-3', pharmacyId: 'vendor-3', name: 'Isaw (3 sticks)', genericName: null, category: 'otc', price: 30, inStock: true, menuCategory: 'Street Food', photoDataUrl: '/food-photos/167-isaw.jpg', description: 'Grilled chicken intestines with spiced vinegar dip.', badge: 'popular' },
  { id: 'menu-v3-4', pharmacyId: 'vendor-3', name: 'Bulalo', genericName: null, category: 'otc', price: 150, inStock: true, menuCategory: 'Beef', photoDataUrl: '/food-photos/047-bulalo.jpg', description: 'Beef shank and bone marrow soup with corn and pechay — good for two.' },
  { id: 'menu-v3-5', pharmacyId: 'vendor-3', name: 'Lumpiang Shanghai (6 pcs)', genericName: null, category: 'otc', price: 60, inStock: true, menuCategory: 'Snacks', photoDataUrl: '/food-photos/173-lumpiang-shanghai.jpg', description: 'Crispy pork spring rolls with sweet chili sauce.' },
  { id: 'menu-v3-6', pharmacyId: 'vendor-3', name: 'Iced Tea (16oz)', genericName: null, category: 'otc', price: 25, inStock: true, menuCategory: 'Drinks', photoDataUrl: '/food-photos/199-iced-tea.jpg', description: 'House-brewed iced tea.' },

  // Manang Cora's Lugawan — rice porridge and silog breakfasts.
  { id: 'menu-v4-1', pharmacyId: 'vendor-4', name: 'Lugaw', genericName: null, category: 'otc', price: 35, inStock: true, menuCategory: 'Breakfast', photoDataUrl: '/food-photos/135-lugaw.jpg', description: 'Plain rice porridge with ginger, toasted garlic and spring onion.', badge: 'best_seller', stockCount: 60 },
  { id: 'menu-v4-2', pharmacyId: 'vendor-4', name: 'Goto', genericName: null, category: 'otc', price: 55, inStock: true, menuCategory: 'Breakfast', photoDataUrl: '/food-photos/136-goto.jpg', description: 'Rice porridge with tender beef tripe, boiled egg and chicharon.', badge: 'popular', stockCount: 40 },
  { id: 'menu-v4-3', pharmacyId: 'vendor-4', name: 'Arroz Caldo', genericName: null, category: 'otc', price: 60, inStock: true, menuCategory: 'Breakfast', photoDataUrl: '/food-photos/134-arroz-caldo.jpg', description: 'Chicken rice porridge with kasubha and a boiled egg.' },
  { id: 'menu-v4-4', pharmacyId: 'vendor-4', name: 'Tapsilog', genericName: null, category: 'otc', price: 85, inStock: true, menuCategory: 'Rice Meals', photoDataUrl: '/food-photos/141-tapsilog.jpg', description: 'Beef tapa, garlic rice and fried egg.', badge: 'must_try' },
  { id: 'menu-v4-5', pharmacyId: 'vendor-4', name: 'Longsilog', genericName: null, category: 'otc', price: 75, inStock: true, menuCategory: 'Rice Meals', photoDataUrl: '/food-photos/142-longsilog.jpg', description: 'Sweet longganisa, garlic rice and fried egg.' },
  { id: 'menu-v4-6', pharmacyId: 'vendor-4', name: 'Bangsilog', genericName: null, category: 'otc', price: 80, inStock: true, menuCategory: 'Rice Meals', photoDataUrl: '/food-photos/144-bangsilog.jpg', description: 'Fried boneless bangus, garlic rice and fried egg.' },
  { id: 'menu-v4-7', pharmacyId: 'vendor-4', name: 'Calamansi Juice', genericName: null, category: 'otc', price: 20, inStock: true, menuCategory: 'Drinks', photoDataUrl: '/food-photos/195-calamansi-juice.jpg', description: 'Freshly squeezed, hot or iced.' },

  // Tita Marites Kakanin & Merienda — rice cakes, sweets and coolers.
  { id: 'menu-v5-1', pharmacyId: 'vendor-5', name: 'Bibingka', genericName: null, category: 'otc', price: 40, inStock: true, menuCategory: 'Dessert', photoDataUrl: '/food-photos/187-bibingka.jpg', description: 'Charcoal-baked rice cake with salted egg and grated coconut.', badge: 'best_seller', stockCount: 25 },
  { id: 'menu-v5-2', pharmacyId: 'vendor-5', name: 'Puto (6 pcs)', genericName: null, category: 'otc', price: 30, inStock: true, menuCategory: 'Snacks', photoDataUrl: '/food-photos/188-puto.jpg', description: 'Soft steamed rice cakes, cheese on top.' },
  { id: 'menu-v5-3', pharmacyId: 'vendor-5', name: 'Pichi-Pichi (6 pcs)', genericName: null, category: 'otc', price: 35, inStock: true, menuCategory: 'Snacks', photoDataUrl: '/food-photos/190-pichi-pichi.jpg', description: 'Chewy cassava cakes rolled in grated coconut.' },
  { id: 'menu-v5-4', pharmacyId: 'vendor-5', name: 'Turon (2 pcs)', genericName: null, category: 'otc', price: 25, inStock: true, menuCategory: 'Snacks', photoDataUrl: '/food-photos/174-turon.jpg', description: 'Caramelized banana and jackfruit spring rolls.', badge: 'popular' },
  { id: 'menu-v5-5', pharmacyId: 'vendor-5', name: 'Halo-Halo', genericName: null, category: 'otc', price: 65, inStock: true, menuCategory: 'Dessert', photoDataUrl: '/food-photos/181-halo-halo.jpg', description: 'Shaved ice with sweet beans, jellies, leche flan and ube ice cream.', badge: 'must_try', stockCount: 30 },
  { id: 'menu-v5-6', pharmacyId: 'vendor-5', name: 'Buko Pandan', genericName: null, category: 'otc', price: 45, inStock: true, menuCategory: 'Dessert', photoDataUrl: '/food-photos/184-buko-pandan.jpg', description: 'Young coconut and pandan jelly in sweet cream.' },
  { id: 'menu-v5-7', pharmacyId: 'vendor-5', name: 'Mais con Yelo', genericName: null, category: 'otc', price: 40, inStock: true, menuCategory: 'Dessert', photoDataUrl: '/food-photos/192-mais-con-yelo.jpg', description: 'Sweet corn, milk and shaved ice.' },
  { id: 'menu-v5-8', pharmacyId: 'vendor-5', name: 'Pancit Bihon (party tray slice)', genericName: null, category: 'otc', price: 60, inStock: true, menuCategory: 'Noodles', photoDataUrl: '/food-photos/101-pancit-bihon.jpg', description: 'Stir-fried rice noodles with vegetables and chicken.' },

  // Nanay Rosing's Sari-Sari Store (vendor-6) — PaDeliver's Store seed.
  { id: 'menu-v6-1', pharmacyId: 'vendor-6', name: 'Rice (1kg)', genericName: null, category: 'otc', price: 58, inStock: true, menuCategory: 'Groceries', description: 'Well-milled rice, sold by the kilo.' },
  { id: 'menu-v6-2', pharmacyId: 'vendor-6', name: 'Cooking Oil (1L)', genericName: null, category: 'otc', price: 95, inStock: true, menuCategory: 'Groceries', description: 'Palm cooking oil, 1 liter pouch.' },
  { id: 'menu-v6-3', pharmacyId: 'vendor-6', name: 'Eggs (tray of 30)', genericName: null, category: 'otc', price: 210, inStock: true, menuCategory: 'Groceries', description: 'Fresh medium eggs, by the tray.' },
  { id: 'menu-v6-4', pharmacyId: 'vendor-6', name: 'Instant Noodles (pack)', genericName: null, category: 'otc', price: 15, inStock: true, menuCategory: 'Groceries', description: 'Beef or chicken flavor, sold per pack.' },
  { id: 'menu-v6-5', pharmacyId: 'vendor-6', name: 'Laundry Detergent (1kg)', genericName: null, category: 'otc', price: 85, inStock: true, menuCategory: 'Household', description: 'Powder detergent, floral scent.' },
  { id: 'menu-v6-6', pharmacyId: 'vendor-6', name: 'Dishwashing Liquid (500ml)', genericName: null, category: 'otc', price: 65, inStock: true, menuCategory: 'Household', description: 'Concentrated, lemon scent.' },
  { id: 'menu-v6-7', pharmacyId: 'vendor-6', name: 'LPG Refill (11kg)', genericName: null, category: 'otc', price: 950, inStock: true, menuCategory: 'Household', description: 'Tank exchange — bring your own empty cylinder.', badge: 'best_seller' },
  { id: 'menu-v6-8', pharmacyId: 'vendor-6', name: 'Bottled Water (6x500ml)', genericName: null, category: 'otc', price: 45, inStock: true, menuCategory: 'Groceries', description: 'Purified drinking water, pack of 6.' },

  // Mang Tomas Hardware & Construction Supply (vendor-7) — PaDeliver's Store seed.
  { id: 'menu-v7-1', pharmacyId: 'vendor-7', name: 'Cement (1 bag, 40kg)', genericName: null, category: 'otc', price: 260, inStock: true, menuCategory: 'Construction', description: 'Portland cement, 40kg bag.' },
  { id: 'menu-v7-2', pharmacyId: 'vendor-7', name: 'Hollow Blocks (piece)', genericName: null, category: 'otc', price: 12, inStock: true, menuCategory: 'Construction', description: '4-inch CHB, sold per piece.' },
  { id: 'menu-v7-3', pharmacyId: 'vendor-7', name: 'GI Nails (1kg)', genericName: null, category: 'otc', price: 75, inStock: true, menuCategory: 'Tools & Hardware', description: 'Assorted sizes, common wire nails.' },
  { id: 'menu-v7-4', pharmacyId: 'vendor-7', name: 'Claw Hammer', genericName: null, category: 'otc', price: 180, inStock: true, menuCategory: 'Tools & Hardware', description: '16oz steel head, rubber grip.' },
  { id: 'menu-v7-5', pharmacyId: 'vendor-7', name: 'PVC Pipe (10ft, 1/2")', genericName: null, category: 'otc', price: 95, inStock: true, menuCategory: 'Plumbing', description: 'Standard blue PVC water pipe.' },
  { id: 'menu-v7-6', pharmacyId: 'vendor-7', name: 'Latex Paint (1L, white)', genericName: null, category: 'otc', price: 210, inStock: true, menuCategory: 'Paint', description: 'Interior flat latex paint.', badge: 'best_seller' },
  { id: 'menu-v7-7', pharmacyId: 'vendor-7', name: 'Extension Cord (5m)', genericName: null, category: 'otc', price: 165, inStock: true, menuCategory: 'Electrical', description: '3-outlet heavy-duty extension.' },
  { id: 'menu-v7-8', pharmacyId: 'vendor-7', name: 'Garden Hose (10m)', genericName: null, category: 'otc', price: 320, inStock: true, menuCategory: 'Garden', description: 'Flexible rubber hose with nozzle.' },

  // Criselda's School & Office Supplies (vendor-8) — PaDeliver's Store seed.
  { id: 'menu-v8-1', pharmacyId: 'vendor-8', name: 'Bond Paper (1 ream, short)', genericName: null, category: 'otc', price: 190, inStock: true, menuCategory: 'Paper & Printing', description: 'Sub 20, 500 sheets.', badge: 'best_seller' },
  { id: 'menu-v8-2', pharmacyId: 'vendor-8', name: 'Ballpen (box of 12)', genericName: null, category: 'otc', price: 65, inStock: true, menuCategory: 'Writing', description: 'Black ink, medium tip.' },
  { id: 'menu-v8-3', pharmacyId: 'vendor-8', name: 'Spiral Notebook (80 leaves)', genericName: null, category: 'otc', price: 35, inStock: true, menuCategory: 'School Supplies', description: 'One subject, assorted colors.' },
  { id: 'menu-v8-4', pharmacyId: 'vendor-8', name: 'Scientific Calculator', genericName: null, category: 'otc', price: 450, inStock: true, menuCategory: 'School Supplies', description: 'Basic scientific functions, exam-ready.' },
  { id: 'menu-v8-5', pharmacyId: 'vendor-8', name: 'Manila Paper (10 pcs)', genericName: null, category: 'otc', price: 50, inStock: true, menuCategory: 'Paper & Printing', description: 'For projects and visual aids.' },
  { id: 'menu-v8-6', pharmacyId: 'vendor-8', name: 'Bond Paper Folder (10 pcs)', genericName: null, category: 'otc', price: 60, inStock: true, menuCategory: 'Office Supplies', description: 'Long size, assorted colors.' },
  { id: 'menu-v8-7', pharmacyId: 'vendor-8', name: 'Stapler with Staples', genericName: null, category: 'otc', price: 120, inStock: true, menuCategory: 'Office Supplies', description: 'No. 35 stapler, includes one box of staple wire.' },
]

// Flat delivery + service fee for a MEDS order — same "flat, not
// distance-based" shape as DEFAULT_PABILI_SERVICE_FEE below, kept separate
// since MEDS pricing may diverge from Pabili's later.
export const DEFAULT_MEDS_DELIVERY_FEE = 25
export const DEFAULT_MEDS_SERVICE_FEE = 15

// What a Registered Vendor owes the platform (see Pharmacy.perOrderFee /
// monthlyPlatformFee): a flat fee per delivered order, no monthly plan fee
// by default. Separate from DEFAULT_MEDS_SERVICE_FEE above, which the
// CUSTOMER pays on top of the goods and the driver collects.
export const DEFAULT_VENDOR_MONTHLY_FEE = 0
export const DEFAULT_VENDOR_PER_ORDER_FEE = 5

// Two ways to pay, not three.
//
// GCash and Maya were separate buttons, which asked the passenger to decide
// something the app does not act on: both settle the same way, between the
// passenger and the driver, and every rule in here that cares reads them
// together as "e-wallet" anyway. Three buttons on a phone-width row for a
// two-way choice cost a third of the row and a moment's thought each time.
//
// 'gcash' remains the stored value behind E-Wallet — it is what the ledger,
// the SOA and the driver's saved account already speak, and renaming a value
// that a year of records is written in buys nothing the label does not.
export const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'cash', label: 'Cash' },
  { id: 'gcash', label: 'E-Wallet' },
]

// 'maya' still resolves, because rides booked before this change carry it.
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  gcash: 'E-Wallet',
  maya: 'E-Wallet',
  card: 'Card',
}

export const DRIVER_REPORT_REASONS: DriverReportReason[] = [
  'unsafe_driving',
  'rude_behavior',
  'overcharging',
  'vehicle_condition',
  'other',
]

export const DRIVER_REPORT_REASON_LABELS: Record<DriverReportReason, string> = {
  unsafe_driving: 'Unsafe driving',
  rude_behavior: 'Rude behavior',
  overcharging: 'Overcharging',
  vehicle_condition: 'Vehicle condition',
  other: 'Other',
}

// Historical flat zone-hop model — superseded by the LGU-style tariff below
// (estimateFare now uses real distance), kept only as the fallback numbers
// shown before Admin ever changes anything.
export const BASE_FARE = 15
export const PER_HOP_RATE = 8

// Standard LGU tricycle tariff shape: a flat base rate (student or regular)
// that covers the first few kilometers, then a per-km rate beyond that.
// Admin-configurable at runtime via RideContext's tariffSettings — these are
// just the starting defaults.
export const DEFAULT_TARIFF_SETTINGS: TariffSettings = {
  standardRate: BASE_FARE,
  studentRate: 12,
  pwdSeniorRate: 12,
  perKmRate: PER_HOP_RATE,
  standardKmCovered: 2,
  extraPassengerFee: 5,
  groupRideDiscountPct: 10,
  groupRideFareMode: 'percent',
  // Seeded to what the 10% rule produces at a P15 standard rate, so
  // switching to flat changes nothing until somebody edits them.
  groupRideFlatRate2: 27,
  groupRideFlatRate3: 41,
  groupRideFlatRate4: 54,
}

// Admin-configurable flat charge added on top of the standard fare for a
// Pabili (errand/delivery) order — separate from the tariff above since it's
// not a distance-based rate, just a flat service fee for the driver's time
// buying the items.
// A flat errand rate for TODAs that would rather quote one number than
// explain a distance calculation at the kerb. Only used in 'fixed' mode.
// How far from its terminal a TODA still counts as working its own area.
// Beyond it, a driver starting the job from out there is travelling distance
// nobody booked, and the fare says so.
export const DEFAULT_TODA_RADIUS_KM = 3

// What the driver's out-of-area approach adds, per km beyond the radius.
// Deliberately below the passenger per-km rate: the passenger is not the
// reason the driver was parked out there.
export const DEFAULT_OUT_OF_AREA_PER_KM = 8

export function estimateOutOfAreaBreakdown(
  driverOriginGps: GeoCoords | null,
  terminalGps: GeoCoords | null,
  radiusKm: number,
  perKm: number,
): { distanceKm: number; extraKm: number; fee: number } {
  if (!driverOriginGps || !terminalGps) return { distanceKm: 0, extraKm: 0, fee: 0 }
  const distanceKm = haversineDistanceMeters(driverOriginGps, terminalGps) / 1000
  const extraKm = Math.max(0, distanceKm - radiusKm)
  return { distanceKm, extraKm, fee: Math.round(extraKm * perKm) }
}

export const DEFAULT_PABILI_FIXED_FARE = 50

export const DEFAULT_PABILI_SERVICE_FEE = 20

export interface FareOptions {
  isStudent: boolean
  isPwdSenior: boolean
  passengerCount: number
}

// Itemized version of estimateFare's math, for showing the passenger exactly
// what they're paying for (standard rate vs. distance overage) before they
// submit a request — see PassengerPage's fare-preview section.
export interface FareBreakdown {
  baseRate: number
  distanceKm: number
  extraKm: number
  extraKmFee: number
  extraPassengers: number
  total: number
}

// Real (haversine) distance between pickup and dropoff, in km, using each
// location's actual gps — not the abstract x/y simulation grid, which has
// no meaningful units to convert from. PWD/Senior takes priority over the
// student rate if both are somehow true. For a standard (non-discounted)
// group booking of 2-4, standardRate×passengerCount minus the admin-set
// group discount % replaces the base rate + flat per-head surcharge;
// discounted rides and groups of 5+ keep using the flat surcharge.
// What a group of 2-4 pays in total, by whichever method the operator
// chose. A flat rate of zero is treated as unset and falls through to the
// percentage: a half-filled form should not hand somebody a free ride.
function groupFare(tariff: TariffSettings, passengerCount: number): number {
  if (tariff.groupRideFareMode === 'flat') {
    const flat =
      passengerCount === 2
        ? tariff.groupRideFlatRate2
        : passengerCount === 3
          ? tariff.groupRideFlatRate3
          : tariff.groupRideFlatRate4
    if (flat > 0) return flat
  }
  return tariff.standardRate * passengerCount * (1 - tariff.groupRideDiscountPct / 100)
}

// Which tariff applies to a particular ride.
//
// A taripa is set by an LGU, so it is a fact about a city, not about the
// app — Munoz and San Jose publish different ones and both are correct.
// A TODA may also have been granted its own schedule inside a city, which
// is why an organisation can override its city in turn.
//
// Most narrow wins: TODA, then city, then the platform default. Each
// override is a whole schedule rather than a patch, so an operator
// reading one screen sees every figure that will actually be charged and
// never has to hold two sets in their head to work out the total.
export function resolveTariff(
  base: TariffSettings,
  cityTariffs: Record<string, TariffSettings> | undefined,
  todaTariffs: Record<string, TariffSettings> | undefined,
  city: string | null | undefined,
  todaOrgId: string | null | undefined,
): TariffSettings {
  if (todaOrgId && todaTariffs?.[todaOrgId]) return todaTariffs[todaOrgId]
  if (city && cityTariffs?.[city]) return cityTariffs[city]
  return base
}

export function estimateFareBreakdown(
  pickup: MockLocation,
  dropoff: MockLocation,
  tariff: TariffSettings,
  { isStudent, isPwdSenior, passengerCount }: FareOptions,
): FareBreakdown {
  const isGroupEligible = !isStudent && !isPwdSenior && passengerCount >= 2 && passengerCount <= 4
  const groupRate = isGroupEligible ? groupFare(tariff, passengerCount) : null
  const baseRate =
    typeof groupRate === 'number'
      ? groupRate
      : isPwdSenior
        ? tariff.pwdSeniorRate
        : isStudent
          ? tariff.studentRate
          : tariff.standardRate
  const extraPassengers = typeof groupRate === 'number' ? 0 : Math.max(0, passengerCount - 1) * tariff.extraPassengerFee
  if (pickup.id === dropoff.id) {
    return { baseRate, distanceKm: 0, extraKm: 0, extraKmFee: 0, extraPassengers, total: Math.round(baseRate + extraPassengers) }
  }
  const distanceKm = haversineDistanceMeters(pickup.gps, dropoff.gps) / 1000
  const extraKm = Math.max(0, distanceKm - tariff.standardKmCovered)
  const extraKmFee = extraKm * tariff.perKmRate
  return { baseRate, distanceKm, extraKm, extraKmFee, extraPassengers, total: Math.round(baseRate + extraKmFee + extraPassengers) }
}

export function estimateFare(
  pickup: MockLocation,
  dropoff: MockLocation,
  tariff: TariffSettings,
  options: FareOptions,
): number {
  return estimateFareBreakdown(pickup, dropoff, tariff, options).total
}

// Real-world gps for a TODA org's terminal. The three seed orgs use the
// legacy grid (`terminalLocationId` → MOCK_LOCATIONS, which has accurate real
// gps); newer self-registered orgs have no grid entry and rely on
// `org.terminalGps`, captured live via the browser Geolocation API when the
// TODA Admin sets it.
export function getTerminalGps(org: TodaOrganization | undefined | null): GeoCoords | null {
  if (!org) return null
  const gridTerminal = MOCK_LOCATIONS.find((l) => l.id === org.terminalLocationId)
  return gridTerminal?.gps ?? org.terminalGps
}

export interface SpecialPickupBreakdown {
  distanceKm: number
  extraKm: number
  fee: number
}

// "Special pickup" fee: when the passenger's TODA Terminal is far from where
// they actually are, they can request the driver come to their exact spot
// instead of the terminal — this is the extra distance the driver has to
// cover to reach them, charged with the same "first `standardKmCovered` km
// free, then perKmRate per km" shape as the ride fare itself (not a separate
// fee schedule). Zero if the terminal is within the covered km, or if either
// gps is unknown.
export function estimateSpecialPickupBreakdown(
  terminalGps: GeoCoords | null,
  pickupGps: GeoCoords | null,
  tariff: TariffSettings,
): SpecialPickupBreakdown {
  if (!terminalGps || !pickupGps) return { distanceKm: 0, extraKm: 0, fee: 0 }
  const distanceKm = haversineDistanceMeters(terminalGps, pickupGps) / 1000
  const extraKm = Math.max(0, distanceKm - tariff.standardKmCovered)
  return { distanceKm, extraKm, fee: Math.round(extraKm * tariff.perKmRate) }
}

export function estimateSpecialPickupFee(
  terminalGps: GeoCoords | null,
  pickupGps: GeoCoords | null,
  tariff: TariffSettings,
): number {
  return estimateSpecialPickupBreakdown(terminalGps, pickupGps, tariff).fee
}

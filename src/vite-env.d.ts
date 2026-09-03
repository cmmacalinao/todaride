/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Optional — when set, geocode.ts/routing.ts prefer Google's
  // Geocoding/Directions APIs over the free Nominatim/OSRM fallback. Needs
  // the Geocoding API and Directions API enabled (with billing) on the
  // Google Cloud project this key belongs to.
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// The build this bundle came from, written in by vite.config's buildLabel at
// compile time. Read by BuildLabel — see that component for why it is shown.
declare const __BUILD_LABEL__: string

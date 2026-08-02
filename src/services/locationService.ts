/**
 * locationService.ts
 *
 * Pure (non-React) service that:
 *  1. Requests browser geolocation coordinates
 *  2. Reverse-geocodes coordinates to country + state via Nominatim (free, no key)
 *  3. Maps the result to an Electricity Maps zone string
 *
 * No React dependencies — safe to import anywhere.
 */

// ============================================================================
// Types
// ============================================================================

export interface GeoCoords {
  lat: number;
  lon: number;
}

export interface ReverseGeocodeResult {
  country: string;      // e.g. "India"
  countryCode: string;  // ISO 3166-1 alpha-2, e.g. "IN"
  state: string;        // e.g. "Karnataka"
}

export interface DetectedLocation {
  coords: GeoCoords;
  country: string;
  countryCode: string;
  state: string;
  zone: string;         // Electricity Maps zone, e.g. "IN-SO"
  source: 'geolocation';
}

// ============================================================================
// India state → Electricity Maps zone mapping
// ============================================================================

/**
 * Maps a normalised Indian state name to its Electricity Maps regional zone.
 * States not listed here fall back to the national 'IN' zone.
 *
 * Reference: Electricity Maps India zone documentation
 *   IN-SO — Southern Region
 *   IN-WE — Western Region
 *   IN-NO — Northern Region
 *   IN-EA — Eastern Region
 *   IN-NE — North-Eastern Region
 */
const INDIA_STATE_TO_ZONE: Record<string, string> = {
  // IN-SO: Southern Region
  karnataka:       'IN-SO',
  kerala:          'IN-SO',
  'tamil nadu':    'IN-SO',
  'andhra pradesh':'IN-SO',
  telangana:       'IN-SO',

  // IN-WE: Western Region
  maharashtra:     'IN-WE',
  gujarat:         'IN-WE',
  goa:             'IN-WE',
  'dadra and nagar haveli and daman and diu': 'IN-WE',

  // IN-NO: Northern Region
  delhi:           'IN-NO',
  'new delhi':     'IN-NO',
  punjab:          'IN-NO',
  haryana:         'IN-NO',
  rajasthan:       'IN-NO',
  'uttar pradesh': 'IN-NO',
  uttarakhand:     'IN-NO',
  'himachal pradesh': 'IN-NO',
  'jammu and kashmir': 'IN-NO',
  ladakh:          'IN-NO',
  chandigarh:      'IN-NO',

  // IN-EA: Eastern Region
  'west bengal':   'IN-EA',
  odisha:          'IN-EA',
  jharkhand:       'IN-EA',
  bihar:           'IN-EA',
  'sikkim':        'IN-EA',

  // IN-NE: North-Eastern Region
  assam:           'IN-NE',
  meghalaya:       'IN-NE',
  manipur:         'IN-NE',
  mizoram:         'IN-NE',
  nagaland:        'IN-NE',
  tripura:         'IN-NE',
  arunachal:       'IN-NE',
  'arunachal pradesh': 'IN-NE',
};

// ============================================================================
// Country → Electricity Maps zone mapping (global fallback)
// ============================================================================

const COUNTRY_CODE_TO_ZONE: Record<string, string> = {
  US: 'US-CA',
  GB: 'GB',
  FR: 'FR',
  DE: 'DE',
  DK: 'DK-DK2',
  NO: 'NO',
  SE: 'SE',
  FI: 'FI',
  AU: 'AU-NSW',
  NZ: 'NZ',
  JP: 'JP-TK',
  KR: 'KR',
  CN: 'CN',
  SG: 'SG',
  BR: 'BR-CS',
  CA: 'CA-ON',
  ZA: 'ZA',
  AE: 'AE',
  SA: 'SA',
  PK: 'PK',
  BD: 'BD',
  LK: 'LK',
  NP: 'NP',
  MX: 'MX',
  AR: 'AR',
  CL: 'CL',
  CO: 'CO',
  IT: 'IT',
  ES: 'ES',
  PT: 'PT',
  NL: 'NL',
  BE: 'BE',
  CH: 'CH',
  AT: 'AT',
  PL: 'PL',
};

// ============================================================================
// Step 1 — Geolocation
// ============================================================================

/**
 * Wraps navigator.geolocation.getCurrentPosition in a Promise.
 * Rejects with a GeolocationPositionError on denial or timeout.
 */
export function requestGeolocation(timeoutMs = 10_000): Promise<GeoCoords> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      {
        enableHighAccuracy: false,  // low-accuracy is fast and sufficient for zone mapping
        timeout: timeoutMs,
        maximumAge: 5 * 60_000,    // accept a 5-min cached fix
      },
    );
  });
}

// ============================================================================
// Step 2 — Reverse geocode via Nominatim (OpenStreetMap)
// ============================================================================

/**
 * Calls the Nominatim reverse geocoding API (free, no key required).
 * Returns country + state for the given coordinates.
 *
 * Rate-limit: max 1 req/sec. This is only called once per app session,
 * so this is safely within limits.
 */
export async function reverseGeocode(lat: number, lon: number): Promise<ReverseGeocodeResult> {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;

  const res = await fetch(url, {
    headers: {
      // Nominatim usage policy requires a valid User-Agent identifying your app
      'User-Agent': 'EcoTime-CarbonOptimizer/2.0 (ecotimeproject@example.com)',
      'Accept-Language': 'en',
    },
  });

  if (!res.ok) {
    throw new Error(`Nominatim returned HTTP ${res.status}`);
  }

  const data = await res.json();

  const country: string     = data.address?.country      || '';
  const countryCode: string = (data.address?.country_code || '').toUpperCase();
  // Nominatim uses 'state' for India and most countries
  const state: string       = data.address?.state         || data.address?.region || '';

  if (!countryCode) {
    throw new Error('Could not determine country from coordinates.');
  }

  return { country, countryCode, state };
}

// ============================================================================
// Step 3 — Zone mapping
// ============================================================================

/**
 * Maps a country + state to the best matching Electricity Maps zone.
 * India: uses the state-level mapping.
 * Others: uses the country-level fallback, defaulting to 'US-CA' if unknown.
 */
export function mapToElectricityZone(countryCode: string, state: string): string {
  if (countryCode === 'IN') {
    const normalisedState = state.toLowerCase().trim();

    // 1. Direct key match
    if (INDIA_STATE_TO_ZONE[normalisedState]) {
      return INDIA_STATE_TO_ZONE[normalisedState];
    }

    // 2. Substring matching for state/region strings
    for (const [key, zone] of Object.entries(INDIA_STATE_TO_ZONE)) {
      if (normalisedState.includes(key) || key.includes(normalisedState)) {
        return zone;
      }
    }

    // 3. Fallback to IN-SO for Indian locations instead of generic bare IN
    return 'IN-SO';
  }
  return COUNTRY_CODE_TO_ZONE[countryCode] ?? 'US-CA';
}

// ============================================================================
// Orchestrator — single public entry point
// ============================================================================

/**
 * Runs the full detection pipeline:
 *   requestGeolocation → reverseGeocode → mapToElectricityZone
 *
 * Throws if geolocation is denied or unavailable.
 * Does NOT catch — let the caller (useLocation hook) handle errors.
 */
export async function detectZoneFromLocation(): Promise<DetectedLocation> {
  const coords = await requestGeolocation();
  const { country, countryCode, state } = await reverseGeocode(coords.lat, coords.lon);
  const zone = mapToElectricityZone(countryCode, state);

  return { coords, country, countryCode, state, zone, source: 'geolocation' };
}

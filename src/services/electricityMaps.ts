export interface CarbonDataPoint {
  datetime: string;
  carbonIntensity: number;
}

export interface GridZone {
  id: string;
  name: string;
  country: string;
  type: 'solar' | 'wind' | 'nuclear' | 'coal' | 'mixed';
  baseIntensity: number; // base carbon intensity in gCO2eq/kWh
  amplitude: number; // cycle fluctuation height
  noise: number; // random jitter
}

export const GRID_ZONES: GridZone[] = [
  { id: 'US-CA', name: 'California (CAISO)', country: 'USA', type: 'solar', baseIntensity: 180, amplitude: 140, noise: 10 },
  { id: 'IN', name: 'India (National Grid)', country: 'India', type: 'mixed', baseIntensity: 680, amplitude: 120, noise: 15 },
  { id: 'DK-DK2', name: 'Eastern Denmark', country: 'Denmark', type: 'wind', baseIntensity: 90, amplitude: 70, noise: 15 },
  { id: 'GB', name: 'Great Britain', country: 'United Kingdom', type: 'mixed', baseIntensity: 170, amplitude: 80, noise: 12 },
  { id: 'FR', name: 'France (Nuclear)', country: 'France', type: 'nuclear', baseIntensity: 55, amplitude: 15, noise: 5 },
  { id: 'DE', name: 'Germany', country: 'Germany', type: 'mixed', baseIntensity: 340, amplitude: 110, noise: 18 },
  { id: 'BR', name: 'Brazil (Clean Grid)', country: 'Brazil', type: 'wind', baseIntensity: 75, amplitude: 25, noise: 6 },
  { id: 'AU-NSW', name: 'New South Wales', country: 'Australia', type: 'coal', baseIntensity: 620, amplitude: 90, noise: 12 },
];

export interface CarbonResponse {
  zone: string;
  current: CarbonDataPoint;
  history: CarbonDataPoint[];
  forecast: CarbonDataPoint[];
  isSimulated: boolean;
  error?: string;
}

/**
 * Helper to compute carbon intensity at a specific date/time for a zone using mathematical models
 */
export function getSimulatedIntensity(zone: GridZone, date: Date): number {
  const hours = date.getHours() + date.getMinutes() / 60;
  let wave = 0;

  switch (zone.type) {
    case 'solar':
      // Solar dips at midday (13:00) and peaks at evening (20:00)
      // Intensity is low when solar generation is high
      wave = Math.cos((2 * Math.PI * (hours - 13)) / 24);
      break;

    case 'wind':
      // Wind fluctuates with varying periodicities (simulating weather patterns)
      const dayOfYear = date.getDate();
      const wave1 = Math.sin((2 * Math.PI * hours) / 18 + dayOfYear);
      const wave2 = 0.45 * Math.cos((2 * Math.PI * hours) / 6);
      wave = (wave1 + wave2) / 1.45;
      break;

    case 'nuclear':
      // Nuclear is extremely flat, minor fluctuations
      wave = 0.2 * Math.sin((2 * Math.PI * hours) / 24);
      break;

    case 'coal':
      // Coal peaks during traditional load hours (08:00 and 19:00) due to grid stress
      wave = -0.7 * Math.cos((4 * Math.PI * (hours - 8)) / 24);
      break;

    case 'mixed':
      // Germany: solar dip + general industrial peak
      const solarDip = -0.6 * Math.exp(-Math.pow(hours - 13, 2) / 12);
      const loadPeak = 0.4 * Math.sin((2 * Math.PI * (hours - 8)) / 12);
      wave = solarDip + loadPeak;
      break;
  }

  // Calculate base intensity plus wave modification
  let intensity = zone.baseIntensity + wave * zone.amplitude;

  // Add random noise
  const seed = date.getMinutes() + date.getSeconds() / 60;
  const pseudoRandom = Math.sin(seed * 12.9898) * 43758.5453;
  const jitter = (pseudoRandom - Math.floor(pseudoRandom) - 0.5) * zone.noise * 2;
  intensity += jitter;

  // Ensure it never goes below 5 g/kWh
  return Math.max(5, Math.round(intensity));
}

/**
 * Generates the full mock dataset for a zone based on the simulated current time (in hours offsets)
 */
export function generateMockCarbonData(zoneId: string, currentOffsetHours: number = 0): CarbonResponse {
  const zone = GRID_ZONES.find(z => z.id === zoneId) || GRID_ZONES[0];
  const now = new Date();
  
  // Apply simulation time offset
  now.setMinutes(now.getMinutes() + Math.round(currentOffsetHours * 60));

  // Current
  const currentVal = getSimulatedIntensity(zone, now);
  const current: CarbonDataPoint = {
    datetime: now.toISOString(),
    carbonIntensity: currentVal,
  };

  // History (last 12 hours, hourly)
  const history: CarbonDataPoint[] = [];
  for (let i = 12; i >= 1; i--) {
    const histTime = new Date(now.getTime() - i * 60 * 60 * 1000);
    history.push({
      datetime: histTime.toISOString(),
      carbonIntensity: getSimulatedIntensity(zone, histTime),
    });
  }

  // Forecast (next 24 hours, hourly)
  const forecast: CarbonDataPoint[] = [];
  for (let i = 0; i < 24; i++) {
    const foreTime = new Date(now.getTime() + i * 60 * 60 * 1000);
    forecast.push({
      datetime: foreTime.toISOString(),
      carbonIntensity: getSimulatedIntensity(zone, foreTime),
    });
  }

  return {
    zone: zone.id,
    current,
    history,
    forecast,
    isSimulated: true,
  };
}

/**
 * Fetches data from Electricity Maps API or falls back to simulated data.
 */
export async function fetchCarbonData(
  zoneId: string,
  apiKey: string | null,
  currentOffsetHours: number = 0
): Promise<CarbonResponse> {
  if (!apiKey) {
    // If no API key, return mock data
    return generateMockCarbonData(zoneId, currentOffsetHours);
  }

  try {
    const headers: HeadersInit = {
      'auth-token': apiKey,
    };

    // Attempt to fetch current carbon intensity
    const latestRes = await fetch(`https://api.electricitymap.org/v3/carbon-intensity/latest?zone=${zoneId}`, {
      headers,
    });
    
    if (!latestRes.ok) {
      throw new Error(`Latest carbon API returned ${latestRes.status}: ${latestRes.statusText}`);
    }
    const latestData = await latestRes.json();

    // Attempt to fetch forecast intensity
    const forecastRes = await fetch(`https://api.electricitymap.org/v3/carbon-intensity/forecast?zone=${zoneId}`, {
      headers,
    });

    let forecastPoints: CarbonDataPoint[] = [];
    if (forecastRes.ok) {
      const forecastData = await forecastRes.json();
      if (forecastData.forecast && Array.isArray(forecastData.forecast)) {
        forecastPoints = forecastData.forecast.map((f: any) => ({
          datetime: f.datetime,
          carbonIntensity: f.carbonIntensity,
        }));
      }
    } else {
      console.warn('Forecast API failed, creating mock forecast based on latest intensity');
      // Create mock forecast relative to latest
      const now = new Date(latestData.datetime);
      const zone = GRID_ZONES.find(z => z.id === zoneId) || GRID_ZONES[0];
      for (let i = 0; i < 24; i++) {
        const foreTime = new Date(now.getTime() + i * 60 * 60 * 1000);
        forecastPoints.push({
          datetime: foreTime.toISOString(),
          carbonIntensity: Math.round(getSimulatedIntensity(zone, foreTime) * (latestData.carbonIntensity / zone.baseIntensity)),
        });
      }
    }

    // Mock history since history endpoints in Electricity Maps are restricted in trial keys
    const historyPoints: CarbonDataPoint[] = [];
    const now = new Date(latestData.datetime);
    const zone = GRID_ZONES.find(z => z.id === zoneId) || GRID_ZONES[0];
    for (let i = 12; i >= 1; i--) {
      const histTime = new Date(now.getTime() - i * 60 * 60 * 1000);
      historyPoints.push({
        datetime: histTime.toISOString(),
        carbonIntensity: Math.round(getSimulatedIntensity(zone, histTime) * (latestData.carbonIntensity / zone.baseIntensity)),
      });
    }

    return {
      zone: zoneId,
      current: {
        datetime: latestData.datetime,
        carbonIntensity: latestData.carbonIntensity,
      },
      history: historyPoints,
      forecast: forecastPoints,
      isSimulated: false,
    };
  } catch (err: any) {
    console.error('Electricity Maps API Fetch failed, falling back to simulation:', err);
    const mockData = generateMockCarbonData(zoneId, currentOffsetHours);
    return {
      ...mockData,
      error: `API Connection Failed (${err.message}). Using simulated fallback.`,
    };
  }
}

interface Coordinates {
  lat: number;
  lon: number;
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export type TravelLookupStatus =
  | 'ok'
  | 'same_address'
  | 'missing_api_key'
  | 'missing_address'
  | 'geocode_from_failed'
  | 'geocode_to_failed'
  | 'route_not_found'
  | 'route_error';

export interface TravelLookupResult {
  travelTimeMinutes: number | null;
  status: TravelLookupStatus;
}

const GEOCODER_URL = 'https://catalog.api.2gis.com/3.0/items/geocode';
const PUBLIC_TRANSPORT_URL = 'https://routing.api.2gis.com/public_transport/2.0';
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 7000;

const PUBLIC_TRANSPORT_TYPES = [
  'pedestrian',
  'metro',
  'light_metro',
  'suburban_train',
  'aeroexpress',
  'tram',
  'bus',
  'trolleybus',
  'shuttle_bus',
  'monorail',
  'funicular_railway',
  'river_transport',
  'cable_car',
  'light_rail',
  'premetro',
  'mcc',
  'mcd',
];

const geocodeCache = new Map<string, CacheEntry<Coordinates | null>>();
const routeCache = new Map<string, CacheEntry<TravelLookupResult>>();

function getCacheTtl(): number {
  const raw = Number(process.env.TWO_GIS_CACHE_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CACHE_TTL_MS;
}

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }

  return entry.value;
}

function setCached<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + getCacheTtl(),
  });
}

function normalizeAddress(address: string): string {
  return address.trim().replace(/\s+/g, ' ').toLowerCase();
}

function travelResult(status: TravelLookupStatus, travelTimeMinutes: number | null = null): TravelLookupResult {
  return { status, travelTimeMinutes };
}

async function fetchJson(url: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    if (response.status === 204 || response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`2GIS responded with ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function geocodeAddress(address?: string | null): Promise<Coordinates | null> {
  const apiKey = process.env.TWO_GIS_API_KEY;
  if (!apiKey || !address?.trim()) return null;

  const cacheKey = normalizeAddress(address);
  const cached = getCached(geocodeCache, cacheKey);
  if (cached !== undefined) return cached;

  try {
    const url = new URL(GEOCODER_URL);
    url.searchParams.set('q', address.trim());
    url.searchParams.set('fields', 'items.point');
    url.searchParams.set('key', apiKey);

    const data = await fetchJson(url.toString());
    const point = data?.result?.items?.[0]?.point;
    const coordinates = typeof point?.lat === 'number' && typeof point?.lon === 'number'
      ? { lat: point.lat, lon: point.lon }
      : null;

    setCached(geocodeCache, cacheKey, coordinates);
    return coordinates;
  } catch (error: any) {
    console.warn('[2GIS] Geocoding failed:', error.message);
    setCached(geocodeCache, cacheKey, null);
    return null;
  }
}

export async function getPublicTransportTravelTimeMinutes(
  fromAddress?: string | null,
  toAddress?: string | null,
  departureAt?: Date
): Promise<number | null> {
  const result = await getPublicTransportTravelTime(fromAddress, toAddress, departureAt);
  return result.travelTimeMinutes;
}

export async function getPublicTransportTravelTime(
  fromAddress?: string | null,
  toAddress?: string | null,
  departureAt?: Date
): Promise<TravelLookupResult> {
  const apiKey = process.env.TWO_GIS_API_KEY;
  if (!apiKey) return travelResult('missing_api_key');
  if (!fromAddress?.trim() || !toAddress?.trim()) return travelResult('missing_address');

  const normalizedFrom = normalizeAddress(fromAddress);
  const normalizedTo = normalizeAddress(toAddress);
  if (normalizedFrom === normalizedTo) return travelResult('same_address', 0);

  const timeBucket = departureAt
    ? Math.floor(departureAt.getTime() / (30 * 60 * 1000))
    : 'now';
  const cacheKey = `${normalizedFrom}|${normalizedTo}|${timeBucket}`;
  const cached = getCached(routeCache, cacheKey);
  if (cached !== undefined) return cached;

  const [source, target] = await Promise.all([
    geocodeAddress(fromAddress),
    geocodeAddress(toAddress),
  ]);

  if (!source || !target) {
    const result = travelResult(!source ? 'geocode_from_failed' : 'geocode_to_failed');
    setCached(routeCache, cacheKey, result);
    return result;
  }

  try {
    const url = new URL(PUBLIC_TRANSPORT_URL);
    url.searchParams.set('key', apiKey);

    const data = await fetchJson(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: { point: source },
        target: { point: target },
        transport: PUBLIC_TRANSPORT_TYPES,
        locale: 'ru',
        max_result_count: 3,
        start_time: departureAt ? Math.floor(departureAt.getTime() / 1000) : undefined,
      }),
    });

    if (!Array.isArray(data) || data.length === 0) {
      const result = travelResult('route_not_found');
      setCached(routeCache, cacheKey, result);
      return result;
    }

    const durations = data
      .map(route => Number(route?.total_duration))
      .filter(duration => Number.isFinite(duration) && duration >= 0);

    const bestDurationSeconds = durations.length > 0 ? Math.min(...durations) : null;
    const result = bestDurationSeconds === null
      ? travelResult('route_not_found')
      : travelResult('ok', Math.ceil(bestDurationSeconds / 60));

    setCached(routeCache, cacheKey, result);
    return result;
  } catch (error: any) {
    console.warn('[2GIS] Public transport route failed:', error.message);
    const result = travelResult('route_error');
    setCached(routeCache, cacheKey, result);
    return result;
  }
}

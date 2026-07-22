/**
 * Geocoding Provider
 *
 * Converts location strings to lat/lng coordinates for radius-based searches.
 * Uses OpenStreetMap Nominatim API (free, no API key required).
 *
 * Alternative providers can be added (Google Maps, MapBox) via the registry.
 *
 * Usage:
 *   const coords = await geocode("London, UK");
 *   // => { lat: 51.5074, lng: -0.1278, display: "London, Greater London, England, UK" }
 *
 *   const nearby = withinRadius(target, coords, 50); // 50km
 */

export interface GeocodeResult {
  lat: number;
  lng: number;
  display: string;
  type: string; // city, state, country, etc.
  boundingBox?: { south: number; north: number; west: number; east: number };
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface GeocodingProvider {
  name: string;
  geocode: (query: string) => Promise<GeocodeResult | null>;
  reverseGeocode: (lat: number, lng: number) => Promise<GeocodeResult | null>;
}

// --- Nominatim (OpenStreetMap) Provider ---

export const nominatimProvider: GeocodingProvider = {
  name: 'nominatim',

  async geocode(query: string): Promise<GeocodeResult | null> {
    if (!query?.trim()) return null;

    try {
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        limit: '1',
        'addressdetails': '1',
      });

      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?${params}`,
        {
          headers: {
            'User-Agent': 'LeadIntelligencePlatform/1.0 (contact@t3labs.co.uk)',
          },
          signal: AbortSignal.timeout(10000),
          // Nominatim rate limit: 1 request/second
        },
      );

      if (!res.ok) return null;

      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return null;

      const result = data[0];
      const lat = parseFloat(result.lat);
      const lng = parseFloat(result.lon);

      if (isNaN(lat) || isNaN(lng)) return null;

      const boundingBox = result.boundingbox
        ? {
            south: parseFloat(result.boundingbox[0]),
            north: parseFloat(result.boundingbox[1]),
            west: parseFloat(result.boundingbox[2]),
            east: parseFloat(result.boundingbox[3]),
          }
        : undefined;

      return {
        lat,
        lng,
        display: result.display_name,
        type: result.type || result.class || 'unknown',
        boundingBox,
      };
    } catch {
      return null;
    }
  },

  async reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
    try {
      const params = new URLSearchParams({
        lat: String(lat),
        lon: String(lng),
        format: 'json',
        'addressdetails': '1',
      });

      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?${params}`,
        {
          headers: {
            'User-Agent': 'LeadIntelligencePlatform/1.0 (contact@t3labs.co.uk)',
          },
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!res.ok) return null;

      const result = await res.json();
      if (!result || result.error) return null;

      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        display: result.display_name,
        type: result.type || result.class || 'unknown',
      };
    } catch {
      return null;
    }
  },
};

// --- Google Maps Provider (optional, requires API key) ---

export const googleMapsProvider: GeocodingProvider = {
  name: 'google-maps',

  async geocode(query: string): Promise<GeocodeResult | null> {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey || !query?.trim()) return null;

    try {
      const params = new URLSearchParams({
        address: query,
        key: apiKey,
      });

      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?${params}`,
        { signal: AbortSignal.timeout(10000) },
      );

      if (!res.ok) return null;

      const data = await res.json();
      if (data.status !== 'OK' || !data.results?.length) return null;

      const result = data.results[0];
      const loc = result.geometry.location;

      return {
        lat: loc.lat,
        lng: loc.lng,
        display: result.formatted_address,
        type: result.types?.[0] || 'unknown',
        boundingBox: result.geometry.viewport
          ? {
              south: result.geometry.viewport.southwest.lat,
              north: result.geometry.viewport.northeast.lat,
              west: result.geometry.viewport.southwest.lng,
              east: result.geometry.viewport.northeast.lng,
            }
          : undefined,
      };
    } catch {
      return null;
    }
  },

  async reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return null;

    try {
      const params = new URLSearchParams({
        latlng: `${lat},${lng}`,
        key: apiKey,
      });

      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?${params}`,
        { signal: AbortSignal.timeout(10000) },
      );

      if (!res.ok) return null;

      const data = await res.json();
      if (data.status !== 'OK' || !data.results?.length) return null;

      const result = data.results[0];
      return {
        lat,
        lng,
        display: result.formatted_address,
        type: result.types?.[0] || 'unknown',
      };
    } catch {
      return null;
    }
  },
};

// --- Registry ---

export function getGeocodingProvider(): GeocodingProvider {
  // Prefer Google Maps if API key is set
  if (process.env.GOOGLE_MAPS_API_KEY) {
    return googleMapsProvider;
  }
  // Fall back to free Nominatim
  return nominatimProvider;
}

// --- Radius utilities ---

/**
 * Haversine distance between two coordinates (in km).
 */
export function haversineKm(a: Coordinates, b: Coordinates): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Check if a target is within radiusKm of a center point.
 */
export function withinRadius(target: Coordinates, center: Coordinates, radiusKm: number): boolean {
  return haversineKm(target, center) <= radiusKm;
}

/**
 * Build a bounding box for a center point + radius.
 * Useful for pre-filtering database queries before precise haversine check.
 */
export function boundingBoxFor(center: Coordinates, radiusKm: number): {
  south: number; north: number; west: number; east: number;
} {
  const latDelta = radiusKm / 111.0; // ~111km per degree latitude
  const lngDelta = radiusKm / (111.0 * Math.cos(toRad(center.lat)));

  return {
    south: center.lat - latDelta,
    north: center.lat + latDelta,
    west: center.lng - lngDelta,
    east: center.lng + lngDelta,
  };
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// --- Rate-limited batch geocoder (for Nominatim's 1 req/sec limit) ---

export async function geocodeBatch(
  queries: string[],
  provider?: GeocodingProvider,
): Promise<Map<string, GeocodeResult | null>> {
  const p = provider || getGeocodingProvider();
  const results = new Map<string, GeocodeResult | null>();

  for (const query of queries) {
    const result = await p.geocode(query);
    results.set(query, result);

    // Rate limit: Nominatim requires max 1 req/sec
    if (p.name === 'nominatim' && queries.indexOf(query) < queries.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1100));
    }
  }

  return results;
}

// --- Strategy integration ---

/**
 * Geocode a strategy's location fields into coordinates.
 * Used by the strategy compiler to support radius-based searches.
 */
export async function geocodeStrategyLocation(opts: {
  country: string;
  stateProvince?: string | null;
  county?: string | null;
  city?: string | null;
  radiusKm?: number | null;
}): Promise<{
  center: GeocodeResult | null;
  radiusKm: number | null;
  boundingBox: { south: number; north: number; west: number; east: number } | null;
}> {
  // Build query from most specific to least specific
  const parts: string[] = [];
  if (opts.city) parts.push(opts.city);
  if (opts.county) parts.push(opts.county);
  if (opts.stateProvince) parts.push(opts.stateProvince);
  if (opts.country) parts.push(opts.country);

  if (parts.length === 0) {
    return { center: null, radiusKm: null, boundingBox: null };
  }

  const query = parts.join(', ');
  const provider = getGeocodingProvider();
  const center = await provider.geocode(query);

  const radiusKm = opts.radiusKm || null;

  let boundingBox = null;
  if (center && radiusKm) {
    boundingBox = boundingBoxFor(
      { lat: center.lat, lng: center.lng },
      radiusKm,
    );
  }

  return { center, radiusKm, boundingBox };
}

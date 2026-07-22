/**
 * Geocoding Provider Tests
 *
 * Tests the geocoding utilities (haversine, bounding box, within radius)
 * and provider interface contract. Uses mocked HTTP for provider tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Geocoding Utilities', () => {
  describe('haversineKm', () => {
    it('calculates distance between two coordinates', async () => {
      const { haversineKm } = await import('@/lib/v2/geocoding');

      // London to Manchester ≈ 262km
      const london = { lat: 51.5074, lng: -0.1278 };
      const manchester = { lat: 53.4808, lng: -2.2426 };

      const distance = haversineKm(london, manchester);
      expect(distance).toBeGreaterThan(250);
      expect(distance).toBeLessThan(275);
    });

    it('returns 0 for identical coordinates', async () => {
      const { haversineKm } = await import('@/lib/v2/geocoding');
      const point = { lat: 51.5074, lng: -0.1278 };
      expect(haversineKm(point, point)).toBe(0);
    });

    it('calculates short distances accurately', async () => {
      const { haversineKm } = await import('@/lib/v2/geocoding');

      // Two points in central London ≈ 1.5km apart
      const a = { lat: 51.5074, lng: -0.1278 }; // Charing Cross
      const b = { lat: 51.5194, lng: -0.1270 }; // King's Cross

      const distance = haversineKm(a, b);
      expect(distance).toBeGreaterThan(1.0);
      expect(distance).toBeLessThan(2.0);
    });
  });

  describe('withinRadius', () => {
    it('returns true for points within radius', async () => {
      const { withinRadius } = await import('@/lib/v2/geocoding');

      const center = { lat: 51.5074, lng: -0.1278 };
      const nearby = { lat: 51.5194, lng: -0.1270 };

      expect(withinRadius(nearby, center, 5)).toBe(true);
    });

    it('returns false for points outside radius', async () => {
      const { withinRadius } = await import('@/lib/v2/geocoding');

      const center = { lat: 51.5074, lng: -0.1278 };
      const far = { lat: 53.4808, lng: -2.2426 }; // Manchester

      expect(withinRadius(far, center, 50)).toBe(false);
    });

    it('handles edge case at exact radius', async () => {
      const { withinRadius } = await import('@/lib/v2/geocoding');

      // Two points ~50km apart (roughly)
      const center = { lat: 51.0, lng: 0.0 };
      // 0.44 degrees latitude ≈ 48.8km — within 50km
      const within = { lat: 51.44, lng: 0.0 };
      // 0.5 degrees latitude ≈ 55.5km — outside 50km
      const outside = { lat: 51.5, lng: 0.0 };

      expect(withinRadius(within, center, 50)).toBe(true);
      expect(withinRadius(outside, center, 50)).toBe(false);
    });
  });

  describe('boundingBoxFor', () => {
    it('produces a valid bounding box', async () => {
      const { boundingBoxFor } = await import('@/lib/v2/geocoding');

      const center = { lat: 51.5074, lng: -0.1278 };
      const box = boundingBoxFor(center, 50);

      expect(box.south).toBeLessThan(center.lat);
      expect(box.north).toBeGreaterThan(center.lat);
      expect(box.west).toBeLessThan(center.lng);
      expect(box.east).toBeGreaterThan(center.lng);

      // Box should be roughly 100km across (±50km)
      const latRange = box.north - box.south;
      const lngRange = box.east - box.west;

      // Latitude: 50km / 111km per degree ≈ 0.45 degrees each way
      expect(latRange).toBeCloseTo(0.9, 1);

      // Longitude varies with latitude (cos factor)
      // At London latitude, cos(51.5°) ≈ 0.622
      // 50km / (111 * 0.622) ≈ 0.725 degrees each way
      expect(lngRange).toBeGreaterThan(1.0);
      expect(lngRange).toBeLessThan(1.6);
    });

    it('produces larger boxes for larger radii', async () => {
      const { boundingBoxFor } = await import('@/lib/v2/geocoding');

      const center = { lat: 51.5074, lng: -0.1278 };
      const small = boundingBoxFor(center, 10);
      const large = boundingBoxFor(center, 100);

      expect(large.north - large.south).toBeGreaterThan(small.north - small.south);
      expect(large.east - large.west).toBeGreaterThan(small.east - small.west);
    });
  });

  describe('Nominatim Provider', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.resetAllMocks();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('parses Nominatim response correctly', async () => {
      globalThis.fetch = vi.fn(async (url: string | URL | Request) => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [
          {
            lat: '51.5074',
            lon: '-0.1278',
            display_name: 'London, Greater London, England, United Kingdom',
            type: 'city',
            class: 'place',
            boundingbox: ['51.3', '51.7', '-0.5', '0.3'],
          },
        ],
        text: async () => '',
        url: typeof url === 'string' ? url : '',
      }) as Response) as any;

      const { nominatimProvider } = await import('@/lib/v2/geocoding');

      const result = await nominatimProvider.geocode('London, UK');

      expect(result).not.toBeNull();
      expect(result!.lat).toBe(51.5074);
      expect(result!.lng).toBe(-0.1278);
      expect(result!.display).toContain('London');
      expect(result!.type).toBe('city');
      expect(result!.boundingBox).toBeDefined();
      expect(result!.boundingBox!.south).toBe(51.3);
      expect(result!.boundingBox!.north).toBe(51.7);
    });

    it('returns null for empty query', async () => {
      const { nominatimProvider } = await import('@/lib/v2/geocoding');
      const result = await nominatimProvider.geocode('');
      expect(result).toBeNull();
    });

    it('returns null when no results found', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [],
        text: async () => '',
        url: '',
      }) as Response) as any;

      const { nominatimProvider } = await import('@/lib/v2/geocoding');
      const result = await nominatimProvider.geocode('Nonexistent Place XYZ');
      expect(result).toBeNull();
    });

    it('handles API errors gracefully', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 503,
        headers: new Headers(),
        json: async () => ({}),
        text: async () => 'Service Unavailable',
        url: '',
      }) as Response) as any;

      const { nominatimProvider } = await import('@/lib/v2/geocoding');
      const result = await nominatimProvider.geocode('London');
      expect(result).toBeNull();
    });

    it('performs reverse geocoding', async () => {
      globalThis.fetch = vi.fn(async (url: string | URL | Request) => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          lat: '51.5074',
          lon: '-0.1278',
          display_name: 'London, Greater London, England, United Kingdom',
          type: 'city',
          class: 'place',
        }),
        text: async () => '',
        url: typeof url === 'string' ? url : '',
      }) as Response) as any;

      const { nominatimProvider } = await import('@/lib/v2/geocoding');

      const result = await nominatimProvider.reverseGeocode(51.5074, -0.1278);

      expect(result).not.toBeNull();
      expect(result!.lat).toBe(51.5074);
      expect(result!.display).toContain('London');
    });
  });

  describe('Provider Registry', () => {
    it('returns Nominatim by default', async () => {
      const { getGeocodingProvider } = await import('@/lib/v2/geocoding');
      const originalKey = process.env.GOOGLE_MAPS_API_KEY;
      delete process.env.GOOGLE_MAPS_API_KEY;

      const provider = getGeocodingProvider();
      expect(provider.name).toBe('nominatim');

      if (originalKey) process.env.GOOGLE_MAPS_API_KEY = originalKey;
    });

    it('returns Google Maps when API key is set', async () => {
      const { getGeocodingProvider } = await import('@/lib/v2/geocoding');
      const originalKey = process.env.GOOGLE_MAPS_API_KEY;
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      const provider = getGeocodingProvider();
      expect(provider.name).toBe('google-maps');

      if (originalKey) {
        process.env.GOOGLE_MAPS_API_KEY = originalKey;
      } else {
        delete process.env.GOOGLE_MAPS_API_KEY;
      }
    });
  });

  describe('geocodeStrategyLocation', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.resetAllMocks();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('builds query from location parts and geocodes', async () => {
      globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        expect(urlStr).toContain('nominatim');

        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => [
            {
              lat: '51.5074',
              lon: '-0.1278',
              display_name: 'London, Greater London, England, United Kingdom',
              type: 'city',
              class: 'place',
              boundingbox: ['51.3', '51.7', '-0.5', '0.3'],
            },
          ],
          text: async () => '',
          url: urlStr,
        } as Response;
      }) as any;

      const { geocodeStrategyLocation } = await import('@/lib/v2/geocoding');
      const originalKey = process.env.GOOGLE_MAPS_API_KEY;
      delete process.env.GOOGLE_MAPS_API_KEY;

      const result = await geocodeStrategyLocation({
        country: 'United Kingdom',
        city: 'London',
        radiusKm: 25,
      });

      expect(result.center).not.toBeNull();
      expect(result.center!.lat).toBe(51.5074);
      expect(result.radiusKm).toBe(25);
      expect(result.boundingBox).toBeDefined();
      expect(result.boundingBox!.south).toBeLessThan(51.5074);
      expect(result.boundingBox!.north).toBeGreaterThan(51.5074);

      if (originalKey) process.env.GOOGLE_MAPS_API_KEY = originalKey;
    });

    it('returns null center when no location provided', async () => {
      const { geocodeStrategyLocation } = await import('@/lib/v2/geocoding');

      const result = await geocodeStrategyLocation({
        country: '',
      });

      expect(result.center).toBeNull();
      expect(result.radiusKm).toBeNull();
      expect(result.boundingBox).toBeNull();
    });
  });
});


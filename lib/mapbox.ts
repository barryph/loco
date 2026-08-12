/**
 * Isolated Mapbox integration seam.
 *
 * The rest of the app should only depend on the types/functions in this
 * module. If the Mapbox provider ever changes, this is the only file to touch.
 */

export type MapboxPlace = {
  name: string;
  address: string | null;
  placeId: string;
  latitude: number;
  longitude: number;
};

export function getMapboxToken(): string {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    throw new Error(
      'Mapbox token is missing. Set EXPO_PUBLIC_MAPBOX_TOKEN in your .env file.',
    );
  }
  return token;
}

type SearchBoxFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    full_address?: string;
    place_formatted?: string;
    address?: string;
    mapbox_id?: string;
  };
};

type SearchBoxResponse = {
  features?: SearchBoxFeature[];
};

const SEARCH_URL = 'https://api.mapbox.com/search/searchbox/v1';

async function request(path: string, params: Record<string, string>): Promise<SearchBoxResponse> {
  const url = new URL(`${SEARCH_URL}${path}`);
  url.searchParams.set('access_token', getMapboxToken());
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Mapbox request failed (${response.status}): ${response.statusText}`);
  }
  return (await response.json()) as SearchBoxResponse;
}

function featureToPlace(feature: SearchBoxFeature): MapboxPlace | null {
  const coordinates = feature.geometry?.coordinates;
  const properties = feature.properties;
  if (!coordinates || !properties?.mapbox_id || !properties.name) {
    return null;
  }
  const address =
    properties.full_address || properties.place_formatted || properties.address || null;
  return {
    name: properties.name,
    address,
    placeId: properties.mapbox_id,
    longitude: coordinates[0],
    latitude: coordinates[1],
  };
}

export async function searchPlaces(
  query: string,
  options?: { proximity?: { latitude: number; longitude: number }; limit?: number },
): Promise<MapboxPlace[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  const params: Record<string, string> = {
    q: trimmed,
    language: 'en',
    limit: String(options?.limit ?? 10),
    auto_complete: 'true',
  };
  if (options?.proximity) {
    params.proximity = `${options.proximity.longitude},${options.proximity.latitude}`;
  }

  const data = await request('/forward', params);
  const places = (data.features ?? [])
    .map(featureToPlace)
    .filter((place): place is MapboxPlace => place !== null);
  return places;
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<MapboxPlace | null> {
  const data = await request('/reverse', {
    longitude: String(longitude),
    latitude: String(latitude),
    language: 'en',
    limit: '1',
  });
  const feature = data.features?.[0];
  const place = feature ? featureToPlace(feature) : null;
  if (!place) {
    return null;
  }
  return place;
}

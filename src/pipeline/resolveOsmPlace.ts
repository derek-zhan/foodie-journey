import type { ResolvedPlace } from "../types";

const RADIUS_METERS = 75; // same radius as the Google Places lookup

// OpenStreetMap amenity tags -> the app's existing food-category vocabulary
// (see FOOD_PLACE_TYPES in resolvePlace.ts). OSM has no bakery/bar-specific
// takeaway split the way Google's types do, so this is a rough mapping,
// good enough for filtering "is this food" and tagging what kind.
const OSM_AMENITY_TO_TYPE: Record<string, string> = {
  restaurant: "restaurant",
  cafe: "cafe",
  bar: "bar",
  pub: "bar",
  fast_food: "meal_takeaway",
};

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/**
 * Free, keyless fallback for resolvePlace() - OpenStreetMap's Overpass API,
 * queried for food-tagged nodes/ways within RADIUS_METERS of a coordinate.
 * No API key, no billing, but noticeably patchier coverage/metadata than
 * Google Places outside dense urban areas - see resolvePlace.ts for when
 * this gets used.
 */
export async function resolveOsmPlace(
  latitude: number,
  longitude: number
): Promise<ResolvedPlace | null> {
  const amenities = Object.keys(OSM_AMENITY_TO_TYPE).join("|");
  const query = `
    [out:json][timeout:10];
    (
      node(around:${RADIUS_METERS},${latitude},${longitude})["amenity"~"^(${amenities})$"];
      way(around:${RADIUS_METERS},${latitude},${longitude})["amenity"~"^(${amenities})$"];
    );
    out center tags 10;
  `;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass API error: ${response.status}`);
  }

  // The public Overpass instance sometimes returns 200 - with a
  // Content-Type header that still claims application/json - but an HTML
  // "server busy" page as the body when overloaded, so the header can't be
  // trusted either. Parse defensively and fail with a clear message
  // instead of a raw JSON-parse SyntaxError.
  const raw = await response.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      "Overpass API returned a non-JSON response (the public server may be overloaded - try again)"
    );
  }
  const elements: OverpassElement[] = data.elements ?? [];
  if (elements.length === 0) return null;

  // Overpass doesn't sort by distance - pick the nearest match ourselves.
  const withDistance = elements
    .map((el) => {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (lat == null || lon == null) return null;
      return { el, lat, lon, distance: haversineMeters(latitude, longitude, lat, lon) };
    })
    .filter((r): r is { el: OverpassElement; lat: number; lon: number; distance: number } => r != null)
    .sort((a, b) => a.distance - b.distance);

  const nearest = withDistance[0];
  if (!nearest) return null;

  const amenity = nearest.el.tags?.amenity;
  const type = amenity ? OSM_AMENITY_TO_TYPE[amenity] : undefined;
  const address = [
    nearest.el.tags?.["addr:housenumber"],
    nearest.el.tags?.["addr:street"],
  ]
    .filter(Boolean)
    .join(" ");

  return {
    // Visit ids are `${placeId}-${firstPhotoTimestamp}` (see
    // clusterVisits.ts) and get split back apart on "-", so this can't
    // contain a hyphen the way an OSM "type/id" pair naturally would.
    placeId: `osm_${nearest.el.type}_${nearest.el.id}`,
    name: nearest.el.tags?.name ?? "Unknown place",
    address,
    latitude: nearest.lat,
    longitude: nearest.lon,
    types: type ? [type] : [],
  };
}

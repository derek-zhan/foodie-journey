import type { ResolvedPlace } from "../types";
import { haversineMeters } from "./geo";

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

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassCandidate {
  el: OverpassElement;
  lat: number;
  lon: number;
  distance: number;
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
  const withDistance = await fetchOsmCandidates(latitude, longitude);
  const nearest = withDistance[0];
  if (!nearest) return null;
  return toOsmResolvedPlace(nearest);
}

/**
 * Up to 10 nearby food places, nearest first - the OSM-fallback data
 * behind resolveOsmPlace() plus the alternatives RestaurantPicker.tsx
 * offers when the top pick is wrong and no Google key is configured.
 */
export async function searchNearbyOsmPlaces(
  latitude: number,
  longitude: number
): Promise<ResolvedPlace[]> {
  const withDistance = await fetchOsmCandidates(latitude, longitude);
  return withDistance.map(toOsmResolvedPlace);
}

/**
 * OSM-fallback for RestaurantPicker.tsx's "Other" path - OpenStreetMap's
 * Nominatim geocoder (free, keyless), searched by name and biased toward
 * the visit's coordinates via a viewbox. No amenity/food-type filter -
 * this is an explicit user-typed name, trust the query.
 */
export async function searchOsmPlacesByText(
  query: string,
  latitude: number,
  longitude: number
): Promise<ResolvedPlace[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  // Biases (doesn't restrict) results toward the visit's area - roughly a
  // 5km box, generous enough that a real nearby match isn't excluded.
  const delta = 0.05;
  url.searchParams.set(
    "viewbox",
    `${longitude - delta},${latitude + delta},${longitude + delta},${latitude - delta}`
  );

  const response = await fetch(url.toString(), {
    headers: {
      // Required by Nominatim's usage policy for identifying non-browser
      // clients - same convention as the Overpass call below.
      "User-Agent": "foodie-journey (personal restaurant diary app)",
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim API error: ${response.status}`);
  }

  const raw = await response.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      "Nominatim API returned a non-JSON response (the public server may be overloaded - try again)"
    );
  }
  const results: any[] = Array.isArray(data) ? data : [];

  return results.map((r) => ({
    // Visit ids are `${placeId}-${firstPhotoTimestamp}` (see
    // clusterVisits.ts) and get split back apart on "-", so this can't
    // contain a hyphen the way an OSM "type/id" pair naturally would.
    placeId: `osm_${r.osm_type}_${r.osm_id}`,
    name: r.name || r.display_name?.split(",")[0] || "Unknown place",
    address: r.display_name ?? "",
    latitude: parseFloat(r.lat),
    longitude: parseFloat(r.lon),
    types: [],
  }));
}

async function fetchOsmCandidates(
  latitude: number,
  longitude: number
): Promise<OverpassCandidate[]> {
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
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // Without an explicit Accept, Apache's content negotiation on the
      // public Overpass server 406s the request outright - found via a
      // real failing fetch (Node's default fetch sends no Accept header),
      // not a hypothetical. User-Agent is also part of Overpass's own
      // usage policy for identifying non-browser clients.
      Accept: "*/*",
      "User-Agent": "foodie-journey (personal restaurant diary app)",
    },
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
  if (elements.length === 0) return [];

  // Overpass doesn't sort by distance - pick the nearest match ourselves.
  return elements
    .map((el) => {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (lat == null || lon == null) return null;
      return { el, lat, lon, distance: haversineMeters(latitude, longitude, lat, lon) };
    })
    .filter((r): r is OverpassCandidate => r != null)
    .sort((a, b) => a.distance - b.distance);
}

function toOsmResolvedPlace(entry: OverpassCandidate): ResolvedPlace {
  const amenity = entry.el.tags?.amenity;
  const type = amenity ? OSM_AMENITY_TO_TYPE[amenity] : undefined;
  const address = [
    entry.el.tags?.["addr:housenumber"],
    entry.el.tags?.["addr:street"],
  ]
    .filter(Boolean)
    .join(" ");

  return {
    // Visit ids are `${placeId}-${firstPhotoTimestamp}` (see
    // clusterVisits.ts) and get split back apart on "-", so this can't
    // contain a hyphen the way an OSM "type/id" pair naturally would.
    placeId: `osm_${entry.el.type}_${entry.el.id}`,
    name: entry.el.tags?.name ?? "Unknown place",
    address,
    latitude: entry.lat,
    longitude: entry.lon,
    types: type ? [type] : [],
  };
}

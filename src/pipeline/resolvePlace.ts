import type { ResolvedPlace } from "../types";
import { haversineMeters } from "./geo";
import {
  resolveOsmPlace,
  searchNearbyOsmPlaces,
  searchOsmPlacesByText,
} from "./resolveOsmPlace";

// TODO: move to a proper env/config module before shipping — never commit
// a real key to source control (see .env.example + .gitignore).
const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ?? "";

const FOOD_PLACE_TYPES = new Set([
  "restaurant",
  "cafe",
  "bar",
  "bakery",
  "meal_takeaway",
  "meal_delivery",
]);

// Candidates within this much of the nearest one are treated as "same
// distance" (GPS/geocoding noise) and broken by rating count instead of
// raw ordering.
const TIE_BREAK_METERS = 20;

// Shared by searchNearby and searchText requests below.
const PLACE_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.rating,places.userRatingCount";

// Extends ResolvedPlace with Google-only display metadata used by the
// restaurant-correction picker (RestaurantPicker.tsx) to help the user
// tell nearby candidates apart. Not persisted - Visit/ResolvedPlace don't
// carry these fields, and the OSM fallback has no equivalent data.
export interface PlaceCandidate extends ResolvedPlace {
  rating?: number;
  userRatingCount?: number;
}

/**
 * Stage 3: Places API lookup
 *
 * Given a coordinate, finds the nearest place and returns it only if it's a
 * food/restaurant category. Returns null if nothing food-related is nearby
 * (e.g. the photo was taken at home, or in a park).
 *
 * Prefers Google Places; falls back to OpenStreetMap/Overpass (free, no
 * key) when no Google key is configured, or when the Google call itself
 * fails - proof-of-concept simplicity over a "which provider" setting.
 */
export async function resolvePlace(
  latitude: number,
  longitude: number
): Promise<ResolvedPlace | null> {
  if (GOOGLE_PLACES_API_KEY) {
    try {
      return await resolveGooglePlace(latitude, longitude);
    } catch (err) {
      console.warn(
        "Google Places lookup failed, falling back to OpenStreetMap:",
        err
      );
    }
  }

  return resolveOsmPlace(latitude, longitude);
}

/**
 * Up to 5 nearby food places, nearest first - the data behind resolvePlace()
 * plus the alternatives RestaurantPicker.tsx offers when the top pick is
 * wrong. Same provider preference/fallback as resolvePlace().
 */
export async function searchNearbyPlaces(
  latitude: number,
  longitude: number
): Promise<PlaceCandidate[]> {
  if (GOOGLE_PLACES_API_KEY) {
    try {
      const withDistance = await fetchNearbyCandidates(latitude, longitude);
      return withDistance.map((r) => toResolvedPlace(r.candidate));
    } catch (err) {
      console.warn(
        "Google Places nearby search failed, falling back to OpenStreetMap:",
        err
      );
    }
  }

  return searchNearbyOsmPlaces(latitude, longitude);
}

/**
 * Explicit name search for RestaurantPicker.tsx's "Other" path - the user
 * typed a specific restaurant name, so this searches Places by text rather
 * than by proximity, biased toward (not restricted to) the visit's
 * coordinates. Same provider preference/fallback as resolvePlace().
 */
export async function searchPlacesByText(
  query: string,
  latitude: number,
  longitude: number
): Promise<PlaceCandidate[]> {
  if (GOOGLE_PLACES_API_KEY) {
    try {
      return await searchGoogleText(query, latitude, longitude);
    } catch (err) {
      console.warn(
        "Google Places text search failed, falling back to OpenStreetMap:",
        err
      );
    }
  }

  return searchOsmPlacesByText(query, latitude, longitude);
}

async function fetchNearbyCandidates(
  latitude: number,
  longitude: number
): Promise<{ candidate: any; distance: number }[]> {
  const url = new URL(
    "https://places.googleapis.com/v1/places:searchNearby"
  );

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": PLACE_FIELD_MASK,
    },
    body: JSON.stringify({
      maxResultCount: 5,
      locationRestriction: {
        circle: {
          center: { latitude, longitude },
          radius: 75.0, // meters — accounts for typical photo GPS drift
        },
      },
      includedTypes: Array.from(FOOD_PLACE_TYPES),
      // Without this, searchNearby defaults to ranking by POPULARITY, not
      // distance — a more prominent restaurant within the radius can then
      // outrank the one actually closest to the photo's coordinate.
      rankPreference: "DISTANCE",
    }),
  });

  if (!response.ok) {
    throw new Error(`Places API error: ${response.status}`);
  }

  const data = await response.json();
  const places: any[] = data.places ?? [];

  // rankPreference above should already order these nearest-first, but
  // sort explicitly too - cheap, and doesn't rely on the API always
  // honoring the request (same reasoning resolveOsmPlace.ts applies to
  // Overpass's unordered results).
  return places
    .map((c) => {
      const lat = c.location?.latitude;
      const lon = c.location?.longitude;
      if (lat == null || lon == null) return null;
      return { candidate: c, distance: haversineMeters(latitude, longitude, lat, lon) };
    })
    .filter((r): r is { candidate: any; distance: number } => r != null)
    .sort((a, b) => a.distance - b.distance);
}

async function resolveGooglePlace(
  latitude: number,
  longitude: number
): Promise<ResolvedPlace | null> {
  const withDistance = await fetchNearbyCandidates(latitude, longitude);
  if (withDistance.length === 0) return null;

  // Two candidates within TIE_BREAK_METERS of the nearest one are
  // basically equidistant given photo GPS drift - prefer the one with
  // more ratings, a simple proxy for "real, well-established, correctly
  // geocoded place" rather than trusting raw ordering.
  const nearestDistance = withDistance[0].distance;
  const tied = withDistance
    .filter((r) => r.distance - nearestDistance <= TIE_BREAK_METERS)
    .sort(
      (a, b) => (b.candidate.userRatingCount ?? 0) - (a.candidate.userRatingCount ?? 0)
    );

  return toResolvedPlace(tied[0].candidate);
}

async function searchGoogleText(
  query: string,
  latitude: number,
  longitude: number
): Promise<PlaceCandidate[]> {
  const response = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": PLACE_FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query,
        locationBias: {
          circle: {
            center: { latitude, longitude },
            radius: 5000.0, // meters — bias, not a hard restriction
          },
        },
        maxResultCount: 5,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Places API error: ${response.status}`);
  }

  const data = await response.json();
  const places: any[] = data.places ?? [];
  return places.map(toResolvedPlace);
}

function toResolvedPlace(candidate: any): PlaceCandidate {
  return {
    placeId: candidate.id,
    name: candidate.displayName?.text ?? "Unknown place",
    address: candidate.formattedAddress ?? "",
    latitude: candidate.location?.latitude ?? 0,
    longitude: candidate.location?.longitude ?? 0,
    types: (candidate.types ?? []).filter((t: string) =>
      FOOD_PLACE_TYPES.has(t)
    ),
    rating: candidate.rating,
    userRatingCount: candidate.userRatingCount,
  };
}

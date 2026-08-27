import type { ResolvedPlace } from "../types";

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

/**
 * Stage 3: Places API lookup
 *
 * Given a coordinate, finds the nearest place and returns it only if it's a
 * food/restaurant category. Returns null if nothing food-related is nearby
 * (e.g. the photo was taken at home, or in a park).
 */
export async function resolvePlace(
  latitude: number,
  longitude: number
): Promise<ResolvedPlace | null> {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error("Missing EXPO_PUBLIC_GOOGLE_PLACES_API_KEY");
  }

  const url = new URL(
    "https://places.googleapis.com/v1/places:searchNearby"
  );

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.types",
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
    }),
  });

  if (!response.ok) {
    throw new Error(`Places API error: ${response.status}`);
  }

  const data = await response.json();
  const candidate = data.places?.[0];
  if (!candidate) return null;

  return {
    placeId: candidate.id,
    name: candidate.displayName?.text ?? "Unknown place",
    address: candidate.formattedAddress ?? "",
    latitude: candidate.location?.latitude ?? latitude,
    longitude: candidate.location?.longitude ?? longitude,
    types: (candidate.types ?? []).filter((t: string) =>
      FOOD_PLACE_TYPES.has(t)
    ),
  };
}

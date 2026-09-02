import type { ResolvedPlace } from "../types";

// Hand-off links for the "generate a review, then post it yourself"
// workflow (see README/CLAUDE.md - none of these platforms expose a public
// write API for posting reviews, so this just gets the user to the right
// page instead of drafting+posting automatically).
//
// Google's placeId is real (Places API "id") and gets a direct place page.
// The OSM fallback (resolvePlace.ts) invents `osm_<type>_<id>` placeIds that
// mean nothing to Google/Yelp/OpenTable, so those - and Yelp/OpenTable in
// all cases, since this app never resolves against either - fall back to a
// name+address search query instead of a direct listing.
function isGooglePlaceId(placeId: string): boolean {
  return !placeId.startsWith("osm_");
}

export interface ReviewLinks {
  google: string;
  yelp: string;
  opentable: string;
}

export function buildReviewLinks(place: ResolvedPlace): ReviewLinks {
  const query = encodeURIComponent(`${place.name} ${place.address}`.trim());

  return {
    google: isGooglePlaceId(place.placeId)
      ? `https://www.google.com/maps/place/?q=place_id:${place.placeId}`
      : `https://www.google.com/maps/search/?api=1&query=${query}`,
    yelp: `https://www.yelp.com/search?find_desc=${encodeURIComponent(
      place.name
    )}&find_loc=${encodeURIComponent(place.address)}`,
    opentable: `https://www.opentable.com/s?term=${query}`,
  };
}

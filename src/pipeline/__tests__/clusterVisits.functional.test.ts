import { describe, expect, it } from "@jest/globals";
import { clusterVisits } from "../clusterVisits";
import type { PhotoAsset } from "../../types";

/**
 * Live functional test: mocks a photo's EXIF output (a PhotoAsset with a
 * real GPS coordinate + timestamp - what extractPhotoMetadata.ts would
 * hand off) and runs it through the real clusterVisits -> resolvePlace
 * pipeline, unmocked.
 *
 * This is deliberately NOT hermetic - it makes a real network call to
 * whichever place-resolution backend is active (see resolvePlace.ts). Jest
 * doesn't load .env, so EXPO_PUBLIC_GOOGLE_PLACES_API_KEY is unset here
 * regardless of your local .env, which means this always exercises the
 * OpenStreetMap/Overpass fallback (resolveOsmPlace.ts) - proving that path
 * actually resolves a mocked EXIF coordinate to a real nearby restaurant,
 * not just that it compiles.
 *
 * The coordinate below (1528 Broadway, NYC) was verified live during
 * development to have a food place within a few meters - if this ever
 * starts failing, check whether that's still true (the venue could close
 * or OSM's tags could change) before assuming a code regression.
 */
describe("clusterVisits - functional (live place lookup)", () => {
  it("resolves a mocked EXIF photo near Times Square to a nearby restaurant", async () => {
    const mockPhoto: PhotoAsset = {
      id: "mock-photo-1",
      uri: "file:///mock/IMG_0001.jpg",
      timestamp: Date.now(),
      latitude: 40.758,
      longitude: -73.9855,
    };

    const visits = await clusterVisits([mockPhoto]);

    expect(visits).toHaveLength(1);
    const [visit] = visits;

    expect(visit.photoIds).toEqual([mockPhoto.id]);
    expect(visit.place.name).toBeTruthy();
    expect(visit.place.name).not.toBe("Unknown place");
    // OSM place ids look like "osm_node_<id>" / "osm_way_<id>" (see
    // resolveOsmPlace.ts) - confirms the OSM fallback path actually ran,
    // not just that *some* place came back.
    expect(visit.place.placeId).toMatch(/^osm_(node|way)_\d+$/);
    expect(visit.place.latitude).toBeCloseTo(mockPhoto.latitude as number, 2);
    expect(visit.place.longitude).toBeCloseTo(mockPhoto.longitude as number, 2);
  }, 20000); // real network call to a public, occasionally-slow API
});

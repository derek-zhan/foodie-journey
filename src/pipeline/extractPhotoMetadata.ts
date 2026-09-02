import { Platform } from "react-native";
import type { PhotoAsset } from "../types";

// Web has no device photo library at all (see the comment on
// extractPhotoMetadata below) - so instead of always coming back empty in
// dev, fetch from scripts/webDev.js's dev-only proxy route, which live-reads
// the gitignored .test/ folder (same one the functional tests use) via
// exifr on every request. Real GPS, nothing hardcoded; each photo's
// *timestamp* is faked to "now" (jittered per photo) since .test/ holds
// real past outings, not photos from today - only the clock needs faking
// for Review's isToday() filter to pick them up, the location data is real.
//
// Gated on __DEV__ (not just Platform.OS === "web") so this is structurally
// unreachable in a production/release web build, not just unreachable in
// practice - Metro/Expo set __DEV__ to false at build time for those, the
// same global React itself uses to strip dev-only warnings, so there's no
// env var or runtime flag that could accidentally leave this enabled once
// deployed. A production build hitting this code path is a build
// configuration bug, not a possible runtime state.
const isLocalWebDev = Platform.OS === "web" && __DEV__;

async function fetchTestPhotosFromDevProxy(since: Date): Promise<PhotoAsset[]> {
  const res = await fetch("/__test-photos");
  if (!res.ok) return [];
  const photos: { id: string; latitude: number; longitude: number }[] =
    await res.json();

  // Anchored to the caller's `since` (always already in the past - it's a
  // lookback window start) rather than Date.now() at call time. Visit ids
  // are derived from a cluster's first photo timestamp (see visitStore.ts),
  // so a timestamp that drifts between calls (e.g. a double-invoked effect
  // in dev, or a second manual Refresh) would mint a *different* id for
  // what's really the same visit and duplicate the row instead of
  // upsertScannedVisit merging over it. Anchoring to `since` is stable
  // across repeated calls with the same window and can't land in the
  // future the way a fixed clock time (e.g. "noon today") could.
  const anchor = since.getTime();
  return photos.map((p, i) => ({
    id: p.id,
    uri: `/__test-photo-image/${encodeURIComponent(p.id)}`,
    timestamp: anchor + i * 20 * 60 * 1000,
    latitude: p.latitude,
    longitude: p.longitude,
  }));
}

// expo-media-library's default entry point ("expo-media-library") is the
// new class-based Asset/Album/Query API as of SDK 57 - the old functional
// API (requestPermissionsAsync/getAssetsAsync/getAssetInfoAsync, which is
// what this file uses) still exists but is re-exported from there ONLY as
// deprecation shims that unconditionally throw at runtime ("Method X
// imported from expo-media-library is deprecated... This method will throw
// in runtime" - see node_modules/expo-media-library/build/
// legacyWarnings.js). The real, working implementation of that same API
// lives at the "/legacy" subpath below - importing from the bare package
// name instead makes every call in this file throw on native, not just on
// web. (The import specifier has to stay a literal string, not a shared
// constant - Metro needs it statically analyzable to bundle the module.)

/**
 * Stage 1-2: Photo library -> EXIF extraction
 *
 * Reads geotagged photos from the device library within a date range and
 * normalizes them into PhotoAsset records (GPS + timestamp only — no image
 * data is copied out at this stage).
 *
 * expo-media-library is imported dynamically (not at module scope) because
 * simply importing it throws on web ("Cannot find native module") - there's
 * no device photo library to read there. Deferring the import means that
 * failure only happens if this function is actually called, inside the
 * caller's existing try/catch, instead of crashing the whole module graph
 * (and blanking the page) the moment JourneyScreen.tsx is loaded.
 */
export async function extractPhotoMetadata(
  since: Date,
  until: Date = new Date()
): Promise<PhotoAsset[]> {
  if (isLocalWebDev) {
    const photos = await fetchTestPhotosFromDevProxy(since);
    return photos.filter((p) => p.timestamp <= until.getTime());
  }

  const MediaLibrary = await import("expo-media-library/legacy");
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Photo library permission not granted");
  }

  const results: PhotoAsset[] = [];
  let after: string | undefined;

  // Paginate through the library in the given window
  while (true) {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: "photo",
      createdAfter: since.getTime(),
      createdBefore: until.getTime(),
      first: 100,
      after,
    });

    for (const asset of page.assets) {
      const info = await MediaLibrary.getAssetInfoAsync(asset);
      const location = info.location; // { latitude, longitude } | undefined

      if (location) {
        results.push({
          id: asset.id,
          uri: asset.uri,
          timestamp: asset.creationTime,
          latitude: location.latitude,
          longitude: location.longitude,
        });
      }
    }

    if (!page.hasNextPage) break;
    after = page.endCursor;
  }

  results.sort((a, b) => a.timestamp - b.timestamp);
  return results;
}

/**
 * Resolves a stored photoId (see Visit.photoIds - visitStore only ever
 * keeps the device asset id, never a copy of the image itself) back into a
 * displayable URI, for showing a thumbnail in the journey. Returns null
 * instead of throwing when the asset can't be resolved (permission
 * revoked since the scan, or the photo was deleted from the device) - a
 * missing thumbnail shouldn't take down the whole visit list.
 */
export async function getAssetThumbnailUri(
  photoId: string
): Promise<string | null> {
  // In local web dev, extractPhotoMetadata's dev-proxy path already sets
  // `id` to the .test/ filename - no lookup needed, just reconstruct the
  // same URL. Same __DEV__ gating as above; unreachable in production.
  if (isLocalWebDev) {
    return `/__test-photo-image/${encodeURIComponent(photoId)}`;
  }
  try {
    const MediaLibrary = await import("expo-media-library/legacy");
    const info = await MediaLibrary.getAssetInfoAsync(photoId);
    return info.localUri ?? info.uri ?? null;
  } catch {
    return null;
  }
}

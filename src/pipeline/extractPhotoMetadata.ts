import type { PhotoAsset } from "../types";

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
 * (and blanking the page) the moment DiaryScreen.tsx is loaded.
 */
export async function extractPhotoMetadata(
  since: Date,
  until: Date = new Date()
): Promise<PhotoAsset[]> {
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
 * displayable URI, for showing a thumbnail in the diary. Returns null
 * instead of throwing when the asset can't be resolved (permission
 * revoked since the scan, or the photo was deleted from the device) - a
 * missing thumbnail shouldn't take down the whole visit list.
 */
export async function getAssetThumbnailUri(
  photoId: string
): Promise<string | null> {
  try {
    const MediaLibrary = await import("expo-media-library/legacy");
    const info = await MediaLibrary.getAssetInfoAsync(photoId);
    return info.localUri ?? info.uri ?? null;
  } catch {
    return null;
  }
}

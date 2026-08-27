import * as MediaLibrary from "expo-media-library";
import type { PhotoAsset } from "../types";

/**
 * Stage 1-2: Photo library -> EXIF extraction
 *
 * Reads geotagged photos from the device library within a date range and
 * normalizes them into PhotoAsset records (GPS + timestamp only — no image
 * data is copied out at this stage).
 */
export async function extractPhotoMetadata(
  since: Date,
  until: Date = new Date()
): Promise<PhotoAsset[]> {
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

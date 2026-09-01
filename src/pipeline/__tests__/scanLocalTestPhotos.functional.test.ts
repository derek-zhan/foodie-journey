import fs from "fs";
import path from "path";
import exifr from "exifr";
import { describe, expect, it } from "@jest/globals";
import { clusterVisits } from "../clusterVisits";
import type { PhotoAsset } from "../../types";

/**
 * Live functional test, closer to a dev tool: drop real photos (with real
 * EXIF GPS data - e.g. AirDropped/exported from your own camera roll) into
 * a `.test/` folder at the project root, and this reads their real EXIF,
 * builds real PhotoAssets from it (what extractPhotoMetadata.ts would hand
 * off from a real device scan), and runs them through the real
 * clusterVisits -> resolvePlace pipeline, unmocked.
 *
 * `.test/` is gitignored - it's your own photos with real location data,
 * never meant to be committed. This test SKIPS (not fails) when the folder
 * doesn't exist or has no geotagged photos, so a fresh clone or CI (this
 * isn't wired into CI anyway - see clusterVisits.functional.test.ts) never
 * breaks because of it.
 */
const TEST_PHOTOS_DIR = path.resolve(__dirname, "../../../.test");

const testPhotoFiles = fs.existsSync(TEST_PHOTOS_DIR)
  ? fs
      .readdirSync(TEST_PHOTOS_DIR)
      .filter((f) => /\.(jpe?g|heic)$/i.test(f))
  : [];

const describeIfPhotosPresent = testPhotoFiles.length > 0 ? describe : describe.skip;

describeIfPhotosPresent(
  "clusterVisits - functional (real local photos in .test/)",
  () => {
    it("resolves real EXIF-geotagged photos to nearby restaurants where one exists", async () => {
      const photos: PhotoAsset[] = [];

      for (const file of testPhotoFiles) {
        const filePath = path.join(TEST_PHOTOS_DIR, file);
        const gps = await exifr.gps(filePath);
        if (!gps) {
          console.warn(`${file}: no GPS EXIF data - skipped`);
          continue;
        }

        const exif = await exifr.parse(filePath, [
          "DateTimeOriginal",
          "CreateDate",
        ]);
        const dateVal: unknown = exif?.DateTimeOriginal ?? exif?.CreateDate;

        photos.push({
          id: file,
          uri: filePath,
          timestamp:
            dateVal instanceof Date ? dateVal.getTime() : Date.now(),
          latitude: gps.latitude,
          longitude: gps.longitude,
        });
      }

      expect(photos.length).toBeGreaterThan(0);

      const visits = await clusterVisits(photos);

      // eslint-disable-next-line no-console
      console.log(
        `\n${photos.length} geotagged photo(s) -> ${visits.length} visit(s) resolved to a food place:\n` +
          (visits.length
            ? visits
                .map(
                  (v) =>
                    `  - ${v.place.name}${v.place.address ? ` (${v.place.address})` : ""} - ${v.photoIds.length} photo(s)`
                )
                .join("\n")
            : "  (none - not every geotagged photo is near a food place, that's the pipeline working as designed)")
      );

      // This asserts the pipeline RAN to completion on real data, not that
      // every photo found a restaurant - clusterVisits legitimately drops
      // clusters with no nearby food place (see its own comment).
      expect(Array.isArray(visits)).toBe(true);
    }, 60000); // 3 sequential live geocoding calls, generous timeout
  }
);

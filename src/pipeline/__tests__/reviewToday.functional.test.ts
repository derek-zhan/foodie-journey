import fs from "fs";
import path from "path";
import exifr from "exifr";
import { describe, expect, it } from "@jest/globals";
import { clusterVisits } from "../clusterVisits";
import { journalVisit } from "../journalVisit";
import { isToday } from "../todayWindow";
import type { PhotoAsset } from "../../types";

/**
 * Live functional test for "today's restaurants" detection + voice
 * journaling (the behavior the Journey screen's scan covers for today's
 * visits), same spirit as scanLocalTestPhotos.functional.test.ts but
 * exercising that path end to end: it reads the same .test/ photos live
 * (real EXIF GPS, via exifr - nothing hardcoded), retimes each one to "now"
 * (photos in .test/ are real past outings, not literally from today - only
 * the clock is faked, the location data is real) so they pass isToday(),
 * runs them through the real clusterVisits -> resolvePlace pipeline, and -
 * if EXPO_PUBLIC_ANTHROPIC_API_KEY is a real key - journals the first
 * resolved visit with a sample transcript through the real journalVisit()
 * Claude call, proving the full dictate -> Claude structuring ->
 * tags/notes/rating loop works.
 *
 * Same conventions as scanLocalTestPhotos: skips (doesn't fail) when
 * .test/ is empty/absent, not wired into CI (live network + live LLM call).
 */
const TEST_PHOTOS_DIR = path.resolve(__dirname, "../../../.test");

const testPhotoFiles = fs.existsSync(TEST_PHOTOS_DIR)
  ? fs.readdirSync(TEST_PHOTOS_DIR).filter((f) => /\.(jpe?g|heic)$/i.test(f))
  : [];

const describeIfPhotosPresent =
  testPhotoFiles.length > 0 ? describe : describe.skip;

describeIfPhotosPresent(
  "Today's visits - functional (real local photos in .test/, retimed to today)",
  () => {
    it("detects today's visits from real GPS data and journals one via Claude", async () => {
      const photos: PhotoAsset[] = [];
      const now = Date.now();

      for (const [index, file] of testPhotoFiles.entries()) {
        const filePath = path.join(TEST_PHOTOS_DIR, file);
        const gps = await exifr.gps(filePath);
        if (!gps) {
          console.warn(`${file}: no GPS EXIF data - skipped`);
          continue;
        }

        // Real GPS, faked clock: spread photos across the last couple of
        // hours (newest last, like a real outing) so they land inside
        // today's window regardless of what time this test happens to run.
        photos.push({
          id: file,
          uri: filePath,
          timestamp: now - (testPhotoFiles.length - index) * 20 * 60 * 1000,
          latitude: gps.latitude,
          longitude: gps.longitude,
        });
      }

      expect(photos.length).toBeGreaterThan(0);
      expect(photos.every((p) => isToday(p.timestamp))).toBe(true);

      const visits = await clusterVisits(photos);

      console.log(
        `\n${photos.length} geotagged photo(s) (retimed to today) -> ${visits.length} visit(s) resolved to a food place:\n` +
          (visits.length
            ? visits
                .map(
                  (v) =>
                    `  - ${v.place.name}${v.place.address ? ` (${v.place.address})` : ""} - ${v.photoIds.length} photo(s)`
                )
                .join("\n")
            : "  (none - not every geotagged photo is near a food place, that's the pipeline working as designed)")
      );

      expect(Array.isArray(visits)).toBe(true);

      const hasRealAnthropicKey =
        !!process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY &&
        process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY !== "your_key_here";

      if (visits.length > 0 && hasRealAnthropicKey) {
        const [visit] = visits;
        const entry = await journalVisit(
          "It was pretty good, a bit noisy but the food came out fast. Really liked the flavors.",
          visit.place.name
        );
        console.log(
          `\nJournaled "${visit.place.name}" via Claude:\n` +
            `  notes: ${entry.notes}\n` +
            `  tags: ${entry.tags.join(", ")}\n` +
            `  rating: ${entry.rating ?? "(none given)"}`
        );
        expect(entry.notes.length).toBeGreaterThan(0);
        expect(entry.tags.length).toBeGreaterThan(0);
      } else if (visits.length > 0) {
        console.log(
          "\nSkipping the journalVisit() Claude call - EXPO_PUBLIC_ANTHROPIC_API_KEY isn't set to a real key."
        );
      }
    }, 60000); // sequential live geocoding + optional live LLM call
  }
);

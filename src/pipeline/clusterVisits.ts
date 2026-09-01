import type { PhotoAsset, ResolvedPlace, Visit } from "../types";
import { haversineMeters } from "./geo";
import { resolvePlace } from "./resolvePlace";

const MAX_GAP_MINUTES = 90; // photos more than this apart are separate visits
const MAX_DISTANCE_METERS = 150; // photos further apart are separate visits

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Stage 4: Visit clustering
 *
 * Groups photos taken close together in time AND space into a single visit,
 * then resolves each cluster's centroid to a restaurant via the Places API.
 * Clusters that don't resolve to a food place are dropped.
 */
export async function clusterVisits(photos: PhotoAsset[]): Promise<Visit[]> {
  const sorted = [...photos].sort((a, b) => a.timestamp - b.timestamp);
  const clusters: PhotoAsset[][] = [];

  for (const photo of sorted) {
    if (photo.latitude == null || photo.longitude == null) continue;

    const last = clusters[clusters.length - 1];
    const lastPhoto = last?.[last.length - 1];

    const withinTime =
      lastPhoto &&
      (photo.timestamp - lastPhoto.timestamp) / 60000 <= MAX_GAP_MINUTES;
    const withinDistance =
      lastPhoto &&
      lastPhoto.latitude != null &&
      lastPhoto.longitude != null &&
      haversineMeters(
        lastPhoto.latitude,
        lastPhoto.longitude,
        photo.latitude,
        photo.longitude
      ) <= MAX_DISTANCE_METERS;

    if (last && withinTime && withinDistance) {
      last.push(photo);
    } else {
      clusters.push([photo]);
    }
  }

  const visits: Visit[] = [];

  for (const cluster of clusters) {
    const centroid = {
      latitude: median(cluster.map((p) => p.latitude as number)),
      longitude: median(cluster.map((p) => p.longitude as number)),
    };

    const place: ResolvedPlace | null = await resolvePlace(
      centroid.latitude,
      centroid.longitude
    );
    if (!place) continue; // not a food place — skip (e.g. photo at home)

    visits.push({
      id: `${place.placeId}-${cluster[0].timestamp}`,
      place,
      photoIds: cluster.map((p) => p.id),
      startedAt: cluster[0].timestamp,
      endedAt: cluster[cluster.length - 1].timestamp,
      confirmed: false,
    });
  }

  return visits;
}

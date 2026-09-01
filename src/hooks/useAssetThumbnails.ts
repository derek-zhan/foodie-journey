import { useEffect, useRef, useState } from "react";
import type { Visit } from "../types";
import { getAssetThumbnailUri } from "../pipeline/extractPhotoMetadata";

// photoId -> displayable uri, or null once resolution has failed (asset
// deleted from the device, permission revoked since the scan, etc.)
export function useAssetThumbnails(
  visits: Visit[]
): Record<string, string | null> {
  const [thumbnails, setThumbnails] = useState<Record<string, string | null>>(
    {}
  );
  // Tracks which photoIds resolution has already been kicked off for,
  // independent of the (async, arrives-later) `thumbnails` state - so this
  // effect can depend on just `visits` without re-requesting on every
  // thumbnail that resolves.
  const requestedThumbnailIds = useRef(new Set<string>());

  useEffect(() => {
    const idsToResolve = Array.from(
      new Set(visits.flatMap((v) => v.photoIds))
    ).filter((id) => !requestedThumbnailIds.current.has(id));

    for (const id of idsToResolve) {
      requestedThumbnailIds.current.add(id);
      getAssetThumbnailUri(id).then((uri) => {
        setThumbnails((prev) => ({ ...prev, [id]: uri }));
      });
    }
  }, [visits]);

  return thumbnails;
}

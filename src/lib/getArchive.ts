import { head } from "@vercel/blob";
import fallbackArchive from "@/data/archive.json";
import type { ArchiveItem } from "@/types/archive";

const ARCHIVE_BLOB_PATH = "data/archive.json";

/** Loads the live archive from Vercel Blob, updated directly by the content
 * ingestion pipeline (scripts/upload-media.mjs) without a code deploy.
 * Falls back to the bundled src/data/archive.json snapshot if Blob is
 * unreachable or not yet published. */
export async function getArchiveItems(): Promise<ArchiveItem[]> {
  try {
    const blob = await head(ARCHIVE_BLOB_PATH);
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) throw new Error(`archive fetch failed: ${res.status}`);
    return (await res.json()) as ArchiveItem[];
  } catch (err) {
    console.error("Falling back to bundled archive.json:", err);
    return fallbackArchive as ArchiveItem[];
  }
}

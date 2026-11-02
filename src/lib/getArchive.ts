import archive from "@/data/archive.json";
import type { ArchiveItem } from "@/types/archive";

/** The archive bundled at build time. The daily check (code_python/daily_check.py)
 * commits an updated src/data/archive.json and pushes it, which redeploys the
 * site - so the data never needs to be fetched at runtime. */
export function getArchiveItems(): ArchiveItem[] {
  return archive as ArchiveItem[];
}

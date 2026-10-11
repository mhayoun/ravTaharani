export type ArchiveItemType = "video" | "audio" | "pdf";

export interface ArchiveItem {
  title: string;
  type: ArchiveItemType;
  category: string;
  subcategory: string | null;
  upload_date: string | null;
  /** YouTube link for YouTube videos, Vercel Blob public URL for audio/pdf
   * and for video files synced from Google Drive */
  url?: string;
  duration_seconds?: number | null;
  pages?: number | null;
  format?: string;
  author?: string | null;
  /** "drive" for files synced from Google Drive (code_python/drive_sync.py),
   * "kolhalashon"/"kolbarama" for lessons linked to kolhalashon.com /
   * kol-barama.co.il (scripts/import-kolhalashon.mjs) - their url is the
   * lesson's page there */
  source?: "drive" | "kolhalashon" | "kolbarama";
  /** A second page with the same lesson, on the alt_source site */
  alt_url?: string;
  alt_source?: "kolbarama";
}

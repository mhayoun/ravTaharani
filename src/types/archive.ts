export type ArchiveItemType = "video" | "audio" | "pdf";

export interface ArchiveItem {
  title: string;
  type: ArchiveItemType;
  category: string;
  subcategory: string | null;
  upload_date: string | null;
  /** YouTube link for video, Vercel Blob public URL for audio/pdf */
  url?: string;
  duration_seconds?: number | null;
  pages?: number | null;
  format?: string;
  author?: string | null;
}

const DRIVE_API_PREFIX = "https://www.googleapis.com/drive/v3/files/";

/** Public, browser-usable URL for an archive item's file.
 *
 * Audio/PDF/video files are served from Google Drive through the Drive API
 * (archive.json stores `…/drive/v3/files/<id>?alt=media`). Drive's plain
 * download links can't be used: Google rejects them when they're played or
 * fetched from another site. The API needs an API key, which is added here
 * rather than stored in archive.json, so it never lands in git. The key is
 * public by nature (it's in the page) - restrict it in Google Cloud to the
 * Drive API and to this site's domains. Other URLs are returned unchanged. */
export function mediaUrl(url: string): string;
export function mediaUrl(url: string | undefined): string | undefined;
export function mediaUrl(url: string | undefined): string | undefined {
  const key = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
  if (!url || !key || !url.startsWith(DRIVE_API_PREFIX)) return url;
  return `${url}&key=${encodeURIComponent(key)}`;
}

// Builds src/data/archive.json - the archive the site bundles at build time.
// The daily check (code_python/daily_check.py) commits and pushes it, which
// redeploys the site. Nothing is uploaded anywhere: audio, PDF and video
// files are served straight from Google Drive through the Drive API (the
// folders are shared as "anyone with the link - viewer").
//
// Sources:
//   taharani_videos.json  - YouTube videos (links)
//   taharani_drive.json   - every audio/PDF/video file, from
//                           code_python/drive_sync.py
//   taharani_audio.json / taharani_pdf.json - local files. Only used to warn
//                           about files that are not in Drive yet (they can't
//                           be published without a host); drive_sync.py
//                           already copies their metadata onto the Drive
//                           record (local_filename).
//   taharani_kolhalashon.json / taharani_kolbarama.json - links to those sites
//
// Items flagged needs_review are left out until the classification is
// resolved.
// Run with: node scripts/build-archive.mjs
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const ARCHIVE_PATH = path.join(ROOT, "..", "src", "data", "archive.json");

async function loadJson(name) {
  return JSON.parse(await readFile(path.join(ROOT, name), "utf-8"));
}

async function loadOptionalJson(name) {
  try {
    return await loadJson(name);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

// Drive API download link (range requests and CORS supported). Drive's
// plain download links are refused when played/fetched from another site.
// The site appends its API key at render time (src/lib/media.ts), so the key
// isn't stored here.
function driveUrl(id) {
  return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`;
}

async function main() {
  const [videos, audio, pdfs, drive, kolhalashon, kolbarama] = await Promise.all([
    loadJson("taharani_videos.json"),
    loadOptionalJson("taharani_audio.json"),
    loadOptionalJson("taharani_pdf.json"),
    loadOptionalJson("taharani_drive.json"),
    loadOptionalJson("taharani_kolhalashon.json"),
    loadOptionalJson("taharani_kolbarama.json"),
  ]);

  let skippedReview = 0;
  const publishedDrive = [];
  for (const item of drive ?? []) {
    if (item.needs_review) {
      skippedReview++;
      continue;
    }
    const published = { ...item, url: driveUrl(item.drive_id) };
    delete published.local_path;
    publishedDrive.push(published);
  }
  console.log(`Drive: ${publishedDrive.length} published, ${skippedReview} skipped (needs_review)`);

  const inDrive = new Set(
    (drive ?? []).filter((i) => i.local_filename).map((i) => `${i.type}:${i.local_filename}`)
  );
  const notInDrive = [...(audio ?? []), ...(pdfs ?? [])].filter(
    (i) => !i.needs_review && !inDrive.has(`${i.type}:${i.filename}`)
  );
  for (const item of notInDrive) {
    console.warn(`Not in Google Drive - not published: ${item.type} ${item.filename}`);
  }

  const combined = [
    ...videos,
    ...publishedDrive,
    ...(kolhalashon ?? []),
    ...(kolbarama ?? []),
  ].sort((a, b) =>
    (b.upload_date || "00000000").localeCompare(a.upload_date || "00000000")
  );

  await writeFile(ARCHIVE_PATH, JSON.stringify(combined, null, 2), "utf-8");
  console.log(`\nWrote ${combined.length} items to ${ARCHIVE_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

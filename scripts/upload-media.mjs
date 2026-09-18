// Uploads local audio + PDF files to Vercel Blob, then publishes the merged
// archive itself to Blob at a stable path (data/archive.json) so the live
// site can pick up new content on the next page load without a code
// deploy. Also writes src/data/archive.json locally as a build-time
// fallback for when Blob is unreachable and for local dev.
// Safe to run repeatedly/unattended: files already present in the
// currently-published archive (matched by type+filename) reuse their prior
// URL instead of being re-uploaded, and items flagged needs_review are left
// out entirely until a human resolves the classification and reruns.
// Run with: node --env-file=.env.local scripts/upload-media.mjs
import { put, head, del } from "@vercel/blob";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const ARCHIVE_PATH = path.join(ROOT, "..", "src", "data", "archive.json");
const ARCHIVE_BLOB_PATH = "data/archive.json";

async function loadJson(name) {
  const raw = await readFile(path.join(ROOT, name), "utf-8");
  return JSON.parse(raw);
}

async function loadExistingArchive() {
  // Read from Blob first - it's the live source of truth. Falling back to
  // the local file (which may be stale/uncommitted) would make the
  // "already published" check wrong and cause needless re-uploads.
  try {
    const info = await head(ARCHIVE_BLOB_PATH);
    const res = await fetch(info.url, { cache: "no-store" });
    if (res.ok) return await res.json();
  } catch {
    // not published yet, or unreachable - fall through to local file
  }
  try {
    return JSON.parse(await readFile(ARCHIVE_PATH, "utf-8"));
  } catch {
    return [];
  }
}

async function uploadFile(localPath, pathnamePrefix, filename) {
  const buffer = await readFile(localPath);
  // allowOverwrite: a prior run may have uploaded this file successfully
  // and then failed later (e.g. publishing archive.json), so a retry can
  // legitimately re-upload the same path - that must not error.
  const blob = await put(`${pathnamePrefix}/${filename}`, buffer, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return blob.url;
}

async function publishItems(items, pathnamePrefix, existingByKey, label) {
  let uploaded = 0;
  let reused = 0;
  let skippedReview = 0;
  const published = [];

  for (const item of items) {
    if (item.needs_review) {
      skippedReview++;
      continue;
    }

    const key = `${item.type}:${item.filename}`;
    const prior = existingByKey.get(key);
    if (prior?.url) {
      item.url = prior.url;
      delete item.local_path;
      reused++;
    } else {
      process.stdout.write(`  ${item.filename} ... `);
      item.url = await uploadFile(item.local_path, pathnamePrefix, item.filename);
      delete item.local_path;
      uploaded++;
      console.log("done");
    }
    published.push(item);
  }

  console.log(
    `${label}: ${uploaded} uploaded, ${reused} already published, ${skippedReview} skipped (needs_review)`
  );
  return published;
}

async function main() {
  const [videos, audio, pdfs] = await Promise.all([
    loadJson("taharani_videos.json"),
    loadJson("taharani_audio.json"),
    loadJson("taharani_pdf.json"),
  ]);

  const existing = await loadExistingArchive();
  const existingByKey = new Map(
    existing.filter((i) => i.filename).map((i) => [`${i.type}:${i.filename}`, i])
  );

  const publishedAudio = await publishItems(audio, "audio", existingByKey, "Audio");
  const publishedPdfs = await publishItems(pdfs, "pdf", existingByKey, "PDF");

  // Files renamed or removed locally (e.g. a lesson retitled) drop out of
  // taharani_audio.json/taharani_pdf.json on the next classify - delete
  // their old blob so a rename acts as a true replace, not a leftover copy.
  const stillPresentKeys = new Set(
    [...publishedAudio, ...publishedPdfs].map((i) => `${i.type}:${i.filename}`)
  );
  for (const [key, item] of existingByKey) {
    if ((item.type !== "audio" && item.type !== "pdf") || stillPresentKeys.has(key)) continue;
    try {
      await del(item.url);
      console.log(`Deleted orphaned blob: ${item.filename}`);
    } catch (err) {
      console.error(`Failed to delete orphaned blob ${item.filename}:`, err.message);
    }
  }

  const combined = [...videos, ...publishedAudio, ...publishedPdfs].sort((a, b) =>
    (b.upload_date || "00000000").localeCompare(a.upload_date || "00000000")
  );

  const json = JSON.stringify(combined, null, 2);
  await writeFile(ARCHIVE_PATH, json, "utf-8");
  console.log(`\nWrote ${combined.length} items to ${ARCHIVE_PATH}`);

  const archiveBlob = await put(ARCHIVE_BLOB_PATH, json, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  console.log(`Published live archive to ${archiveBlob.url}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

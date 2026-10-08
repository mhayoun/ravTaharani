// Uploads local audio + PDF files to Vercel Blob, then publishes the merged
// archive itself to Blob at a stable path (data/archive.json) so the live
// site can pick up new content on the next page load without a code
// deploy. Also writes src/data/archive.json locally as a build-time
// fallback for when Blob is unreachable and for local dev.
// Safe to run repeatedly/unattended: files already present in the
// currently-published archive (matched by type+filename) reuse their prior
// URL instead of being re-uploaded, and items flagged needs_review are left
// out entirely until a human resolves the classification and reruns.
// Google Drive files (taharani_drive.json, from code_python/drive_sync.py)
// are keyed by Drive file id instead, and re-uploaded when their Drive
// modifiedTime changes.
// Run with: node --env-file=.env.local scripts/upload-media.mjs
import { put, head, del } from "@vercel/blob";
import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const ARCHIVE_PATH = path.join(ROOT, "..", "src", "data", "archive.json");
const ARCHIVE_BLOB_PATH = "data/archive.json";
// Above this, upload in parts from a stream instead of buffering the whole
// file in memory (Drive videos can be several GB).
const MULTIPART_THRESHOLD = 100 * 1024 * 1024;

async function loadJson(name) {
  const raw = await readFile(path.join(ROOT, name), "utf-8");
  return JSON.parse(raw);
}

async function loadOptionalJson(name) {
  try {
    return await loadJson(name);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
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
  const { size } = await stat(localPath);
  const multipart = size > MULTIPART_THRESHOLD;
  const body = multipart ? createReadStream(localPath) : await readFile(localPath);
  // allowOverwrite: a prior run may have uploaded this file successfully
  // and then failed later (e.g. publishing archive.json), so a retry can
  // legitimately re-upload the same path - that must not error.
  const blob = await put(`${pathnamePrefix}/${filename}`, body, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    multipart,
  });
  return blob.url;
}

// Drive's modifiedTime in the blob path, so a file changed in Drive gets a
// fresh URL rather than one the CDN may still serve the old version for.
function drivePathnamePrefix(item) {
  const version = item.drive_modified.replace(/[^0-9]/g, "");
  return `drive/${item.type}/${item.drive_id}/${version}`;
}

async function publishDriveItems(items, existingDriveById) {
  let uploaded = 0;
  let reused = 0;
  let skippedReview = 0;
  const published = [];

  for (const item of items) {
    if (item.needs_review) {
      skippedReview++;
      continue;
    }

    const prior = existingDriveById.get(item.drive_id);
    if (prior?.url && prior.drive_modified === item.drive_modified) {
      item.url = prior.url;
      reused++;
    } else {
      process.stdout.write(`  ${item.type}: ${item.filename} ... `);
      item.url = await uploadFile(item.local_path, drivePathnamePrefix(item), item.filename);
      uploaded++;
      console.log("done");
    }
    delete item.local_path;
    published.push(item);
  }

  console.log(
    `Drive: ${uploaded} uploaded, ${reused} already published, ${skippedReview} skipped (needs_review)`
  );
  return published;
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
  const [videos, audio, pdfs, drive] = await Promise.all([
    loadJson("taharani_videos.json"),
    loadJson("taharani_audio.json"),
    loadJson("taharani_pdf.json"),
    loadOptionalJson("taharani_drive.json"),
  ]);

  const existing = await loadExistingArchive();
  const existingByKey = new Map(
    existing
      .filter((i) => i.filename && i.source !== "drive")
      .map((i) => [`${i.type}:${i.filename}`, i])
  );
  const existingDriveById = new Map(
    existing.filter((i) => i.source === "drive").map((i) => [i.drive_id, i])
  );

  const publishedAudio = await publishItems(audio, "audio", existingByKey, "Audio");
  const publishedPdfs = await publishItems(pdfs, "pdf", existingByKey, "PDF");
  // No taharani_drive.json yet (Drive sync never ran on this machine) -
  // keep whatever Drive items are already live rather than deleting them.
  const publishedDrive = drive
    ? await publishDriveItems(drive, existingDriveById)
    : [...existingDriveById.values()];

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

  // Drive files deleted, or replaced by a newer version, since the last run.
  const liveDriveUrls = new Set(publishedDrive.map((i) => i.url));
  for (const item of existingDriveById.values()) {
    if (!item.url || liveDriveUrls.has(item.url)) continue;
    try {
      await del(item.url);
      console.log(`Deleted old Drive blob: ${item.filename}`);
    } catch (err) {
      console.error(`Failed to delete old Drive blob ${item.filename}:`, err.message);
    }
  }

  const combined = [...videos, ...publishedAudio, ...publishedPdfs, ...publishedDrive].sort((a, b) =>
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

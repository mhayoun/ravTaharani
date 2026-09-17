// Uploads local audio + PDF files to Vercel Blob and writes a merged
// src/data/archive.json with public Blob URLs for the Next.js app to consume.
// Run with: node --env-file=.env.local scripts/upload-media.mjs
import { put } from "@vercel/blob";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);

async function loadJson(name) {
  const raw = await readFile(path.join(ROOT, name), "utf-8");
  return JSON.parse(raw);
}

async function uploadFile(localPath, pathnamePrefix, filename) {
  const buffer = await readFile(localPath);
  const blob = await put(`${pathnamePrefix}/${filename}`, buffer, {
    access: "public",
    addRandomSuffix: false,
  });
  return blob.url;
}

async function main() {
  const [videos, audio, pdfs] = await Promise.all([
    loadJson("taharani_videos.json"),
    loadJson("taharani_audio.json"),
    loadJson("taharani_pdf.json"),
  ]);

  console.log(`Uploading ${audio.length} audio files...`);
  for (const item of audio) {
    process.stdout.write(`  ${item.filename} ... `);
    const url = await uploadFile(item.local_path, "audio", item.filename);
    item.url = url;
    delete item.local_path;
    console.log("done");
  }

  console.log(`Uploading ${pdfs.length} pdf files...`);
  for (const item of pdfs) {
    process.stdout.write(`  ${item.filename} ... `);
    const url = await uploadFile(item.local_path, "pdf", item.filename);
    item.url = url;
    delete item.local_path;
    console.log("done");
  }

  const combined = [...videos, ...audio, ...pdfs].sort((a, b) =>
    (b.upload_date || "00000000").localeCompare(a.upload_date || "00000000")
  );

  const outPath = path.join(ROOT, "..", "src", "data", "archive.json");
  await writeFile(outPath, JSON.stringify(combined, null, 2), "utf-8");
  console.log(`\nWrote ${combined.length} items to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

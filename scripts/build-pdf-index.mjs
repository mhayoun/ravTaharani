#!/usr/bin/env node
// Extracts per-page text from every PDF item in src/data/archive.json so the
// site can offer full-text search inside PDFs without shipping pdf.js or the
// PDF bytes to the client until a search is actually performed.
//
// Run manually after archive.json changes: `node scripts/build-pdf-index.mjs`
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

// Decoding of symbolic-font / visual-order Hebrew text lives in a module
// shared with the PDF viewer, so search and highlighting agree.
const { createTextFixer } = await import(pathToFileURL(join(root, "public/pdf-text.mjs")).href);
const { logicalItem } = createTextFixer(
  JSON.parse(readFileSync(join(root, "public/cp1255-table.json"), "utf8"))
);

/** Turns a page's text items into logical-order text. */
function pageText(items) {
  const parts = []; // { text, visual, x, y }
  for (const it of items) {
    if (!("str" in it)) continue;
    parts.push({ ...logicalItem(it.str), x: it.transform[4], y: it.transform[5] });
  }

  const out = [];
  for (let i = 0; i < parts.length; ) {
    if (!parts[i].visual) {
      out.push(parts[i].text);
      i++;
      continue;
    }
    // A run of consecutive visual items on one line: a heading's word can be
    // split into small fragments listed left-to-right, so besides reversing
    // each item's characters (done in logicalItem), read the fragments
    // right-to-left (x descending).
    let j = i;
    while (j < parts.length && parts[j].visual && Math.abs(parts[j].y - parts[i].y) < 2) j++;
    const run = parts.slice(i, j).sort((a, b) => b.x - a.x);
    for (const part of run) out.push(part.text);
    i = j;
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

// ASCII-only id derived from the URL, so the JSON file is safe as a static
// asset path regardless of the (Hebrew) title.
function slugify(url) {
  return "pdf-" + createHash("sha1").update(url).digest("hex").slice(0, 10);
}

async function indexPdf(item) {
  console.log(`Indexing: ${item.title}`);
  const res = await fetch(item.url);
  if (!res.ok) throw new Error(`Failed to fetch ${item.url}: ${res.status}`);
  const data = new Uint8Array(await res.arrayBuffer());

  const loadingTask = pdfjsLib.getDocument({
    data,
    isEvalSupported: false,
    useWorkerFetch: false,
    // Without these, PDFs with non-embedded/standard fonts or custom CID
    // encodings (common in Hebrew sfarim) can extract garbled text.
    standardFontDataUrl: join(root, "node_modules/pdfjs-dist/standard_fonts/") + "/",
    cMapUrl: join(root, "node_modules/pdfjs-dist/cmaps/") + "/",
    cMapPacked: true,
  });
  const doc = await loadingTask.promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const text = pageText(content.items);
    if (text) pages.push({ page: p, text });
    page.cleanup();
    if (p % 100 === 0) console.log(`  ${p}/${doc.numPages}`);
  }
  await loadingTask.destroy();
  return pages;
}

async function main() {
  const archive = JSON.parse(readFileSync(join(root, "src/data/archive.json"), "utf8"));
  const pdfItems = archive.filter((i) => i.type === "pdf" && i.url);

  const outDir = join(root, "public", "pdf-index");
  mkdirSync(outDir, { recursive: true });

  const manifest = [];
  for (const item of pdfItems) {
    const id = slugify(item.url);
    const pages = await indexPdf(item);
    writeFileSync(
      join(outDir, `${id}.json`),
      JSON.stringify({ id, title: item.title, url: item.url, pages })
    );
    manifest.push({ id, title: item.title, url: item.url, pages: pages.length });
    console.log(`  -> ${pages.length} pages with text, saved as ${id}.json`);
  }

  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`Done. Indexed ${manifest.length} PDF(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

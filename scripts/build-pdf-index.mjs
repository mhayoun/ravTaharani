#!/usr/bin/env node
// Extracts per-page text from every PDF item in src/data/archive.json so the
// site can offer full-text search inside PDFs without shipping pdf.js or the
// PDF bytes to the client until a search is actually performed.
//
// Run manually after archive.json changes: `node scripts/build-pdf-index.mjs`
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

// Some pages in these PDFs use a font pdf.js treats as "symbolic": instead
// of proper Hebrew Unicode codepoints, getTextContent() returns the font's
// raw Windows-1255 (Hebrew codepage) byte values, either directly as the
// codepoint (e.g. U+00F0 "ð" for byte 0xF0, which is actually נ) or offset
// into the Private Use Area per the standard symbol-font convention (e.g.
// U+F0F0 for the same byte, which renders as a blank box — no font has a
// glyph there). Both cases carry the original CP1255 byte value; decoding
// it against the real Hebrew codepage recovers the correct character.
const cp1255Table = JSON.parse(readFileSync(join(__dirname, "cp1255-table.json"), "utf8"));
const CP1255 = new Map(Object.entries(cp1255Table).map(([k, v]) => [Number(k), v]));

function fixSymbolicEncoding(text) {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0);
    let byte = null;
    if (code >= 0xf020 && code <= 0xf0ff) byte = code - 0xf000;
    else if (code >= 0x80 && code <= 0xff) byte = code;
    out += byte !== null && CP1255.has(byte) ? CP1255.get(byte) : ch;
  }
  return out;
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
    const text = fixSymbolicEncoding(
      content.items
        .map((it) => ("str" in it ? it.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    );
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

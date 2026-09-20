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

// The same symbolic-font items are also stored in *visual* order: pdf.js
// hands back their glyphs left-to-right as drawn, so once decoded the Hebrew
// reads backwards (e.g. "הכלה" instead of "הלכה"). Items that already carry
// real Hebrew Unicode (dir "rtl") are in logical order and are left alone.
const HEBREW = /[\u0590-\u05ff]/;
const MIRRORED = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<" };
// A number or Latin word, allowing separators inside it ("1,000", "12.5").
const LTR_RUN = /[0-9A-Za-z]+(?:[.,:/\-][0-9A-Za-z]+)*/g;

function visualToLogical(text) {
  const reversed = [...text].reverse().map((ch) => MIRRORED[ch] ?? ch).join("");
  // Digits and Latin were drawn left-to-right; reversing flipped them too.
  return reversed.replace(LTR_RUN, (run) => [...run].reverse().join(""));
}

// Some fonts also encode brackets by the glyph drawn, so in a logical-order
// Hebrew item "(אות נו)" arrives as ")אות נו(". Swap them back, but only for
// items that are consistently mirrored, so PDFs with correct brackets are
// left untouched.
const MIRRORED_BRACKET = /\)[\u05d0-\u05ea]|[\u05d0-\u05ea]\(/;
const NORMAL_BRACKET = /\([\u05d0-\u05ea]|[\u05d0-\u05ea]\)/;

function unmirrorBrackets(text) {
  if (!MIRRORED_BRACKET.test(text) || NORMAL_BRACKET.test(text)) return text;
  return text.replace(/[()[\]{}<>]/g, (ch) => MIRRORED[ch]);
}

/** Turns a page's text items into logical-order text. */
function pageText(items) {
  const parts = []; // { text, visual, x, y }
  for (const it of items) {
    if (!("str" in it)) continue;
    const decoded = fixSymbolicEncoding(it.str);
    const visual = !HEBREW.test(it.str) && HEBREW.test(decoded);
    parts.push({
      text: visual ? decoded : unmirrorBrackets(decoded),
      visual,
      x: it.transform[4],
      y: it.transform[5],
    });
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
    // each item's characters, read the fragments right-to-left (x descending).
    let j = i;
    while (j < parts.length && parts[j].visual && Math.abs(parts[j].y - parts[i].y) < 2) j++;
    const run = parts.slice(i, j).sort((a, b) => b.x - a.x);
    for (const part of run) out.push(visualToLogical(part.text));
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

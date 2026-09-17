#!/usr/bin/env node
// Keeps the pdfjs-dist runtime assets the standalone PDF viewer document
// (src/app/pdf-view/route.ts, loaded in an <iframe>) needs in sync with the
// installed version:
//  - pdf.mjs: the pdf.js library itself, loaded via a plain <script type
//    ="module"> import — NOT the bundled "pdfjs-dist" package import, so it
//    must be served as a static file.
//  - pdf.worker.min.mjs: the background parsing/rendering worker
//  - cmaps/: character maps for CID-keyed fonts (needed by many Hebrew PDFs)
//  - standard_fonts/: fallback glyph data for non-embedded standard fonts
// Without cmaps/standard_fonts, PDFs using non-embedded or custom-encoded
// fonts render as garbled "?" glyphs instead of the real text.
import { copyFileSync, cpSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = join(root, "node_modules/pdfjs-dist");
const publicDir = join(root, "public");

for (const file of ["build/pdf.mjs", "build/pdf.worker.min.mjs"]) {
  const src = join(pkg, file);
  const destName = file.split("/").pop();
  if (existsSync(src)) {
    copyFileSync(src, join(publicDir, destName));
    console.log(`Copied ${destName} to public/`);
  } else {
    console.warn(`pdfjs-dist ${file} not found, skipping copy`);
  }
}

for (const dir of ["cmaps", "standard_fonts"]) {
  const src = join(pkg, dir);
  const dest = join(publicDir, dir);
  if (existsSync(src)) {
    mkdirSync(dest, { recursive: true });
    cpSync(src, dest, { recursive: true });
    console.log(`Copied ${dir}/ to public/`);
  } else {
    console.warn(`pdfjs-dist ${dir}/ not found, skipping copy`);
  }
}

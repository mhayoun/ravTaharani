// Shared by the PDF index builder (scripts/build-pdf-index.mjs, runs in Node)
// and the PDF viewer (src/app/pdf-view/route.ts, runs in the browser), so the
// text a search finds and the text the viewer highlights are decoded the same
// way. Served statically from public/ like pdf.mjs.
//
// Some pages in these PDFs use a font pdf.js treats as "symbolic": instead
// of proper Hebrew Unicode codepoints, getTextContent() returns the font's
// raw Windows-1255 (Hebrew codepage) byte values, either directly as the
// codepoint (e.g. U+00F0 "ð" for byte 0xF0, which is actually נ) or offset
// into the Private Use Area per the standard symbol-font convention (e.g.
// U+F0F0 for the same byte, which renders as a blank box — no font has a
// glyph there). Both cases carry the original CP1255 byte value; decoding
// it against the real Hebrew codepage recovers the correct character.
//
// The same symbolic-font items are also stored in *visual* order: pdf.js
// hands back their glyphs left-to-right as drawn, so once decoded the Hebrew
// reads backwards (e.g. "הכלה" instead of "הלכה"). Items that already carry
// real Hebrew Unicode (dir "rtl") are in logical order and are left alone.

const HEBREW = /[֐-׿]/;
const MIRRORED = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<" };
// A number or Latin word, allowing separators inside it ("1,000", "12.5").
const LTR_RUN = /[0-9A-Za-z]+(?:[.,:/\-][0-9A-Za-z]+)*/g;

// Some fonts also encode brackets by the glyph drawn, so in a logical-order
// Hebrew item "(אות נו)" arrives as ")אות נו(". Swap them back, but only for
// items that are consistently mirrored, so PDFs with correct brackets are
// left untouched.
const MIRRORED_BRACKET = /\)[א-ת]|[א-ת]\(/;
const NORMAL_BRACKET = /\([א-ת]|[א-ת]\)/;

export function createTextFixer(cp1255Table) {
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

  function visualToLogical(text) {
    const reversed = [...text].reverse().map((ch) => MIRRORED[ch] ?? ch).join("");
    // Digits and Latin were drawn left-to-right; reversing flipped them too.
    return reversed.replace(LTR_RUN, (run) => [...run].reverse().join(""));
  }

  function unmirrorBrackets(text) {
    if (!MIRRORED_BRACKET.test(text) || NORMAL_BRACKET.test(text)) return text;
    return text.replace(/[()[\]{}<>]/g, (ch) => MIRRORED[ch]);
  }

  /** One pdf.js text item's string -> its logical-order text. `visual` says
   * the item was stored in visual order (and has been reversed here). */
  function logicalItem(str) {
    const decoded = fixSymbolicEncoding(str);
    const visual = !HEBREW.test(str) && HEBREW.test(decoded);
    return { visual, text: visual ? visualToLogical(decoded) : unmirrorBrackets(decoded) };
  }

  return { logicalItem };
}

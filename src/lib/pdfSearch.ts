import type { PdfIndex, PdfMatch } from "@/types/pdfSearch";

const CONTEXT_WORDS = 10;
const MAX_MATCHES_PER_PAGE = 3;

function wordsBefore(text: string, n: number) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/).slice(-n).join(" ");
}

function wordsAfter(text: string, n: number) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/).slice(0, n).join(" ");
}

/** Finds every occurrence of `query` inside a PDF's page texts, with 10 words
 * of context on each side, for use as highlighted search-result snippets. */
export function findMatchesInPdf(index: PdfIndex, query: string, limit: number): PdfMatch[] {
  // Collapse whitespace: PDF text extraction already normalizes runs of
  // whitespace to a single space, so the query must match that to find a
  // multi-word phrase.
  const q = query.trim().replace(/\s+/g, " ");
  if (!q) return [];
  const qLower = q.toLowerCase();
  const matches: PdfMatch[] = [];

  for (const p of index.pages) {
    const lower = p.text.toLowerCase();
    let from = 0;
    let onThisPage = 0;
    while (matches.length < limit && onThisPage < MAX_MATCHES_PER_PAGE) {
      const at = lower.indexOf(qLower, from);
      if (at === -1) break;
      matches.push({
        id: index.id,
        title: index.title,
        url: index.url,
        page: p.page,
        before: wordsBefore(p.text.slice(0, at), CONTEXT_WORDS),
        match: p.text.slice(at, at + q.length),
        after: wordsAfter(p.text.slice(at + q.length), CONTEXT_WORDS),
      });
      onThisPage++;
      from = at + q.length;
    }
    if (matches.length >= limit) break;
  }

  return matches;
}

interface Occurrence {
  start: number;
  end: number;
  word: number;
}

/** Splits a query into its distinct, lowercased words. */
export function queryWords(query: string): string[] {
  return [...new Set(query.trim().toLowerCase().split(/\s+/).filter(Boolean))];
}

/** Shortest [start, end) stretch of `lower` containing at least one occurrence
 * of every word, or null if some word never appears. Words match anywhere
 * inside a longer word, so Hebrew prefixes (ה, ו, ב, ל…) don't block a hit. */
function shortestWindow(lower: string, words: string[]): { start: number; end: number } | null {
  const occ: Occurrence[] = [];
  for (let w = 0; w < words.length; w++) {
    let at = lower.indexOf(words[w]);
    if (at === -1) return null;
    while (at !== -1) {
      occ.push({ start: at, end: at + words[w].length, word: w });
      at = lower.indexOf(words[w], at + 1);
    }
  }
  occ.sort((a, b) => a.start - b.start);

  const counts = new Array<number>(words.length).fill(0);
  let covered = 0;
  let left = 0;
  let best: { start: number; end: number } | null = null;

  for (let right = 0; right < occ.length; right++) {
    if (counts[occ[right].word]++ === 0) covered++;
    while (covered === words.length) {
      let end = 0;
      for (let k = left; k <= right; k++) end = Math.max(end, occ[k].end);
      const start = occ[left].start;
      if (!best || end - start < best.end - best.start) best = { start, end };
      if (--counts[occ[left].word] === 0) covered--;
      left++;
    }
  }
  return best;
}

/** For a multi-word query: pages containing all the words (in any order, not
 * necessarily as the exact phrase), one result per page, tightest stretch of
 * text first. Pages listed in `skipPages` (those already shown as exact
 * matches) are left out. */
export function findAllWordsInPdf(
  index: PdfIndex,
  query: string,
  skipPages: Set<number> = new Set()
): PdfMatch[] {
  const words = queryWords(query);
  if (words.length < 2) return [];
  const matches: PdfMatch[] = [];

  for (const p of index.pages) {
    if (skipPages.has(p.page)) continue;
    const win = shortestWindow(p.text.toLowerCase(), words);
    if (!win) continue;
    matches.push({
      id: index.id,
      title: index.title,
      url: index.url,
      page: p.page,
      before: wordsBefore(p.text.slice(0, win.start), CONTEXT_WORDS),
      match: p.text.slice(win.start, win.end),
      after: wordsAfter(p.text.slice(win.end), CONTEXT_WORDS),
      words,
      span: win.end - win.start,
    });
  }

  return matches.sort((a, b) => a.span! - b.span!);
}

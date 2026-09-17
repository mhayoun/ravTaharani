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
  const q = query.trim();
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

"use client";

import { useEffect, useRef, useState } from "react";
import { findAllWordsInPdf, findMatchesInPdf } from "@/lib/pdfSearch";
import type { PdfIndex, PdfManifestEntry, PdfMatch } from "@/types/pdfSearch";

const MIN_QUERY_LENGTH = 2;
const PAGE_SIZE = 30;
const DEBOUNCE_MS = 250;

interface FileResult {
  id: string;
  title: string;
  matches: PdfMatch[];
}

/** Highlights each of the query words inside a snippet (used for the "all the
 * words" results, where the snippet is the stretch containing all of them). */
function highlightWords(text: string, words: string[]) {
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  return text.split(re).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded bg-yellow-300 px-0.5 py-px font-semibold text-ink">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="spin h-4 w-4 text-pdf-ink" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="42" strokeDashoffset="14" />
    </svg>
  );
}

export default function PdfSearch({
  query,
  onOpenResult,
  allowedUrls,
}: {
  query: string;
  onOpenResult: (match: PdfMatch) => void;
  /** Restricts the search to PDFs whose url is in this set (used to scope
   * search by the currently selected category/topic chips). */
  allowedUrls?: Set<string>;
}) {
  const [manifest, setManifest] = useState<PdfManifestEntry[] | null>(null);
  const cache = useRef<Map<string, PdfIndex>>(new Map());
  const [results, setResults] = useState<FileResult[]>([]);
  // Pages containing all the query words, but not as the exact phrase.
  const [related, setRelated] = useState<FileResult[]>([]);
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/pdf-index/manifest.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((m: PdfManifestEntry[]) => {
        if (!cancelled) setManifest(m);
      })
      .catch(() => {
        if (!cancelled) setManifest([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Collapse whitespace so a pasted sentence with extra/irregular spacing
  // (double spaces, line breaks) still matches as one exact phrase.
  const trimmed = query.trim().replace(/\s+/g, " ");

  useEffect(() => {
    if (!manifest || manifest.length === 0 || trimmed.length < MIN_QUERY_LENGTH) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      // Search every PDF and keep each file's matches in its own bucket, so
      // one file that happens to mention the term a lot can't crowd out the
      // others — every matching file gets its own section below.
      const fileResults: FileResult[] = [];
      const relatedResults: FileResult[] = [];
      for (const entry of manifest) {
        if (allowedUrls && !allowedUrls.has(entry.url)) continue;
        let index = cache.current.get(entry.id);
        if (!index) {
          try {
            const res = await fetch(`/pdf-index/${entry.id}.json`);
            index = await res.json();
            if (index) cache.current.set(entry.id, index);
          } catch {
            continue;
          }
        }
        if (cancelled || !index) continue;
        const fileMatches = findMatchesInPdf(index, trimmed, Infinity);
        if (fileMatches.length) fileResults.push({ id: entry.id, title: entry.title, matches: fileMatches });

        // Second tier: pages with all the words, not as the exact phrase.
        const exactPages = new Set(fileMatches.map((m) => m.page));
        const relatedMatches = findAllWordsInPdf(index, trimmed, exactPages);
        if (relatedMatches.length) relatedResults.push({ id: entry.id, title: entry.title, matches: relatedMatches });
      }
      if (cancelled) return;

      // Files whose tightest stretch of words is shortest come first.
      relatedResults.sort((a, b) => a.matches[0].span! - b.matches[0].span!);

      setResults(fileResults);
      setRelated(relatedResults);
      setVisibleCounts(
        Object.fromEntries(
          [...fileResults.map((f) => [f.id, PAGE_SIZE]), ...relatedResults.map((f) => [`related-${f.id}`, PAGE_SIZE])]
        )
      );
      setLoading(false);
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, manifest, allowedUrls]);

  if (trimmed.length < MIN_QUERY_LENGTH) return null;
  if (!loading && results.length === 0 && related.length === 0) return null;

  const totalMatches = [...results, ...related].reduce((sum, f) => sum + f.matches.length, 0);

  function renderFiles(files: FileResult[], group: "exact" | "related") {
    return files.map((file) => {
      const key = group === "related" ? `related-${file.id}` : file.id;
      const visible = visibleCounts[key] ?? PAGE_SIZE;
      const shown = file.matches.slice(0, visible);
      const remaining = file.matches.length - visible;

      return (
        <details key={key} open className="border-t border-border first:border-t-0">
          <summary className="flex cursor-pointer items-baseline justify-between gap-2.5 bg-surface-2/60 px-4.5 py-2.5 [&::-webkit-details-marker]:hidden">
            <span className="truncate text-[14px] font-semibold text-pdf-ink">{file.title}</span>
            <span className="whitespace-nowrap text-[12.5px] tabular-nums text-ink-dim">{file.matches.length}</span>
          </summary>
          <ul>
            {shown.map((m, i) => (
              <li key={`${m.id}-${m.page}-${i}`} className="border-t border-border first:border-t-0">
                <button
                  type="button"
                  onClick={() => onOpenResult(m)}
                  className="block w-full px-4 py-3 text-start transition-colors hover:bg-surface-2/60"
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-pdf-ink">ספרים</span>
                    <span className="text-xs tabular-nums text-ink-dim">עמ&apos; {m.page}</span>
                  </div>
                  <p className="mt-1 text-[14.5px] leading-relaxed text-ink">
                    {m.before && <span className="text-ink-dim">…{m.before} </span>}
                    {m.words ? (
                      highlightWords(m.match, m.words)
                    ) : (
                      <mark className="rounded bg-yellow-300 px-0.5 py-px font-semibold text-ink">{m.match}</mark>
                    )}
                    {m.after && <span className="text-ink-dim"> {m.after}…</span>}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          {remaining > 0 && (
            <div className="border-t border-border px-4.5 py-2.5">
              <button
                type="button"
                onClick={() =>
                  setVisibleCounts((prev) => ({ ...prev, [key]: (prev[key] ?? PAGE_SIZE) + PAGE_SIZE }))
                }
                className="text-[13.5px] font-semibold text-pdf-ink hover:underline"
              >
                הצג עוד ({remaining})
              </button>
            </div>
          )}
        </details>
      );
    });
  }

  return (
    <details open className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-sm)]">
      <summary className="flex cursor-pointer items-center justify-between gap-2.5 border-b border-border bg-surface-2 px-4.5 py-3.5 [&::-webkit-details-marker]:hidden">
        <h2 className="flex items-center gap-2 text-[19px] font-bold">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-pdf-ink" aria-hidden="true" />
          תוצאות בתוך הספרים
          {loading && <Spinner />}
        </h2>
        {!loading && (
          <span className="whitespace-nowrap text-[13px] tabular-nums text-ink-dim">{totalMatches}</span>
        )}
      </summary>

      {renderFiles(results, "exact")}

      {related.length > 0 && (
        <>
          <div className="border-t border-border bg-surface-2 px-4.5 py-2.5 text-[13.5px] font-bold text-ink">
            כל המילים בקרבת מקום
            <span className="ms-2 text-[12px] font-normal text-ink-dim">מהקרובות ביותר לרחוקות</span>
          </div>
          {renderFiles(related, "related")}
        </>
      )}
    </details>
  );
}

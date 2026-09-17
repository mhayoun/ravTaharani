"use client";

import { useEffect, useRef, useState } from "react";
import { findMatchesInPdf } from "@/lib/pdfSearch";
import type { PdfIndex, PdfManifestEntry, PdfMatch } from "@/types/pdfSearch";

const MIN_QUERY_LENGTH = 2;
const PAGE_SIZE = 30;
const DEBOUNCE_MS = 250;

interface FileResult {
  id: string;
  title: string;
  matches: PdfMatch[];
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
      }
      if (cancelled) return;

      setResults(fileResults);
      setVisibleCounts(Object.fromEntries(fileResults.map((f) => [f.id, PAGE_SIZE])));
      setLoading(false);
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, manifest, allowedUrls]);

  if (trimmed.length < MIN_QUERY_LENGTH) return null;
  if (!loading && results.length === 0) return null;

  const totalMatches = results.reduce((sum, f) => sum + f.matches.length, 0);

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

      {results.map((file) => {
        const visible = visibleCounts[file.id] ?? PAGE_SIZE;
        const shown = file.matches.slice(0, visible);
        const remaining = file.matches.length - visible;

        return (
          <details key={file.id} open className="border-t border-border first:border-t-0">
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
                      <mark className="rounded bg-yellow-300 px-0.5 py-px font-semibold text-ink">{m.match}</mark>
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
                    setVisibleCounts((prev) => ({ ...prev, [file.id]: (prev[file.id] ?? PAGE_SIZE) + PAGE_SIZE }))
                  }
                  className="text-[13.5px] font-semibold text-pdf-ink hover:underline"
                >
                  הצג עוד ({remaining})
                </button>
              </div>
            )}
          </details>
        );
      })}
    </details>
  );
}

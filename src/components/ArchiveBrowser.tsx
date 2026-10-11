"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { ArchiveItem } from "@/types/archive";
import type { PdfMatch } from "@/types/pdfSearch";
import { CATEGORY_ORDER, SUBCATEGORY_ORDER, TYPE_LABEL, orderSubcategories } from "@/lib/subcategoryOrder";
import { youtubeThumbnail } from "@/lib/youtube";
import PdfSearch from "./PdfSearch";
import PdfViewer from "./PdfViewer";
import VideoPlayer from "./VideoPlayer";

function formatDate(d: string | null | undefined) {
  if (!d || d.length !== 8) return "לא ידוע";
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function formatDuration(sec: number | null | undefined) {
  if (sec === null || sec === undefined) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function groupBy<T, K extends string>(list: T[], key: (item: T) => K): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of list) {
    const k = key(item) || "";
    (out[k] ??= []).push(item);
  }
  return out;
}

function HeadphonesIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M4 13v-1a8 8 0 0 1 16 0v1M4 13v5a2 2 0 0 0 2 2h1v-7H5a1 1 0 0 0-1 1v-1Zm16 0v5a2 2 0 0 1-2 2h-1v-7h2a1 1 0 0 1 1 1v-1Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5A1.5 1.5 0 0 1 7 3.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M14 3.5V8h4" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function PlayTileIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function Tile({ item }: { item: ArchiveItem }) {
  if (item.type === "video") {
    const thumb = youtubeThumbnail(item.url);
    if (thumb) {
      return (
        <span className="relative block h-[45px] w-20 shrink-0 overflow-hidden rounded-lg bg-surface-2 shadow-[var(--shadow-sm)] sm:h-[50px] sm:w-[88px]">
          <Image
            src={thumb}
            alt=""
            fill
            sizes="88px"
            className="object-cover"
            unoptimized
          />
        </span>
      );
    }
  }
  const tileClass =
    item.type === "video"
      ? "bg-surface-2 text-ink-dim"
      : item.type === "audio"
        ? "bg-audio-bg text-audio-ink"
        : "bg-pdf-bg text-pdf-ink";
  return (
    <span
      className={`flex h-[45px] w-20 shrink-0 items-center justify-center rounded-lg shadow-[var(--shadow-sm)] sm:h-[50px] sm:w-[88px] ${tileClass}`}
    >
      {item.type === "video" ? <PlayTileIcon /> : item.type === "audio" ? <HeadphonesIcon /> : <DocumentIcon />}
    </span>
  );
}

function Chip({
  label,
  count,
  active,
  onClick,
  variant,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  variant?: "audio" | "pdf";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13.5px] font-semibold transition-all ${
        active
          ? variant === "audio"
            ? "border-audio-ink bg-audio-ink text-white shadow-[var(--shadow-sm)]"
            : variant === "pdf"
              ? "border-pdf-ink bg-pdf-ink text-white shadow-[var(--shadow-sm)]"
              : "border-accent bg-accent text-accent-ink shadow-[var(--shadow-sm)]"
          : "border-border bg-bg text-ink-dim hover:border-accent hover:text-ink"
      }`}
    >
      {label}
      <span className="font-normal opacity-75">{count}</span>
    </button>
  );
}

/** Sites whose lessons are linked rather than hosted here
 * (scripts/import-kolhalashon.mjs). */
const EXTERNAL_SOURCE_LABEL: Record<string, string> = {
  kolhalashon: "קול הלשון",
  kolbarama: "קול ברמה",
};

/** The external sites an item is linked to: its own source, then the site
 * of its second link, if any. */
function externalLabels(item: ArchiveItem): string[] {
  return [item.source, item.alt_source]
    .map((s) => (s ? EXTERNAL_SOURCE_LABEL[s] : undefined))
    .filter((label): label is string => !!label);
}

function highlightTitle(title: string, query: string) {
  // Collapse whitespace so a pasted sentence with extra/irregular spacing
  // (double spaces, line breaks) still matches as one exact phrase.
  const q = query.trim().replace(/\s+/g, " ");
  if (!q) return title;
  const idx = title.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return title;
  return (
    <>
      {title.slice(0, idx)}
      <mark className="rounded bg-yellow-300 px-0.5 py-px font-semibold text-ink">
        {title.slice(idx, idx + q.length)}
      </mark>
      {title.slice(idx + q.length)}
    </>
  );
}

export function Row({
  item,
  query,
  onOpenVideo,
}: {
  item: ArchiveItem;
  query?: string;
  onOpenVideo?: (item: ArchiveItem) => void;
}) {
  const typeClass =
    item.type === "audio"
      ? "text-audio-ink"
      : item.type === "pdf"
        ? "text-pdf-ink"
        : "text-ink-dim";

  const titleNode = query ? highlightTitle(item.title, query) : item.title;
  const external = item.source ? EXTERNAL_SOURCE_LABEL[item.source] : undefined;

  return (
    <li className="flex items-center gap-3 border-t border-border px-4 py-3 transition-colors first:border-t-0 hover:bg-surface-2/60">
      <Tile item={item} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={`text-[11px] font-semibold uppercase tracking-wide ${typeClass}`}>
            {TYPE_LABEL[item.type]}
          </span>
          <span className="text-xs tabular-nums text-ink-dim">{formatDate(item.upload_date)}</span>
          {externalLabels(item).map((label) => (
            <span key={label} className="rounded-full border border-border px-1.5 text-[11px] text-ink-dim">
              {label}
            </span>
          ))}
        </div>

        {external && (
          <div className="text-[14.5px] leading-snug">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink hover:text-accent hover:underline"
            >
              {titleNode}
            </a>
            <span className="text-xs text-ink-dim">
              {item.duration_seconds ? ` · ${formatDuration(item.duration_seconds)}` : ""} ·{" "}
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent hover:underline">
                האזנה ב{external} ↗
              </a>
              {item.alt_url && item.alt_source && (
                <>
                  {" "}
                  ·{" "}
                  <a
                    href={item.alt_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-accent hover:underline"
                  >
                    {EXTERNAL_SOURCE_LABEL[item.alt_source]} ↗
                  </a>
                </>
              )}
            </span>
          </div>
        )}

        {item.type === "video" && !external && (
          <button
            type="button"
            onClick={() => onOpenVideo?.(item)}
            className="block text-start text-[14.5px] leading-snug text-ink hover:text-accent hover:underline"
          >
            {titleNode}
          </button>
        )}

        {item.type === "pdf" && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-[14.5px] leading-snug text-ink hover:text-accent hover:underline"
          >
            {titleNode}
            {item.pages ? <span className="text-xs text-ink-dim"> · {item.pages} עמ&apos;</span> : null}
          </a>
        )}

        {item.type === "audio" && !external && (
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <span className="text-[14.5px] leading-snug text-ink">
              {titleNode}
              {item.duration_seconds ? (
                <span className="text-xs text-ink-dim"> · {formatDuration(item.duration_seconds)}</span>
              ) : null}
            </span>
            {item.url && (
              <audio controls preload="none" className="h-8 w-full sm:w-64" src={item.url} />
            )}
          </div>
        )}
      </div>
    </li>
  );
}

const SOURCE_OPTIONS = [
  { key: "youtube", label: "YouTube" },
  { key: "drive", label: "Google Drive" },
  { key: "kolhalashon", label: "קול הלשון" },
  { key: "kolbarama", label: "קול ברמה" },
  { key: "site", label: "קבצי האתר" },
] as const;

type SourceKey = (typeof SOURCE_OPTIONS)[number]["key"];

/** Where an item can be listened to / read: a lesson merged from two sites
 * counts for both. */
function itemSources(item: ArchiveItem): SourceKey[] {
  if (item.source === "drive") return ["drive"];
  if (item.source === "kolhalashon")
    return item.alt_source === "kolbarama" ? ["kolhalashon", "kolbarama"] : ["kolhalashon"];
  if (item.source === "kolbarama") return ["kolbarama"];
  // Everything else is a YouTube video or an audio/PDF file uploaded to Blob
  // (scripts/upload-media.mjs).
  return item.type === "video" ? ["youtube"] : ["site"];
}

/** By upload_date (YYYYMMDD), undated items last either way. */
function sortByDate(list: ArchiveItem[], order: "newest" | "oldest"): ArchiveItem[] {
  return [...list].sort((a, b) => {
    if (!a.upload_date || !b.upload_date) return a.upload_date ? -1 : b.upload_date ? 1 : 0;
    const cmp = a.upload_date.localeCompare(b.upload_date);
    return order === "newest" ? -cmp : cmp;
  });
}

type FilterParam = "source" | "sort" | "type" | "cat" | "topic" | "q";

/** Writes filters into the address (defaults left out), so a search can be
 * shared, bookmarked and survives a reload. Filter changes push a history
 * entry so "back" undoes them; typing in the search box only replaces it. */
function updateUrl(changes: Partial<Record<FilterParam, string | null>>, mode: "push" | "replace") {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === undefined || value === "" || value === "all" || (key === "sort" && value === "topic"))
      params.delete(key);
    else params.set(key, value);
  }
  const qs = params.toString();
  const url = qs ? `?${qs}` : window.location.pathname;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

const SELECT_CLASS =
  "rounded-xl border border-border bg-bg px-3 py-2 text-[14px] text-ink outline-none focus:border-accent";

export default function ArchiveBrowser({ items }: { items: ArchiveItem[] }) {
  // Filters live in the address (see updateUrl); only the search text is
  // also kept in state, so typing never waits on a router update.
  const searchParams = useSearchParams();
  const source = oneOf(searchParams.get("source"), ["all", ...SOURCE_OPTIONS.map((o) => o.key)], "all");
  const sort = oneOf(searchParams.get("sort"), ["topic", "newest", "oldest"] as const, "topic");
  const type = oneOf(searchParams.get("type"), ["all", "video", "audio", "pdf"] as const, "all");
  const category = searchParams.get("cat") ?? "all";
  const topic = searchParams.get("topic") ?? "all";
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [pdfViewer, setPdfViewer] = useState<PdfMatch | null>(null);
  const [videoPlayer, setVideoPlayer] = useState<ArchiveItem | null>(null);

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) for (const s of itemSources(item)) counts[s] = (counts[s] ?? 0) + 1;
    return counts;
  }, [items]);

  const sourced = useMemo(
    () => (source === "all" ? items : items.filter((i) => itemSources(i).includes(source))),
    [items, source]
  );

  const scoped = useMemo(
    () => (type === "all" ? sourced : sourced.filter((i) => i.type === type)),
    [sourced, type]
  );

  // Also scoped by the selected category/topic chips, so a search made
  // while e.g. וידאו + חגים + יום כיפור are selected only searches there.
  const categoryTopicScoped = useMemo(() => {
    let list = scoped;
    if (category !== "all") list = list.filter((i) => i.category === category);
    if (topic !== "all") list = list.filter((i) => (i.subcategory ?? "") === topic);
    return list;
  }, [scoped, category, topic]);

  const titleMatches = useMemo(() => {
    const q = query.trim().replace(/\s+/g, " ").toLowerCase();
    if (q.length < 2) return [];
    // Also matches the displayed date (e.g. "2020-12"), the source badges
    // ("קול הלשון", "קול ברמה") and where the lesson is filed ("אמור" finds
    // every lesson under פרשת אמור, even when its title doesn't say so).
    const matches = categoryTopicScoped.filter(
      (i) =>
        (i.type === "video" || i.type === "audio") &&
        (i.title.toLowerCase().includes(q) ||
          formatDate(i.upload_date).includes(q) ||
          externalLabels(i).some((label) => label.includes(q)) ||
          i.category.includes(q) ||
          (i.subcategory ?? "").includes(q))
    );
    return sort === "topic" ? matches : sortByDate(matches, sort);
  }, [categoryTopicScoped, query, sort]);

  const dateSorted = useMemo(
    () => (sort === "topic" ? [] : sortByDate(categoryTopicScoped, sort)),
    [categoryTopicScoped, sort]
  );

  const pdfSearchUrls = useMemo(
    () =>
      new Set(
        categoryTopicScoped
          .filter((i): i is ArchiveItem & { url: string } => i.type === "pdf" && !!i.url)
          .map((i) => i.url)
      ),
    [categoryTopicScoped]
  );

  const byCategory = useMemo(() => groupBy(scoped, (i) => i.category), [scoped]);

  const categories = useMemo(
    () => CATEGORY_ORDER.filter((c) => byCategory[c]?.length),
    [byCategory]
  );

  const activeCategoryItems = category === "all" ? [] : byCategory[category] ?? [];
  const subOrder = category !== "all" ? SUBCATEGORY_ORDER[category] : undefined;
  const bySub = useMemo(() => groupBy(activeCategoryItems, (i) => i.subcategory ?? ""), [activeCategoryItems]);
  const subKeys = Object.keys(bySub);
  const usesTopics = subOrder ? true : subKeys.length > 1 || (subKeys.length === 1 && subKeys[0] !== "");
  const topicOrder = orderSubcategories(subOrder, subKeys);

  const counts = {
    all: sourced.length,
    video: sourced.filter((i) => i.type === "video").length,
    audio: sourced.filter((i) => i.type === "audio").length,
    pdf: sourced.filter((i) => i.type === "pdf").length,
  };

  return (
    <div className="mx-auto max-w-[920px] px-4 pb-10">
      <div className="mb-5 mt-5 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-[var(--shadow-md)] sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="מקור"
            value={source}
            onChange={(e) => {
              updateUrl({ source: e.target.value, cat: null, topic: null }, "push");
            }}
            className={SELECT_CLASS}
          >
            <option value="all">כל המקורות ({items.length})</option>
            {SOURCE_OPTIONS.filter((o) => sourceCounts[o.key]).map((o) => (
              <option key={o.key} value={o.key}>
                {o.label} ({sourceCounts[o.key]})
              </option>
            ))}
          </select>
          <select
            aria-label="מיון"
            value={sort}
            onChange={(e) => updateUrl({ sort: e.target.value }, "push")}
            className={SELECT_CLASS}
          >
            <option value="topic">לפי נושא</option>
            <option value="newest">מהחדש לישן</option>
            <option value="oldest">מהישן לחדש</option>
          </select>
          <div className="relative min-w-[200px] flex-1">
            <svg
              viewBox="0 0 24 24"
              className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="M20 20l-4.3-4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                updateUrl({ q: e.target.value.trim() ? e.target.value : null }, "replace");
              }}
              placeholder="חיפוש לפי כותרת, תאריך או תוכן הספרים..."
              className="w-full rounded-xl border border-border bg-bg px-3.5 py-2 pe-9 text-[14px] text-ink outline-none placeholder:text-ink-dim focus:border-accent"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Chip
            label="הכל"
            count={counts.all}
            active={type === "all"}
            onClick={() => {
              updateUrl({ type: "all", cat: null, topic: null }, "push");
            }}
          />
          <Chip
            label="וידאו"
            count={counts.video}
            active={type === "video"}
            onClick={() => {
              updateUrl({ type: "video", cat: null, topic: null }, "push");
            }}
          />
          <Chip
            label="אודיו"
            count={counts.audio}
            active={type === "audio"}
            variant="audio"
            onClick={() => {
              updateUrl({ type: "audio", cat: null, topic: null }, "push");
            }}
          />
          <Chip
            label="ספרים"
            count={counts.pdf}
            active={type === "pdf"}
            variant="pdf"
            onClick={() => {
              updateUrl({ type: "pdf", cat: null, topic: null }, "push");
            }}
          />
        </div>

        {!query.trim() && (
          <div className="flex flex-wrap gap-2">
            <Chip
              label="הכל"
              count={scoped.length}
              active={category === "all"}
              onClick={() => {
                updateUrl({ cat: null, topic: null }, "push");
              }}
            />
            {categories.map((cat) => (
              <Chip
                key={cat}
                label={cat}
                count={byCategory[cat].length}
                active={category === cat}
                onClick={() => {
                  updateUrl({ cat, topic: null }, "push");
                }}
              />
            ))}
          </div>
        )}

        {!query.trim() && usesTopics && category !== "all" && (
          <div className="flex flex-wrap gap-2">
            <Chip label="הכל" count={activeCategoryItems.length} active={topic === "all"} onClick={() => updateUrl({ topic: null }, "push")} />
            {topicOrder
              .filter((t) => bySub[t]?.length)
              .map((t) => (
                <Chip key={t} label={t} count={bySub[t].length} active={topic === t} onClick={() => updateUrl({ topic: t }, "push")} />
              ))}
          </div>
        )}
      </div>

      {titleMatches.length > 0 && (
        <details open className="mb-4 overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-sm)]">
          <summary className="flex cursor-pointer items-center justify-between gap-2.5 border-b border-border bg-surface-2 px-4.5 py-3.5 [&::-webkit-details-marker]:hidden">
            <h2 className="flex items-center gap-2 text-[19px] font-bold">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />
              וידאו ואודיו עבור &quot;{query.trim()}&quot;
            </h2>
            <span className="whitespace-nowrap text-[13px] tabular-nums text-ink-dim">{titleMatches.length}</span>
          </summary>
          <ul>
            {titleMatches.map((item) => (
              <Row key={item.title + item.upload_date} item={item} query={query} onOpenVideo={setVideoPlayer} />
            ))}
          </ul>
        </details>
      )}

      {type !== "video" && type !== "audio" && (
        <div className="mb-4">
          <PdfSearch query={query} onOpenResult={setPdfViewer} allowedUrls={pdfSearchUrls} />
        </div>
      )}

      <main className="mt-4 flex flex-col gap-4">
        {!query.trim() && sort !== "topic" && dateSorted.length > 0 && (
          <ul className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-sm)]">
            {dateSorted.map((item) => (
              <Row key={item.title + item.upload_date} item={item} onOpenVideo={setVideoPlayer} />
            ))}
          </ul>
        )}

        {!query.trim() &&
          sort === "topic" &&
          (category === "all" ? categories : [category]).map((cat) => {
            const catItems = byCategory[cat];
            if (!catItems?.length) return null;
            const catSubOrder = SUBCATEGORY_ORDER[cat];
            const catBySub = groupBy(catItems, (i) => i.subcategory ?? "");
            const catSubKeys = Object.keys(catBySub);
            const catUsesTopics =
              catSubOrder ? true : catSubKeys.length > 1 || (catSubKeys.length === 1 && catSubKeys[0] !== "");
            const catTopicOrder = orderSubcategories(catSubOrder, catSubKeys);

            const visibleTopic = category === cat ? topic : "all";

            return (
              <details
                key={cat}
                open
                className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-sm)]"
              >
                <summary className="flex cursor-pointer items-baseline justify-between gap-2.5 border-b border-border bg-surface-2 px-4.5 py-3.5 [&::-webkit-details-marker]:hidden">
                  <h2 className="flex items-center gap-2 text-[19px] font-bold">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />
                    {cat}
                  </h2>
                  <span className="whitespace-nowrap text-[13px] tabular-nums text-ink-dim">{catItems.length}</span>
                </summary>

                {catUsesTopics ? (
                  catTopicOrder
                    .filter((sub) => catBySub[sub]?.length)
                    .filter((sub) => visibleTopic === "all" || visibleTopic === sub)
                    .map((sub) => {
                      const rows = catBySub[sub];
                      if (!rows.length) return null;
                      return (
                        <details key={sub} open className="border-b border-border last:border-b-0">
                          <summary className="flex cursor-pointer items-center justify-between gap-2.5 bg-surface-2 px-4.5 py-2.5 text-[14.5px] font-semibold [&::-webkit-details-marker]:hidden">
                            <span className="text-gold">{sub || "כללי"}</span>
                            <span className="text-[12.5px] font-normal tabular-nums text-ink-dim">{rows.length}</span>
                          </summary>
                          <ul>
                            {rows.map((item) => (
                              <Row key={item.title + item.upload_date} item={item} onOpenVideo={setVideoPlayer} />
                            ))}
                          </ul>
                        </details>
                      );
                    })
                ) : (
                  <ul>
                    {catItems.map((item) => (
                      <Row key={item.title + item.upload_date} item={item} onOpenVideo={setVideoPlayer} />
                    ))}
                  </ul>
                )}
              </details>
            );
          })}
      </main>

      <footer className="pt-4 text-center text-xs text-ink-dim">
        קטלוג משולב - וידאו/אודיו/ספרים · אודיו וספרים מתארחים ב-Vercel Blob
      </footer>

      {pdfViewer && (
        <PdfViewer
          url={pdfViewer.url}
          title={pdfViewer.title}
          initialPage={pdfViewer.page}
          query={pdfViewer.words ? pdfViewer.words.join("\n") : pdfViewer.match}
          onClose={() => setPdfViewer(null)}
        />
      )}

      {videoPlayer?.url && (
        <VideoPlayer
          url={videoPlayer.url}
          title={videoPlayer.title}
          onClose={() => setVideoPlayer(null)}
        />
      )}
    </div>
  );
}

"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { ArchiveItem, ArchiveItemType } from "@/types/archive";
import { CATEGORY_ORDER, SUBCATEGORY_ORDER, TYPE_LABEL } from "@/lib/subcategoryOrder";
import { youtubeThumbnail } from "@/lib/youtube";

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

function Tile({ item }: { item: ArchiveItem }) {
  if (item.type === "video") {
    const thumb = youtubeThumbnail(item.url);
    if (thumb) {
      return (
        <span className="relative block h-[45px] w-20 shrink-0 overflow-hidden rounded-md bg-surface-2 sm:h-[50px] sm:w-[88px]">
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
    item.type === "audio" ? "bg-audio-bg text-audio-ink" : "bg-pdf-bg text-pdf-ink";
  return (
    <span
      className={`flex h-[45px] w-20 shrink-0 items-center justify-center rounded-md sm:h-[50px] sm:w-[88px] ${tileClass}`}
    >
      {item.type === "audio" ? <HeadphonesIcon /> : <DocumentIcon />}
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
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors ${
        active
          ? variant === "audio"
            ? "border-audio-ink bg-audio-ink text-white"
            : variant === "pdf"
              ? "border-pdf-ink bg-pdf-ink text-white"
              : "border-accent bg-accent text-accent-ink"
          : "border-border bg-surface text-ink-dim hover:border-accent hover:text-ink"
      }`}
    >
      {label}
      <span className="font-normal opacity-75">{count}</span>
    </button>
  );
}

function Row({ item }: { item: ArchiveItem }) {
  const typeClass =
    item.type === "audio"
      ? "text-audio-ink"
      : item.type === "pdf"
        ? "text-pdf-ink"
        : "text-ink-dim";

  return (
    <li className="flex items-center gap-3 border-t border-border px-4 py-2.5 first:border-t-0">
      <Tile item={item} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={`text-[11px] font-semibold uppercase tracking-wide ${typeClass}`}>
            {TYPE_LABEL[item.type]}
          </span>
          <span className="text-xs tabular-nums text-ink-dim">{formatDate(item.upload_date)}</span>
        </div>

        {item.type === "video" && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-[14.5px] leading-snug text-ink hover:text-accent hover:underline"
          >
            {item.title}
          </a>
        )}

        {item.type === "pdf" && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-[14.5px] leading-snug text-ink hover:text-accent hover:underline"
          >
            {item.title}
            {item.pages ? <span className="text-xs text-ink-dim"> · {item.pages} עמ&apos;</span> : null}
          </a>
        )}

        {item.type === "audio" && (
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <span className="text-[14.5px] leading-snug text-ink">
              {item.title}
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

export default function ArchiveBrowser({ items }: { items: ArchiveItem[] }) {
  const [type, setType] = useState<"all" | ArchiveItemType>("all");
  const [category, setCategory] = useState<string>("all");
  const [topic, setTopic] = useState<string>("all");
  const [query, setQuery] = useState("");

  const scoped = useMemo(
    () => (type === "all" ? items : items.filter((i) => i.type === type)),
    [items, type]
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
  const topicOrder = subOrder ?? subKeys;

  function matchesQuery(item: ArchiveItem) {
    if (!query.trim()) return true;
    return item.title.includes(query.trim());
  }

  const counts = {
    all: items.length,
    video: items.filter((i) => i.type === "video").length,
    audio: items.filter((i) => i.type === "audio").length,
    pdf: items.filter((i) => i.type === "pdf").length,
  };

  return (
    <div className="mx-auto max-w-[920px] px-4 pb-10">
      <p className="py-5 text-[14.5px] text-ink-dim">
        סה&quot;כ <b className="text-ink tabular-nums">{items.length}</b> פריטים (
        {counts.video} וידאו · {counts.audio} אודיו · {counts.pdf} PDF), ממוינים לפי תאריך
        ומקובצים לפי נושא
      </p>

      <div className="sticky top-0 z-10 flex flex-col gap-2.5 border-b border-border bg-bg py-2.5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש לפי כותרת..."
          className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-dim focus:border-accent"
        />

        <div className="flex flex-wrap gap-2">
          <Chip
            label="הכל"
            count={counts.all}
            active={type === "all"}
            onClick={() => {
              setType("all");
              setCategory("all");
              setTopic("all");
            }}
          />
          <Chip
            label="וידאו"
            count={counts.video}
            active={type === "video"}
            onClick={() => {
              setType("video");
              setCategory("all");
              setTopic("all");
            }}
          />
          <Chip
            label="אודיו"
            count={counts.audio}
            active={type === "audio"}
            variant="audio"
            onClick={() => {
              setType("audio");
              setCategory("all");
              setTopic("all");
            }}
          />
          <Chip
            label="PDF"
            count={counts.pdf}
            active={type === "pdf"}
            variant="pdf"
            onClick={() => {
              setType("pdf");
              setCategory("all");
              setTopic("all");
            }}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Chip
            label="הכל"
            count={scoped.length}
            active={category === "all"}
            onClick={() => {
              setCategory("all");
              setTopic("all");
            }}
          />
          {categories.map((cat) => (
            <Chip
              key={cat}
              label={cat}
              count={byCategory[cat].length}
              active={category === cat}
              onClick={() => {
                setCategory(cat);
                setTopic("all");
              }}
            />
          ))}
        </div>

        {usesTopics && category !== "all" && (
          <div className="flex flex-wrap gap-2">
            <Chip label="הכל" count={activeCategoryItems.length} active={topic === "all"} onClick={() => setTopic("all")} />
            {topicOrder
              .filter((t) => bySub[t]?.length)
              .map((t) => (
                <Chip key={t} label={t} count={bySub[t].length} active={topic === t} onClick={() => setTopic(t)} />
              ))}
          </div>
        )}
      </div>

      <main className="mt-4 flex flex-col gap-4">
        {(category === "all" ? categories : [category]).map((cat) => {
          const catItems = byCategory[cat];
          if (!catItems?.length) return null;
          const catSubOrder = SUBCATEGORY_ORDER[cat];
          const catBySub = groupBy(catItems, (i) => i.subcategory ?? "");
          const catSubKeys = Object.keys(catBySub);
          const catUsesTopics =
            catSubOrder ? true : catSubKeys.length > 1 || (catSubKeys.length === 1 && catSubKeys[0] !== "");
          const catTopicOrder = catSubOrder ?? catSubKeys;

          const visibleTopic = category === cat ? topic : "all";

          return (
            <section key={cat} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
              <div className="flex items-baseline justify-between gap-2.5 border-b border-border px-4.5 py-3.5">
                <h2 className="text-[19px] font-bold">{cat}</h2>
                <span className="whitespace-nowrap text-[13px] tabular-nums text-ink-dim">{catItems.length}</span>
              </div>

              {catUsesTopics ? (
                catTopicOrder
                  .filter((sub) => catBySub[sub]?.length)
                  .filter((sub) => visibleTopic === "all" || visibleTopic === sub)
                  .map((sub) => {
                    const rows = catBySub[sub].filter(matchesQuery);
                    if (!rows.length) return null;
                    return (
                      <details key={sub} open className="border-b border-border last:border-b-0">
                        <summary className="flex cursor-pointer items-center justify-between gap-2.5 bg-surface-2 px-4.5 py-2.5 text-[14.5px] font-semibold [&::-webkit-details-marker]:hidden">
                          <span className="text-gold">{sub || "כללי"}</span>
                          <span className="text-[12.5px] font-normal tabular-nums text-ink-dim">{rows.length}</span>
                        </summary>
                        <ul>
                          {rows.map((item) => (
                            <Row key={item.title + item.upload_date} item={item} />
                          ))}
                        </ul>
                      </details>
                    );
                  })
              ) : (
                <ul>
                  {catItems.filter(matchesQuery).map((item) => (
                    <Row key={item.title + item.upload_date} item={item} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </main>

      <footer className="pt-4 text-center text-xs text-ink-dim">
        קטלוג משולב - וידאו/אודיו/PDF · אודיו ו-PDF מתארחים ב-Vercel Blob
      </footer>
    </div>
  );
}

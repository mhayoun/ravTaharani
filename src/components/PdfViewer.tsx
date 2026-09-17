"use client";

import { useEffect } from "react";

interface PdfViewerProps {
  url: string;
  title: string;
  initialPage: number;
  query: string;
  onClose: () => void;
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// The actual PDF rendering lives in a standalone document at /pdf-view,
// loaded here in an <iframe>, rather than rendering pdf.js directly into
// this component's DOM. See src/app/pdf-view/route.ts for why.
export default function PdfViewer({ url, title, initialPage, query, onClose }: PdfViewerProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const src = `/pdf-view?url=${encodeURIComponent(url)}&page=${initialPage}&q=${encodeURIComponent(
    query
  )}&title=${encodeURIComponent(title)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/60 p-3 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-md)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-end border-b border-border bg-surface-2 px-3 py-1.5">
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-2 text-ink-dim transition-colors hover:bg-surface hover:text-ink"
            aria-label="סגור"
          >
            <CloseIcon />
          </button>
        </div>
        <iframe src={src} title={title} className="flex-1 border-0" />
      </div>
    </div>
  );
}

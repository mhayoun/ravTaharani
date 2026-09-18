"use client";

import { useEffect } from "react";
import { youtubeEmbedUrl } from "@/lib/youtube";

interface VideoPlayerProps {
  url: string;
  title: string;
  onClose: () => void;
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// Plain YouTube iframe embed with YouTube's own native controls - no custom
// playback controls and no overlay blocking interaction with it. An
// earlier version tried routing all control through a custom header UI,
// but that broke YouTube's own "sign in to confirm you're not a bot" flow
// on mobile (Google's sign-in screen can't complete inside an iframe and
// navigates the whole tab away when blocked from doing so in place).
export default function VideoPlayer({ url, title, onClose }: VideoPlayerProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const embedSrc = youtubeEmbedUrl(url);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-md)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-2 px-3 py-1.5">
          <span className="truncate text-[13px] font-semibold text-ink">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-2 text-ink-dim transition-colors hover:bg-surface hover:text-ink"
            aria-label="סגור"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="relative aspect-video w-full bg-black">
          {embedSrc ? (
            <iframe
              src={embedSrc}
              title={title}
              className="absolute inset-0 h-full w-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <p className="flex h-full items-center justify-center p-6 text-center text-ink-dim">
              לא ניתן לטעון את הסרטון
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

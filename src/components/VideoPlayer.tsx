"use client";

import { useEffect, useRef, useState } from "react";
import { youtubeVideoId } from "@/lib/youtube";

interface VideoPlayerProps {
  url: string;
  title: string;
  onClose: () => void;
}

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  setVolume(volume: number): void;
  destroy(): void;
}

interface YTPlayerEvent {
  target: YTPlayer;
  data: number;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement,
    config: {
      videoId: string;
      host?: string;
      playerVars?: Record<string, number | string>;
      events?: {
        onReady?: (e: YTPlayerEvent) => void;
        onStateChange?: (e: YTPlayerEvent) => void;
      };
    }
  ) => YTPlayer;
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiLoadPromise: Promise<YTNamespace> | null = null;
function loadYouTubeIframeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiLoadPromise) return apiLoadPromise;
  apiLoadPromise = new Promise((resolve) => {
    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevCallback?.();
      resolve(window.YT!);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
  return apiLoadPromise;
}

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" aria-hidden="true">
      <path
        d="M4 9v6h4l5 4V5L8 9H4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M16.5 8.5a5 5 0 0 1 0 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Plays the video via the YouTube IFrame Player API with controls=0, and a
// transparent overlay blocking all direct interaction with the underlying
// YouTube surface (its own play/pause, related-video screens, logo link,
// etc.) - playback is only controllable through the header's own play,
// seek, and volume controls below.
export default function VideoPlayer({ url, title, onClose }: VideoPlayerProps) {
  const videoId = youtubeVideoId(url);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const seekingRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(100);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!videoId || !containerRef.current) return;
    let destroyed = false;

    loadYouTubeIframeApi().then((YT) => {
      if (destroyed || !containerRef.current) return;
      // Held so cleanup can still call destroy() if unmounted before
      // onReady fires; overwritten with the confirmed-functional reference
      // below once it does.
      playerRef.current = new YT.Player(containerRef.current, {
        videoId,
        host: "https://www.youtube-nocookie.com",
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          // The constructor's synchronous return value isn't reliably the
          // fully-wired player - event.target here is, so capture the
          // usable reference from onReady instead.
          onReady: (e) => {
            if (destroyed) return;
            playerRef.current = e.target;
            setDuration(e.target.getDuration());
            e.target.setVolume(100);
            e.target.playVideo();
          },
          onStateChange: (e) => {
            setPlaying(e.data === YT.PlayerState.PLAYING);
            setDuration(e.target.getDuration());
          },
        },
      });
    });

    const poll = setInterval(() => {
      if (!playerRef.current || seekingRef.current) return;
      try {
        setCurrent(playerRef.current.getCurrentTime());
      } catch {
        // player not fully ready yet - next tick will retry
      }
    }, 500);

    return () => {
      destroyed = true;
      clearInterval(poll);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [videoId]);

  function togglePlay() {
    const p = playerRef.current;
    if (!p) return;
    if (playing) p.pauseVideo();
    else p.playVideo();
  }

  function onSeekInput(e: React.ChangeEvent<HTMLInputElement>) {
    seekingRef.current = true;
    setCurrent(Number(e.target.value));
  }

  function commitSeek(e: React.SyntheticEvent<HTMLInputElement>) {
    playerRef.current?.seekTo(Number(e.currentTarget.value), true);
    seekingRef.current = false;
  }

  function onVolumeInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value);
    setVolume(v);
    playerRef.current?.setVolume(v);
  }

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
        <div className="flex flex-col gap-2 border-b border-border bg-surface-2 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
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

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              className="shrink-0 rounded-full p-1.5 text-ink-dim transition-colors hover:bg-surface hover:text-ink"
              aria-label={playing ? "השהה" : "נגן"}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <span className="w-9 shrink-0 text-[11px] tabular-nums text-ink-dim">
              {formatTime(current)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={1}
              value={current}
              onChange={onSeekInput}
              onMouseUp={commitSeek}
              onTouchEnd={commitSeek}
              className="h-1.5 flex-1 accent-accent"
              aria-label="מיקום בסרטון"
            />
            <span className="w-9 shrink-0 text-[11px] tabular-nums text-ink-dim">
              {formatTime(duration)}
            </span>
          </div>

          <div className="hidden items-center gap-2 ps-9 sm:flex">
            <VolumeIcon />
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={volume}
              onChange={onVolumeInput}
              className="h-1.5 w-full max-w-40 accent-accent"
              aria-label="עוצמת קול"
            />
          </div>
        </div>

        <div className="relative aspect-video w-full bg-black">
          {videoId ? (
            <>
              <div ref={containerRef} className="absolute inset-0 h-full w-full" />
              {/* Blocks all direct interaction with the YouTube player underneath */}
              <div className="absolute inset-0" />
            </>
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

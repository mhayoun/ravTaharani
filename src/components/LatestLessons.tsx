"use client";

import { useState } from "react";
import type { ArchiveItem } from "@/types/archive";
import { Row } from "./ArchiveBrowser";
import VideoPlayer from "./VideoPlayer";

export default function LatestLessons({ items }: { items: ArchiveItem[] }) {
  const [videoPlayer, setVideoPlayer] = useState<ArchiveItem | null>(null);

  return (
    <>
      <ol className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-sm)]">
        {items.map((item) => (
          <Row key={`${item.type}-${item.url ?? item.title}`} item={item} onOpenVideo={setVideoPlayer} />
        ))}
      </ol>

      {videoPlayer?.url && (
        <VideoPlayer url={videoPlayer.url} title={videoPlayer.title} onClose={() => setVideoPlayer(null)} />
      )}
    </>
  );
}

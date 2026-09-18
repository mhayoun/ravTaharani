function extractVideoId(url: string | undefined): string | null {
  if (!url) return null;
  const match = url.match(/[?&]v=([^&]+)/);
  return match ? match[1] : null;
}

export function youtubeThumbnail(url: string | undefined): string | null {
  const id = extractVideoId(url);
  return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null;
}

export function youtubeEmbedUrl(url: string | undefined): string | null {
  const id = extractVideoId(url);
  if (!id) return null;
  // rel=0: related-videos overlay limited to the same channel instead of
  // any video on YouTube. modestbranding=1 + iv_load_policy=3: minimize the
  // YouTube logo/annotations (YouTube doesn't allow fully removing either).
  const params = new URLSearchParams({
    autoplay: "1",
    rel: "0",
    modestbranding: "1",
    iv_load_policy: "3",
  });
  return `https://www.youtube-nocookie.com/embed/${id}?${params}`;
}

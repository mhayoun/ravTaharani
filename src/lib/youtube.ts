export function youtubeVideoId(url: string | undefined): string | null {
  if (!url) return null;
  const match = url.match(/[?&]v=([^&]+)/);
  return match ? match[1] : null;
}

export function youtubeThumbnail(url: string | undefined): string | null {
  const id = youtubeVideoId(url);
  return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null;
}

export function youtubeEmbedUrl(url: string | undefined): string | null {
  const id = youtubeVideoId(url);
  if (!id) return null;
  // Plain youtube.com (not youtube-nocookie.com): the nocookie domain never
  // recognizes the viewer as signed in even if they already are elsewhere,
  // which made YouTube's "sign in to confirm you're not a bot" check show
  // up far more often on mobile. No autoplay either, so the first play is a
  // direct tap on YouTube's own button - a stronger signal to their
  // anti-bot check than a programmatic autoplay request.
  // rel=0: related-videos overlay limited to the same channel instead of
  // any video on YouTube. modestbranding=1 + iv_load_policy=3: minimize the
  // YouTube logo/annotations (YouTube doesn't allow fully removing either).
  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    iv_load_policy: "3",
  });
  return `https://www.youtube.com/embed/${id}?${params}`;
}

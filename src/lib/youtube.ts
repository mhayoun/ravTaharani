export function youtubeVideoId(url: string | undefined): string | null {
  if (!url) return null;
  const match = url.match(/[?&]v=([^&]+)/);
  return match ? match[1] : null;
}

export function youtubeThumbnail(url: string | undefined): string | null {
  const id = youtubeVideoId(url);
  return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null;
}

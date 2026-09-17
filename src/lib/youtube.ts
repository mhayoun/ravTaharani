export function youtubeThumbnail(url: string | undefined): string | null {
  if (!url) return null;
  const match = url.match(/[?&]v=([^&]+)/);
  if (!match) return null;
  return `https://i.ytimg.com/vi/${match[1]}/mqdefault.jpg`;
}

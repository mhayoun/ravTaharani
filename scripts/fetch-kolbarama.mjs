// Fetches the episode list of Rav Avishay Taharani's "אוצר לשבת" radio show
// from kol-barama.co.il into kolbarama_raw.json, which
// import-kolhalashon.mjs turns into archive items (links only - nothing is
// downloaded). The show page holds the first episodes; the rest come from
// the site's own "טען עוד" (load more) request, page by page. Those are the
// site's short items; the show's full broadcasts (untitled, one page each
// with the recording, back to 2019) go to kolbarama_otzar_broadcasts.json.
//
// Also fetches his "הפסק והפוסק" show into kolbarama_hapsak_raw.json: its
// full broadcasts (untitled, one page each with the recording) and the few
// short clips the site cut from it. The site's search by presenter
// (?by_name=16974&post_type=show) lists both.
// Run with: node scripts/fetch-kolbarama.mjs
import { writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const OUT_PATH = path.join(ROOT, "kolbarama_raw.json");
const SHOW_ID = 455;
const SHOW_URL =
  "https://kol-barama.co.il/show/%d7%90%d7%a8%d7%9b%d7%99%d7%95%d7%9f-%d7%aa%d7%95%d7%9b%d7%a0%d7%99%d7%95%d7%aa-%d7%a2%d7%91%d7%a8/%d7%90%d7%95%d7%a6%d7%a8-%d7%9c%d7%a9%d7%91%d7%aa/";
const AJAX_URL = "https://kol-barama.co.il/wp-admin/admin-ajax.php";
const HEADERS = { "User-Agent": "Mozilla/5.0" };
const OTZAR_BROADCASTS_OUT_PATH = path.join(ROOT, "kolbarama_otzar_broadcasts.json");
const HAPSAK_OUT_PATH = path.join(ROOT, "kolbarama_hapsak_raw.json");
const HAPSAK_SHOW_ID = 16974;
const HAPSAK_SEARCH_URL = `https://kol-barama.co.il/?by_name=${HAPSAK_SHOW_ID}&from_date=&to_date=&s=&post_type=show`;

const ITEM_RE =
  /<div class="item-holder[^"]*" data-id="(\d+)"[^>]*data-time="(\d+)">\s*<a href="([^"]+)">[\s\S]*?<h2>([\s\S]*?)<\/h2>(?:[\s\S]*?<h3>([\s\S]*?)<\/h3>)?/g;

function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .trim();
}

function parseItems(html) {
  return [...html.matchAll(ITEM_RE)].map(([, id, time, url, title, description]) => ({
    id: Number(id),
    // Broadcast time; Israel is never far enough from UTC to change the day
    // of these afternoon broadcasts.
    date: new Date(Number(time) * 1000).toISOString().slice(0, 10),
    url,
    title: decodeEntities(title),
    description: decodeEntities(description ?? ""),
  }));
}

const BROADCAST_RE =
  /<div class="past-show post-(\d+)"[\s\S]*?<a href="([^"]+)">\s*<span>[^<]*<\/span>\s*<span>(\d+)\.(\d+)\.(\d+)<\/span>[\s\S]*?<source src="([^"]+)" type="audio\/mpeg">/g;

// The recording's file name starts with the broadcast date ("22.08.21
// הפסק והפוסק.mp3"), which is sometimes days before the page's date (a late
// upload); a file name date far from it is a typo ("1.03.23" on 12.3.2023,
// "06.09.18" on 6.9.2019).
function broadcastDate(pageDate, mp3) {
  const m = decodeURIComponent(mp3.split("/").pop()).match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})\b/);
  if (!m) return pageDate;
  const fileDate = `20${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const days = Math.abs(new Date(fileDate) - new Date(pageDate)) / 86400000;
  return days <= 7 ? fileDate : pageDate;
}

function parseBroadcasts(html) {
  return [...html.matchAll(BROADCAST_RE)].map(([, id, url, day, month, year, mp3]) => ({
    id: Number(id),
    date: broadcastDate(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`, mp3),
    url,
    mp3,
  }));
}

const CLIP_DURATION_RE = /class="item-holder[^"]*" data-id="(\d+)"[\s\S]*?term-icon[^>]*>(\d+):(\d+)</g;

// A show's full broadcasts: the first ones are on its page (firstHtml), the
// rest come from the "טען עוד" request under them.
async function fetchBroadcasts(showId, firstHtml) {
  const broadcasts = parseBroadcasts(firstHtml);
  for (let page = 2; ; page++) {
    await new Promise((r) => setTimeout(r, 1500));
    const more = await fetch(AJAX_URL, {
      method: "POST",
      headers: { ...HEADERS, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        action: "load_more_past_shows",
        paged: String(page),
        data_show_id: String(showId),
      }),
    });
    if (!more.ok) throw new Error(`show ${showId} broadcasts page ${page}: HTTP ${more.status}`);
    const { html: moreHtml, hide_button } = await more.json();
    const found = parseBroadcasts(moreHtml);
    broadcasts.push(...found);
    if (hide_button || !found.length) break;
  }

  // A few broadcasts were posted twice, with the same recording.
  return [...new Map(broadcasts.map((b) => [b.mp3, b])).values()].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

async function fetchHapsak() {
  const res = await fetch(HAPSAK_SEARCH_URL, { headers: HEADERS });
  if (!res.ok) throw new Error(`הפסק והפוסק search page: HTTP ${res.status}`);
  const html = await res.text();
  const durations = new Map(
    [...html.matchAll(CLIP_DURATION_RE)].map(([, id, m, s]) => [Number(id), +m * 60 + +s])
  );
  const clips = parseItems(html).map((c) => ({ ...c, duration_seconds: durations.get(c.id) ?? null }));
  const broadcasts = await fetchBroadcasts(HAPSAK_SHOW_ID, html);
  await writeFile(HAPSAK_OUT_PATH, JSON.stringify({ broadcasts, clips }, null, 2) + "\n", "utf-8");
  console.log(`Wrote ${broadcasts.length} הפסק והפוסק broadcasts and ${clips.length} clips to ${HAPSAK_OUT_PATH}`);
}

async function main() {
  const res = await fetch(SHOW_URL, { headers: HEADERS });
  if (!res.ok) throw new Error(`show page: HTTP ${res.status}`);
  const showHtml = await res.text();
  const items = parseItems(showHtml);

  for (let page = 2; ; page++) {
    await new Promise((r) => setTimeout(r, 1500));
    const more = await fetch(AJAX_URL, {
      method: "POST",
      headers: { ...HEADERS, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        action: "load_more_past_items",
        paged: String(page),
        data_show_id: String(SHOW_ID),
      }),
    });
    if (!more.ok) throw new Error(`load more page ${page}: HTTP ${more.status}`);
    const { html, hide_button } = await more.json();
    const found = parseItems(html);
    items.push(...found);
    if (hide_button || !found.length) break;
  }

  const unique = [...new Map(items.map((i) => [i.id, i])).values()].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const taharani = unique.filter((i) => i.description.includes("טהרני") || i.title.includes("טהרני"));
  await writeFile(OUT_PATH, JSON.stringify(taharani, null, 2) + "\n", "utf-8");
  console.log(`Wrote ${taharani.length} of ${unique.length} episodes to ${OUT_PATH}`);

  const broadcasts = await fetchBroadcasts(SHOW_ID, showHtml);
  await writeFile(OTZAR_BROADCASTS_OUT_PATH, JSON.stringify(broadcasts, null, 2) + "\n", "utf-8");
  console.log(`Wrote ${broadcasts.length} full broadcasts to ${OTZAR_BROADCASTS_OUT_PATH}`);

  await fetchHapsak();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Fetches the episode list of Rav Avishay Taharani's "אוצר לשבת" radio show
// from kol-barama.co.il into kolbarama_raw.json, which
// import-kolhalashon.mjs turns into archive items (links only - nothing is
// downloaded). The show page holds the first episodes; the rest come from
// the site's own "טען עוד" (load more) request, page by page.
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

async function main() {
  const res = await fetch(SHOW_URL, { headers: HEADERS });
  if (!res.ok) throw new Error(`show page: HTTP ${res.status}`);
  const items = parseItems(await res.text());

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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

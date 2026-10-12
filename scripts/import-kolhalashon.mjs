// Converts the Kol Halashon lesson list of Rav Avishay Taharani
// (kolhalashon_raw.json) into archive items (taharani_kolhalashon.json),
// which upload-media.mjs merges into the published archive. Nothing is
// downloaded or re-hosted: each item links to its page on kolhalashon.com.
//
// Also merges the Kol Barama "אוצר לשבת" episodes (kolbarama_raw.json, from
// fetch-kolbarama.mjs): an episode broadcast the same day as a Kol Halashon
// recording is the same lesson, so it only adds its descriptive title and a
// second link to that item; the others become their own items
// (taharani_kolbarama.json). Its full broadcasts
// (kolbarama_otzar_broadcasts.json) are untitled: one already in the archive
// (same date) only adds a second link to a Kol Halashon item that has none;
// the others become items titled by date.
//
// Likewise its "הפסק והפוסק" broadcasts and clips (kolbarama_hapsak_raw.json):
// a broadcast Kol Halashon also has (same date) gets a second link; the rest,
// and the short clips, are added to taharani_kolbarama.json.
//
// kolhalashon.com sits behind a Cloudflare challenge, so the raw list can't
// be fetched from a script. To refresh it, open
// https://www.kolhalashon.com/he/regularSite/ravs/2618 in a browser, run
// this in the devtools console, and save the copied JSON as
// scripts/kolhalashon_raw.json:
//
//   const all = [];
//   for (let from = 0; ; from += 24) {
//     const res = await fetch("/api/Search/WebSite_GetRavShiurim/", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ QueryType: -1, LangID: -1, MasechetID: -1, DafNo: -1,
//         MasechetIDY: -1, DafNoY: -1, MoedID: -1, ParashaID: -1, EnglishDisplay: false,
//         MasechetIDYOz: -1, DafNoYOz: -1, FromRow: from, NumOfRows: 24,
//         PrefferedLanguage: -1, SearchOrder: 7, FiltersArray: [], GeneralID: 2618,
//         CustomBool: false, FilterSwitch: "1".repeat(99), activefilterType: "all" }),
//     });
//     const page = await res.json();
//     all.push(...page.map(({ FileId, TitleHebrew, ShiurDuration, RecordDate,
//       MainTopicHebrew, CatDesc1, CatDesc2, HasVideo }) => ({ FileId, TitleHebrew,
//       ShiurDuration, RecordDate: RecordDate.slice(0, 10), MainTopicHebrew, CatDesc1,
//       CatDesc2, HasVideo })));
//     if (page.length < 24) break;
//     await new Promise((r) => setTimeout(r, 1500)); // the API rate-limits (429)
//   }
//   copy(JSON.stringify(all, null, 2));
//
// Run with: node scripts/import-kolhalashon.mjs
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { HDate, Locale, getSedra, parshiot } from "@hebcal/core";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const RAW_PATH = path.join(ROOT, "kolhalashon_raw.json");
const OUT_PATH = path.join(ROOT, "taharani_kolhalashon.json");
const VIDEOS_PATH = path.join(ROOT, "taharani_videos.json");
const KOLBARAMA_RAW_PATH = path.join(ROOT, "kolbarama_raw.json");
const KOLBARAMA_OUT_PATH = path.join(ROOT, "taharani_kolbarama.json");
const KOLBARAMA_OTZAR_BROADCASTS_PATH = path.join(ROOT, "kolbarama_otzar_broadcasts.json");
const KOLBARAMA_HAPSAK_RAW_PATH = path.join(ROOT, "kolbarama_hapsak_raw.json");

// Kol Halashon's own folder name; the rav-named catch-all folder
// ("הרב אבישי טהרני - הלכה") is replaced by its sub-folder.
function folderOf(raw) {
  return raw.CatDesc1.startsWith("הרב ") ? raw.CatDesc2 : raw.CatDesc1;
}

// Holiday keywords -> the site's חגים subcategories (src/lib/subcategoryOrder.ts).
const HOLIDAY_SUBCATEGORIES = [
  [/חנוכה/, "חנוכה"],
  [/פורים|מגילה|מחצית השקל/, "פורים"],
  [/פסח/, "פסח"],
  [/שבועות/, "שבועות"],
  [/סוכות|לולב|אתרוג|שמחת תורה/, "סוכות"],
  [/ראש השנה|שופר/, "ראש השנה"],
  [/כיפור/, "יום כיפור"],
  [/עשרת ימי תשובה|סליחות/, "ימים נוראים / סליחות"],
  [/בין המצרים|תמוז|באב|חודש אב|תענית|צום/, "בין המצרים ותשעה באב"],
  [/ספירת העומר|ל"?ג בעומר/, 'ספירת העומר / ל"ג בעומר'],
  [/ט"?ו בשבט/, 'ט"ו בשבט'],
];

// hebcal's Hebrew parasha names use short spelling; the site uses full.
const FULL_SPELLING = {
  מצרע: "מצורע",
  קדשים: "קדושים",
  בחקתי: "בחוקותי",
  תצוה: "תצווה",
  בהעלתך: "בהעלותך",
  נצבים: "ניצבים",
};

function parashaName(englishName) {
  const he = Locale.gettext(englishName, "he-x-NoNikud").replace(/־/g, " ");
  return FULL_SPELLING[he] ?? he;
}

// Letters only, without the optional vav/yod of full spelling, so a title's
// "ניצבים" matches hebcal's "נצבים".
function skeleton(text) {
  return text.replace(/[^\u05d0-\u05ea]/g, "").replace(/[וי]/g, "");
}

// The parasha(s) a title names after "פרשת" ("תכנית לפרשת נח",
// "פרשתבהר ...", "פרשת ויקהל פקודי"), as hebcal's English names. Whole
// words are compared, so "צו" doesn't match the start of "צזריע".
function parashotInTitle(title) {
  const at = title.indexOf("פרשת");
  if (at === -1) return [];
  const words = title.slice(at + 4).trim().split(/[\s-]+/).map(skeleton);
  const found = [];
  while (found.length < 2) {
    const next = parshiot
      .map((p) => ({ p, parts: parashaName(p).split(" ").map(skeleton) }))
      .filter(({ parts }) => parts.every((part, i) => words[i] === part))
      .sort((a, b) => b.parts.length - a.parts.length)[0];
    if (!next) break;
    found.push(next.p);
    words.splice(0, next.parts.length);
  }
  return found;
}

// אוצר לשבת is a Friday radio show on the coming Shabbat's parasha: the
// parasha the title names, otherwise the Israel reading of the Shabbat on or
// after the broadcast date. Holiday specials go under "אוצר לחג".
function otzarLeshabbatSubcategory(title, date) {
  if (/לחג|ערב (סוכות|פסח|שמחת תורה)/.test(title)) return "אוצר לחג";
  const named = parashotInTitle(title);
  const namedSubcategory = `פרשת ${named.map(parashaName).join("-")}`;
  if (!date) return named.length ? namedSubcategory : "אוצר לשבת";
  const gregorian = new Date(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8));
  const shabbat = new HDate(gregorian).onOrAfter(6);
  const reading = getSedra(shabbat.getFullYear(), true).lookup(shabbat);
  if (named.length && !named.every((p) => reading.parsha.includes(p))) return namedSubcategory;
  if (reading.chag) return "אוצר לחג";
  return `פרשת ${reading.parsha.map(parashaName).join("-")}`;
}

// Kol Halashon folders -> the site's existing categories.
function classify(raw, title, date) {
  const folder = folderOf(raw);
  if (folder === "אוצר לשבת")
    return { category: "פרשת השבוע", subcategory: otzarLeshabbatSubcategory(title, date) };
  if (folder === "הפסק והפוסק" || folder === "יש דין ויש דיין")
    return { category: "הלכה", subcategory: folder };
  if (folder === "מועדים") {
    const match = HOLIDAY_SUBCATEGORIES.find(([re]) => re.test(title));
    return { category: "חגים", subcategory: match ? match[1] : "מועדים - כללי" };
  }
  if (folder === "שבת") return { category: "שבת", subcategory: null };
  return { category: "הלכה", subcategory: "הלכה - כללי" };
}

function cleanTitle(title) {
  return title
    .replace(/תש--פ/g, 'תש"פ')
    .replace(/תשע--ט/g, 'תשע"ט')
    .replace(/(\S)_(\S)/g, '$1"$2')
    .replace(/\(1\)$/, "")
    .replace(/¤\s*HD$/, "")
    .replace(/\(מתוך שיעורו היומי של הדיין הרב אבישי טהרני שליטא\)/, "(מתוך שיעורו היומי)")
    .replace(/מהדיין הרב אבישי טהרני שליט"?א/, "")
    .replace(/הדיין הרב אבישי טהרני שליט"?א/g, " ")
    .replace(/(עם )?הרב (אבישי )?טהרני( לאתר)?/g, " ")
    .replace(/ לאתר\b/g, "")
    .replace(/¤/g, " - ")
    .replace(/\s+-(\s+-)+\s+/g, " - ")
    .replace(/\s*(,\s*-|-\s*,)\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,-]+|[\s,-]+$/g, "")
    .trim();
}

// The real lesson date is in the title (dd.mm.yy, Gregorian); RecordDate is
// only when Kol Halashon uploaded the file (bulk uploads in 2021-2022).
function dateFromTitle(title) {
  const m = title.match(/(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{2})(?!\d)/);
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), 2000 + Number(m[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2015 || year > 2030) return null;
  return `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

// Hebrew letters only, without the rav's name and the optional vav/yod of
// full spelling (מצוה/מצווה), so the same lesson matches across the two
// sites' punctuation, spacing and spelling.
function lettersOnly(title) {
  return title
    .replace(/(הדיין )?הרב אבישי טהרני( שליט"?א)?/g, "")
    .replace(/[^\u05d0-\u05ea]/g, "")
    .replace(/[וי]/g, "");
}

// Many topical lessons (the "מועדים" folder etc.) are the same recordings as
// YouTube videos already in the archive. Series titles that start with a
// date ("07.02.21 - הפסק והפוסק") are too generic to compare and are kept.
function isOnYoutube(cleanedTitle, youtubeTitles) {
  if (/^\d/.test(cleanedTitle)) return false;
  const key = lettersOnly(cleanedTitle).slice(0, 14);
  return key.length >= 10 && youtubeTitles.some((t) => t.includes(key));
}

function durationSeconds(hms) {
  const [h, m, s] = hms.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

// Kol Barama's episode title without its "האזינו:" / "אוצר לשבת |" /
// rav-name framing, e.g. "האזינו: הרב אבישי טהרני עם עיון עמוק בפרשת לך-לך"
// -> "עיון עמוק בפרשת לך-לך".
function kolbaramaTopic(title) {
  return title
    .replace(/\|\s*הרב אבישי טהרני\.?\s*האזינו$/, "")
    .replace(/^(האזינו|אוצר לשבת|אוצר לחג|הרב אבישי טהרני)\s*[:|]\s*/, "")
    .replace(/^הרב אבישי טהרני (עם )?/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Kol Halashon has a short unrelated clip on some show dates (17.09.21
// "מאזין הרב בוטבול", 5 minutes), so only a full-length program counts as
// the same broadcast.
const MIN_PROGRAM_SECONDS = 10 * 60;

function mergeKolbarama(kolhalashonItems, episodes) {
  const byDate = new Map(
    kolhalashonItems
      .filter(
        (i) =>
          i.category === "פרשת השבוע" &&
          i.upload_date &&
          i.duration_seconds >= MIN_PROGRAM_SECONDS
      )
      .map((i) => [i.upload_date, i])
  );
  const added = [];
  for (const ep of episodes) {
    const date = ep.date.replace(/-/g, "");
    const topic = kolbaramaTopic(ep.title);
    const same = byDate.get(date);
    if (same) {
      same.title = `${same.title} – ${topic}`;
      same.alt_url = ep.url;
      same.alt_source = "kolbarama";
      continue;
    }
    added.push({
      title: `אוצר לשבת – ${topic}`,
      type: "audio",
      source: "kolbarama",
      kolbarama_id: ep.id,
      url: ep.url,
      category: "פרשת השבוע",
      subcategory: otzarLeshabbatSubcategory(ep.title, date),
      upload_date: date,
      date_source: "broadcast",
      duration_seconds: null,
    });
  }
  return added;
}

function mergeKolbaramaOtzarBroadcasts(kolhalashonItems, kolbaramaItems, broadcasts) {
  const kolhalashonByDate = new Map(
    kolhalashonItems
      .filter((i) => i.category === "פרשת השבוע" && i.upload_date)
      .map((i) => [i.upload_date, i])
  );
  const episodeDates = new Set(kolbaramaItems.map((i) => i.upload_date));
  const added = [];
  for (const b of broadcasts) {
    const date = b.date.replace(/-/g, "");
    const same = kolhalashonByDate.get(date);
    if (same) {
      if (!same.alt_url) {
        same.alt_url = b.url;
        same.alt_source = "kolbarama";
      }
      continue;
    }
    if (episodeDates.has(date)) continue;
    const show = /לחג/.test(decodeURIComponent(b.mp3)) ? "אוצר לחג" : "אוצר לשבת";
    const [year, month, day] = b.date.split("-");
    added.push({
      title: `${day}.${month}.${year.slice(2)} - ${show}`,
      type: "audio",
      source: "kolbarama",
      kolbarama_id: b.id,
      url: b.url,
      category: "פרשת השבוע",
      subcategory: otzarLeshabbatSubcategory(show, date),
      upload_date: date,
      date_source: "broadcast",
      duration_seconds: null,
    });
  }
  return added;
}

function mergeKolbaramaHapsak(kolhalashonItems, { broadcasts, clips }) {
  const byDate = new Map(
    kolhalashonItems
      .filter((i) => i.subcategory === "הפסק והפוסק" && i.upload_date)
      .map((i) => [i.upload_date, i])
  );
  const added = [];
  for (const b of broadcasts) {
    const date = b.date.replace(/-/g, "");
    const same = byDate.get(date);
    if (same) {
      same.alt_url = b.url;
      same.alt_source = "kolbarama";
      continue;
    }
    const [year, month, day] = b.date.split("-");
    added.push({
      title: `${day}.${month}.${year.slice(2)} - הפסק והפוסק`,
      type: "audio",
      source: "kolbarama",
      kolbarama_id: b.id,
      url: b.url,
      category: "הלכה",
      subcategory: "הפסק והפוסק",
      upload_date: date,
      date_source: "broadcast",
      duration_seconds: null,
    });
  }
  for (const c of clips) {
    added.push({
      title: `הפסק והפוסק – ${c.title.replace(/\s*•\s*האזינו$/, "").trim()}`,
      type: "audio",
      source: "kolbarama",
      kolbarama_id: c.id,
      url: c.url,
      category: "הלכה",
      subcategory: "הפסק והפוסק",
      upload_date: c.date.replace(/-/g, ""),
      date_source: "broadcast",
      duration_seconds: c.duration_seconds,
    });
  }
  return added;
}

async function main() {
  const raw = JSON.parse(await readFile(RAW_PATH, "utf-8"));
  const youtubeTitles = JSON.parse(await readFile(VIDEOS_PATH, "utf-8")).map((v) =>
    lettersOnly(v.title)
  );

  // Kol Halashon has a few lessons uploaded twice, the copy suffixed "(1)".
  const titles = new Set(raw.map((r) => r.TitleHebrew.trim()));
  const unique = raw.filter((r) => {
    const t = r.TitleHebrew.trim();
    return !(t.endsWith("(1)") && titles.has(t.slice(0, -3).trim()));
  });

  const all = unique.map((r) => {
    const date = dateFromTitle(r.TitleHebrew);
    return {
      title: cleanTitle(r.TitleHebrew),
      type: r.HasVideo ? "video" : "audio",
      source: "kolhalashon",
      kolhalashon_id: r.FileId,
      url: `https://www.kolhalashon.com/he/regularSite/playShiur/${r.FileId}/-1/0/false`,
      ...classify(r, r.TitleHebrew, date),
      upload_date: date,
      date_source: date ? "title" : null,
      duration_seconds: durationSeconds(r.ShiurDuration),
    };
  });
  const items = all.filter((i) => !isOnYoutube(i.title, youtubeTitles));

  const episodes = JSON.parse(await readFile(KOLBARAMA_RAW_PATH, "utf-8"));
  const kolbaramaItems = mergeKolbarama(items, episodes);
  const otzarBroadcasts = JSON.parse(await readFile(KOLBARAMA_OTZAR_BROADCASTS_PATH, "utf-8"));
  const otzarBroadcastItems = mergeKolbaramaOtzarBroadcasts(items, kolbaramaItems, otzarBroadcasts);
  const hapsak = JSON.parse(await readFile(KOLBARAMA_HAPSAK_RAW_PATH, "utf-8"));
  const hapsakItems = mergeKolbaramaHapsak(items, hapsak);

  await writeFile(OUT_PATH, JSON.stringify(items, null, 2) + "\n", "utf-8");
  const undated = items.filter((i) => !i.upload_date).length;
  console.log(
    `Wrote ${items.length} items to ${OUT_PATH} (${raw.length - unique.length} duplicates and ${all.length - items.length} already on YouTube dropped, ${undated} without a date in the title)`
  );
  await writeFile(
    KOLBARAMA_OUT_PATH,
    JSON.stringify([...kolbaramaItems, ...otzarBroadcastItems, ...hapsakItems], null, 2) + "\n",
    "utf-8"
  );
  console.log(
    `Kol Barama: ${episodes.length - kolbaramaItems.length} episodes merged into Kol Halashon items, ${kolbaramaItems.length} written to ${KOLBARAMA_OUT_PATH}`
  );
  console.log(
    `Kol Barama אוצר לשבת broadcasts: ${otzarBroadcasts.length - otzarBroadcastItems.length} already in the archive, ${otzarBroadcastItems.length} added to ${KOLBARAMA_OUT_PATH}`
  );
  const hapsakCount = hapsak.broadcasts.length + hapsak.clips.length;
  console.log(
    `Kol Barama הפסק והפוסק: ${hapsakCount - hapsakItems.length} broadcasts merged into Kol Halashon items, ${hapsakItems.length} added to ${KOLBARAMA_OUT_PATH}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

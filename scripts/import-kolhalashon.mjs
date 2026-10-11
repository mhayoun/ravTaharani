// Converts the Kol Halashon lesson list of Rav Avishay Taharani
// (kolhalashon_raw.json) into archive items (taharani_kolhalashon.json),
// which upload-media.mjs merges into the published archive. Nothing is
// downloaded or re-hosted: each item links to its page on kolhalashon.com.
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
  const words = title.slice(at + 4).trim().split(/\s+/).map(skeleton);
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

  await writeFile(OUT_PATH, JSON.stringify(items, null, 2) + "\n", "utf-8");
  const undated = items.filter((i) => !i.upload_date).length;
  console.log(
    `Wrote ${items.length} items to ${OUT_PATH} (${raw.length - unique.length} duplicates and ${all.length - items.length} already on YouTube dropped, ${undated} without a date in the title)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

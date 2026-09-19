import Link from "next/link";
import Header from "@/components/Header";
import LatestLessons from "@/components/LatestLessons";
import { getArchiveItems } from "@/lib/getArchive";

// Same as the home page: the archive is read from Blob on every request.
export const dynamic = "force-dynamic";

const LATEST_COUNT = 10;

export default async function LatestPage() {
  const items = await getArchiveItems();
  // Lessons only (video + audio; PDFs are books). upload_date is YYYYMMDD, so
  // a string compare sorts chronologically; the stable sort keeps the archive's
  // own order for lessons published the same day.
  const latest = items
    .filter((i) => i.type !== "pdf")
    .sort((a, b) => (b.upload_date ?? "").localeCompare(a.upload_date ?? ""))
    .slice(0, LATEST_COUNT);

  return (
    <>
      <Header />
      <div className="mx-auto max-w-[920px] px-4 py-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[19px] font-bold">{LATEST_COUNT} השיעורים האחרונים</h2>
          <Link href="/" className="text-[13.5px] font-semibold text-accent hover:underline">
            לארכיון המלא
          </Link>
        </div>
        <LatestLessons items={latest} />
      </div>
    </>
  );
}

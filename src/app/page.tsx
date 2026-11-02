import ArchiveBrowser from "@/components/ArchiveBrowser";
import Header from "@/components/Header";
import { getArchiveItems } from "@/lib/getArchive";

// Rendered per request because ArchiveBrowser reads the URL's search params
// (filters). The data itself is the bundled archive.json - new content
// arrives with the redeploy triggered by the daily check's push.
export const dynamic = "force-dynamic";

export default function Home() {
  const archiveData = getArchiveItems();
  return (
    <>
      <Header />
      <ArchiveBrowser items={archiveData} />
    </>
  );
}

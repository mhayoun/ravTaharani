import ArchiveBrowser from "@/components/ArchiveBrowser";
import Header from "@/components/Header";
import { getArchiveItems } from "@/lib/getArchive";

// Content is fetched from Blob on every request (see getArchiveItems), so
// new audio/video published by the ingestion pipeline shows up without a
// code deploy - this page must not be statically cached.
export const dynamic = "force-dynamic";

export default async function Home() {
  const archiveData = await getArchiveItems();
  return (
    <>
      <Header />
      <ArchiveBrowser items={archiveData} />
    </>
  );
}

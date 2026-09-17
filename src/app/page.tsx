import ArchiveBrowser from "@/components/ArchiveBrowser";
import Header from "@/components/Header";
import archiveData from "@/data/archive.json";
import type { ArchiveItem } from "@/types/archive";

export default function Home() {
  return (
    <>
      <Header />
      <ArchiveBrowser items={archiveData as ArchiveItem[]} />
    </>
  );
}

import ArchiveBrowser from "@/components/ArchiveBrowser";
import archiveData from "@/data/archive.json";
import type { ArchiveItem } from "@/types/archive";

export default function Home() {
  return <ArchiveBrowser items={archiveData as ArchiveItem[]} />;
}

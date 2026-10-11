import { redirect } from "next/navigation";

// The former "latest lessons" page; the archive's newest-first sort replaces
// it, so old links land there.
export default function LatestPage() {
  redirect("/?sort=newest");
}

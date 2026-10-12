import { redirect } from "next/navigation";

// The former "latest lessons" page; the archive, sorted newest first by
// default, replaces it, so old links land there.
export default function LatestPage() {
  redirect("/");
}

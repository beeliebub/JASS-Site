import { permanentRedirect } from "next/navigation";

/** Compatibility route for bookmarks and links saved before the Wiki rename. */
export default function LegacyFeaturesPage() {
  permanentRedirect("/wiki");
}

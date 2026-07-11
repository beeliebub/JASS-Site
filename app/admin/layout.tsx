import type { ReactNode } from "react";
import { SiteChrome } from "@/components/pages/site-chrome";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <SiteChrome theme={null} customThemeTokens={null}>{children}</SiteChrome>;
}

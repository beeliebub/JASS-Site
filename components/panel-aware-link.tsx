import type { ComponentProps } from "react";
import Link from "next/link";
import { isPanelPath } from "@/lib/routes";

type PanelAwareLinkProps = Omit<ComponentProps<"a">, "href"> & { href: string };

export function PanelAwareLink({ href, ...props }: PanelAwareLinkProps) {
  if (isPanelPath(href)) return <a href={href} {...props} />;
  return <Link href={href} {...props} />;
}

import type { ComponentType, SVGProps } from "react";
import {
  EfficacyIcon,
  HammerIcon,
  HelpIcon,
  ShieldIcon,
  SlidersIcon,
  TargetIcon,
  TelekinesisIcon,
  TunnellerIcon,
} from "@/components/features/icons";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Maps the stable `Feature.icon` string stored in the DB back to a rendered
 * icon component — JSX can't be persisted, so admins pick from this fixed
 * set. Keep keys in sync with the seed data in prisma/seed.ts.
 */
export const iconRegistry: Record<string, IconComponent> = {
  tunneller: TunnellerIcon,
  efficacy: EfficacyIcon,
  telekinesis: TelekinesisIcon,
  shield: ShieldIcon,
  sliders: SlidersIcon,
  hammer: HammerIcon,
  target: TargetIcon,
  help: HelpIcon,
};

export function resolveFeatureIcon(icon: string): IconComponent {
  return iconRegistry[icon] ?? HelpIcon;
}

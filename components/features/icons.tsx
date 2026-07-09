import type { SVGProps } from "react";

/**
 * Small, abstract line glyphs for the features grid — geometric shapes only,
 * no literal Minecraft block/creeper iconography. All share a common stroke
 * weight and 20x20 viewbox so they sit consistently inside the icon chip.
 */

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  fill: "none",
  "aria-hidden": true,
} as const;

export function TunnellerIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2.5 6.5h4v4h-4z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 6.5h4v4H8z" stroke="currentColor" strokeWidth="1.4" opacity="0.6" />
      <path d="M13.5 6.5h4v4h-4z" stroke="currentColor" strokeWidth="1.4" opacity="0.3" />
      <path d="M8.5 17V13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function EfficacyIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path
        d="M11 2 4.5 11h4L8 18l7.5-9.5h-4L11 2z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TelekinesisIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M9.5 9.5 14 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M10.5 4h4v4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path
        d="M10 2.5 16 5v4.2c0 4-2.6 6.9-6 8.3-3.4-1.4-6-4.3-6-8.3V5l6-2.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M7.3 10 9.2 11.9 12.8 8.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SlidersIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 5.5h12M4 10h12M4 14.5h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.35" />
      <circle cx="7.5" cy="5.5" r="1.6" fill="currentColor" />
      <circle cx="13" cy="10" r="1.6" fill="currentColor" />
      <circle cx="9" cy="14.5" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function HammerIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path
        d="M11.2 3.3 15.7 7.8a1 1 0 0 1 0 1.4l-1 1a1 1 0 0 1-1.4 0l-.6-.6-5.4 5.4a1.5 1.5 0 0 1-2.1-2.1l5.4-5.4-.6-.6a1 1 0 0 1 0-1.4l1-1a1 1 0 0 1 1.4 0Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TargetIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="10" cy="10" r="3.6" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="10" cy="10" r="0.8" fill="currentColor" />
    </svg>
  );
}

export function HelpIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M7.8 8.1c0-1.3 1-2.2 2.3-2.2s2.1.8 2.1 1.9c0 1.5-2 1.6-2 3.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="10" cy="14" r="0.9" fill="currentColor" />
    </svg>
  );
}

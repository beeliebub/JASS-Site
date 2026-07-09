"use client";

import type { ButtonHTMLAttributes } from "react";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
};

function IconButton({ label, className = "", children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-strong text-muted transition hover:border-primary hover:text-primary motion-safe:active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border-strong disabled:hover:text-muted ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function MoveUpButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <IconButton label="Move up" {...props}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="M3 8.5L7 4.5L11 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </IconButton>
  );
}

export function MoveDownButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <IconButton label="Move down" {...props}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="M3 5.5L7 9.5L11 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </IconButton>
  );
}

export function DeleteButton({ label = "Delete", className = "", ...rest }: Partial<IconButtonProps>) {
  return (
    <IconButton
      label={label}
      className={`hover:border-danger hover:text-danger disabled:hover:border-border-strong disabled:hover:text-muted ${className}`}
      {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path
          d="M3 4h8M5.5 4V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1M5 6.5v3.5M9 6.5v3.5M3.75 4l.5 7a1 1 0 0 0 1 .95h3.5a1 1 0 0 0 1-.95l.5-7"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </IconButton>
  );
}

export function AddButton({
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`flex h-10 items-center justify-center gap-1.5 rounded-md border border-dashed border-border-strong px-4 text-sm font-medium text-muted transition hover:border-primary hover:text-primary motion-safe:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      {children}
    </button>
  );
}

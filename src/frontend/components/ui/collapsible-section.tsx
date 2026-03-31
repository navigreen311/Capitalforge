'use client';

import React, { useState, useId } from 'react';

// ─── Chevron icon ─────────────────────────────────────────────────────────────

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`transition-transform duration-200 ease-in-out flex-shrink-0 ${open ? 'rotate-90' : 'rotate-0'}`}
    >
      <path
        d="M4 2.5L7.5 6L4 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── CollapsibleSection ───────────────────────────────────────────────────────

export interface CollapsibleSectionProps {
  /** Section header label — displayed in gold when expanded */
  title: string;
  /** Child nav items */
  children: React.ReactNode;
  /** Whether the section starts open. Defaults to true. */
  defaultOpen?: boolean;
  /** When sidebar is collapsed (icon-only mode), sections stay non-collapsible */
  sidebarExpanded?: boolean;
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  sidebarExpanded = true,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  // In collapsed sidebar mode, always show content (no section header shown)
  if (!sidebarExpanded) {
    return <div className="space-y-0.5">{children}</div>;
  }

  return (
    <div className="space-y-0.5">
      {/* Section header button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={contentId}
        className="
          group w-full flex items-center gap-1.5 px-2 py-1.5
          text-[10px] font-semibold uppercase tracking-widest
          text-brand-gold/80 hover:text-brand-gold
          transition-colors duration-150 select-none
          rounded-md hover:bg-white/5
        "
      >
        <ChevronIcon open={open} />
        <span className="flex-1 text-left truncate">{title}</span>
      </button>

      {/* Animated content region */}
      <div
        id={contentId}
        role="region"
        aria-label={title}
        className="overflow-hidden"
        style={{
          // Inline grid trick: grid-template-rows animates between 0fr and 1fr
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows 220ms ease-in-out',
        }}
      >
        <div className="min-h-0 space-y-0.5">
          {children}
        </div>
      </div>
    </div>
  );
}

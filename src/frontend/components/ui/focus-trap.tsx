'use client';

/**
 * FocusTrap — Focus trap component for modals and dialogs
 *
 * Traps keyboard focus within a container so that Tab / Shift+Tab cycle only
 * through focusable elements inside the trap. Focus is restored to the
 * previously focused element when the trap is released.
 *
 * WCAG 2.1 Success Criteria satisfied:
 *  - 2.1.2 No Keyboard Trap (Level A) — trap is escapable via Escape key
 *  - 2.4.3 Focus Order (Level A)
 *  - 3.2.2 On Input (Level A)
 *
 * Usage:
 *   <FocusTrap active={isOpen} onEscape={() => setIsOpen(false)}>
 *     <dialog>…</dialog>
 *   </FocusTrap>
 */

import React, {
  useRef,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';

// ─── Focusable element selector ───────────────────────────────────────────────

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'details > summary',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
].join(', ');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('inert') && getComputedStyle(el).display !== 'none'
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FocusTrapProps {
  /** Whether the trap is currently active */
  active: boolean;
  children: ReactNode;
  /** Called when the user presses Escape while the trap is active */
  onEscape?: () => void;
  /**
   * Element to return focus to when the trap deactivates.
   * Defaults to the element that was focused when the trap activated.
   */
  returnFocusTo?: HTMLElement | null;
  /**
   * If true, focuses the first focusable child when the trap activates.
   * If false, you must manage initial focus manually.
   * Defaults to true.
   */
  autoFocus?: boolean;
  /** Additional CSS class on the wrapper div */
  className?: string;
}

// ─── FocusTrap ────────────────────────────────────────────────────────────────

export function FocusTrap({
  active,
  children,
  onEscape,
  returnFocusTo,
  autoFocus = true,
  className,
}: FocusTrapProps) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const previousFocus  = useRef<Element | null>(null);

  // ── Activate / deactivate ─────────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;

    // Remember who had focus before we trapped it
    previousFocus.current = document.activeElement;

    if (autoFocus && containerRef.current) {
      const focusable = getFocusableElements(containerRef.current);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        // Fallback: focus the container itself
        containerRef.current.focus();
      }
    }

    return () => {
      // Restore focus on deactivation
      const target = returnFocusTo ?? (previousFocus.current as HTMLElement | null);
      if (target && typeof (target as HTMLElement).focus === 'function') {
        (target as HTMLElement).focus();
      }
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tab key handler ───────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!active || !containerRef.current) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onEscape?.();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusable = getFocusableElements(containerRef.current);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last  = focusable[focusable.length - 1];

      if (e.shiftKey) {
        // Shift+Tab — if we're at the first element, wrap to last
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab — if we're at the last element, wrap to first
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [active, onEscape]
  );

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      // Make container focusable as a fallback when no children are focusable
      tabIndex={-1}
      className={className}
      // Prevent focus from leaving while trap is active via click outside
      aria-modal={active ? 'true' : undefined}
    >
      {children}
    </div>
  );
}

// ─── useFocusTrap hook ────────────────────────────────────────────────────────

/**
 * Lightweight hook alternative to <FocusTrap> for cases where you want to
 * attach focus trapping to an existing element you already control.
 *
 * Returns a ref to attach to your container element.
 *
 * @example
 * const trapRef = useFocusTrap({ active: isOpen, onEscape: () => setIsOpen(false) });
 * return <div ref={trapRef}>…</div>;
 */
export function useFocusTrap({
  active,
  onEscape,
  autoFocus = true,
}: {
  active: boolean;
  onEscape?: () => void;
  autoFocus?: boolean;
}) {
  const containerRef  = useRef<HTMLElement | null>(null);
  const previousFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (!active || !containerRef.current) return;

    previousFocus.current = document.activeElement;

    if (autoFocus) {
      const focusable = getFocusableElements(containerRef.current);
      (focusable[0] ?? containerRef.current).focus();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (!containerRef.current) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onEscape?.();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusable = getFocusableElements(containerRef.current);
      if (!focusable.length) { e.preventDefault(); return; }

      const first = focusable[0];
      const last  = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const target = previousFocus.current as HTMLElement | null;
      if (target?.focus) target.focus();
    };
  }, [active, onEscape, autoFocus]);

  return containerRef;
}

export default FocusTrap;

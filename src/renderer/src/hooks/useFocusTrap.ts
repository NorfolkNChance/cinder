import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(', ');

/**
 * Trap keyboard focus inside `containerRef` while `active` is true.
 *
 * - On activation, focuses the first focusable child (or the container
 *   itself if no children are found).
 * - Tab / Shift+Tab cycle within the container; neither exits it.
 * - On deactivation, returns focus to the element that was focused before
 *   the trap was activated.
 *
 * Usage:
 *   const ref = useRef<HTMLDivElement>(null);
 *   useFocusTrap(ref, isOpen);
 *   return <div ref={ref}>…modal content…</div>
 */
export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  active: boolean,
): void {
  const previouslyFocusedRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!active) {
      // Return focus to the element that was active before the trap opened.
      if (
        previouslyFocusedRef.current &&
        previouslyFocusedRef.current instanceof HTMLElement
      ) {
        previouslyFocusedRef.current.focus();
        previouslyFocusedRef.current = null;
      }
      return;
    }

    // Remember what had focus so we can restore it later.
    previouslyFocusedRef.current = document.activeElement;

    // Move focus into the container on the next frame (lets React finish
    // rendering the modal content before we query focusable children).
    const frameId = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        container.focus();
      }
    });

    return () => cancelAnimationFrame(frameId);
  }, [active, containerRef]);

  useEffect(() => {
    if (!active) return;

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS),
      ).filter((el) => !el.closest('[hidden]'));

      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        // Shift+Tab: wrap from first → last
        if (active === first || active === container) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: wrap from last → first
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [active, containerRef]);
}

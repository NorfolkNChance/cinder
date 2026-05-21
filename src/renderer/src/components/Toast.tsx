import { useEffect } from 'react';
import { useUI } from '../state/ui';

/**
 * Global toast notification bar — mounts once in App.tsx.
 *
 * Reads from the Zustand `toast` slice; the `showToast` action
 * auto-dismisses after 3.5 s. The user can also dismiss manually by
 * clicking the × button.
 *
 * Intentionally simple: one toast at a time, bottom-centre position,
 * two variants (success / error).
 */
export function Toast(): JSX.Element | null {
  const toast = useUI((s) => s.toast);
  const clearToast = useUI((s) => s.clearToast);

  // Dismiss on Escape key when a toast is visible.
  useEffect(() => {
    if (!toast) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') clearToast();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toast, clearToast]);

  if (!toast) return null;

  const isSuccess = toast.kind === 'success';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-lg border px-4 py-3 shadow-xl text-sm font-medium ${
        isSuccess
          ? 'border-emerald-700 bg-emerald-950 text-emerald-300'
          : 'border-red-700 bg-red-950 text-red-300'
      }`}
    >
      <span className="text-base leading-none">
        {isSuccess ? '✓' : '✕'}
      </span>
      <span>{toast.message}</span>
      <button
        onClick={clearToast}
        aria-label="Dismiss notification"
        className="ml-1 opacity-60 hover:opacity-100 transition-opacity"
      >
        ×
      </button>
    </div>
  );
}

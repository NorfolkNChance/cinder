import { useCallback } from 'react';
import { useUpdateStatus } from './useUpdateStatus';

/**
 * Slim banner that appears at the bottom of the screen when an update is
 * available or ready to install. Invisible at all other times.
 *
 * Phases handled:
 *   available   → "Downloading update vX.Y.Z…" (informational)
 *   downloading → same with a progress percentage
 *   ready       → "Update vX.Y.Z ready — Restart to apply" + button
 *   error       → brief error message with a retry link
 *
 * Phases ignored (no UI):
 *   idle / checking / not-available
 *
 * The banner sits above the Toast layer (z-50) at z-40 so it never
 * obscures short-lived toasts.
 */
export function UpdateBanner(): JSX.Element | null {
  const status = useUpdateStatus();

  const install = useCallback(() => {
    void window.api.update.install();
  }, []);

  const retry = useCallback(() => {
    void window.api.update.check();
  }, []);

  if (
    status.phase === 'idle' ||
    status.phase === 'checking' ||
    status.phase === 'not-available'
  ) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-4 border-t border-indigo-800 bg-indigo-950 px-6 py-2.5 text-sm text-indigo-200"
    >
      <BannerContent
        status={status}
        onInstall={install}
        onRetry={retry}
      />
    </div>
  );
}

// ── Inner content ─────────────────────────────────────────────────────────────

function BannerContent({
  status,
  onInstall,
  onRetry,
}: {
  status: ReturnType<typeof useUpdateStatus>;
  onInstall: () => void;
  onRetry: () => void;
}): JSX.Element {
  if (status.phase === 'available') {
    return (
      <>
        <span>
          <span className="mr-2 opacity-60">↓</span>
          Downloading update {status.version}…
        </span>
        <span className="text-xs text-indigo-400">This won't interrupt your work.</span>
      </>
    );
  }

  if (status.phase === 'downloading') {
    return (
      <>
        <span>
          <span className="mr-2 opacity-60">↓</span>
          Downloading update… {status.percent}%
        </span>
        <div className="h-1 w-32 overflow-hidden rounded-full bg-indigo-800">
          <div
            className="h-full rounded-full bg-indigo-400 transition-all duration-300"
            style={{ width: `${status.percent}%` }}
          />
        </div>
      </>
    );
  }

  if (status.phase === 'ready') {
    return (
      <>
        <span>
          <span className="mr-2">✓</span>
          Update {status.version} downloaded and ready.
        </span>
        <button
          onClick={onInstall}
          className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-indigo-950 transition-colors"
        >
          Restart to apply
        </button>
      </>
    );
  }

  if (status.phase === 'error') {
    return (
      <>
        <span className="text-red-300">
          <span className="mr-2">⚠</span>
          Update failed: {status.message}
        </span>
        <button
          onClick={onRetry}
          className="text-xs text-indigo-400 underline hover:text-indigo-200"
        >
          Try again
        </button>
      </>
    );
  }

  return <></>;
}

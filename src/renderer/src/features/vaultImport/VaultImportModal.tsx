import { useState, useEffect, useCallback, useRef } from 'react';
import clsx from 'clsx';
import { useUI } from '../../state/ui';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-client';
import type {
  VaultScanResult,
  VaultImportOptions,
  VaultImportResult,
  VaultProgress,
} from '../../../../shared/schemas/vault';

/**
 * Obsidian Vault Import modal.
 *
 * Four sequential phases rendered inside a single modal:
 *
 *   1. idle      → "Choose Vault" prompt
 *   2. scanning  → spinner while vault:scan runs
 *   3. preview   → two-panel layout: options (left) + scan result tree (right)
 *   4. importing → progress bars for notes and daily notes
 *   5. done      → summary of what was imported
 *
 * No database writes occur until the user clicks "Import" in the preview phase.
 */

// ── Types ────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'scanning' | 'preview' | 'importing' | 'done';

const DEFAULT_OPTIONS: VaultImportOptions = {
  wikiLinks: 'plain-text',
  folderPrefix: 'top-level',
  dailyNotesFolder: 'Daily Notes',
};

// ── Main component ────────────────────────────────────────────────────────────

export function VaultImportModal(): JSX.Element | null {
  const isOpen = useUI((s) => s.vaultImportOpen);
  const close = useUI((s) => s.closeVaultImport);
  const qc = useQueryClient();

  const [phase, setPhase] = useState<Phase>('idle');
  const [options, setOptions] = useState<VaultImportOptions>(DEFAULT_OPTIONS);
  const [scanResult, setScanResult] = useState<VaultScanResult | null>(null);
  const [importResult, setImportResult] = useState<VaultImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Progress state for the importing phase.
  const [noteProgress, setNoteProgress] = useState({ current: 0, total: 0 });
  const [dailyProgress, setDailyProgress] = useState({ current: 0, total: 0 });

  // Subscribe to vault progress push events.
  const progressUnsubRef = useRef<(() => void) | null>(null);

  // Reset on open.
  useEffect(() => {
    if (isOpen) {
      setPhase('idle');
      setOptions(DEFAULT_OPTIONS);
      setScanResult(null);
      setImportResult(null);
      setError(null);
      setNoteProgress({ current: 0, total: 0 });
      setDailyProgress({ current: 0, total: 0 });
    } else {
      // Clean up progress subscription on close.
      progressUnsubRef.current?.();
      progressUnsubRef.current = null;
    }
  }, [isOpen]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const pickAndScan = useCallback(async () => {
    setError(null);
    const vaultPath = await window.api.vault.pickFolder();
    if (!vaultPath) return; // cancelled

    setPhase('scanning');
    try {
      const result = await window.api.vault.scan({
        vaultPath,
        dailyNotesFolder: options.dailyNotesFolder,
      });
      setScanResult(result);
      setPhase('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('idle');
    }
  }, [options.dailyNotesFolder]);

  // Re-scan when the daily notes folder option changes.
  const rescan = useCallback(async (newDailyFolder: string) => {
    if (!scanResult) return;
    setError(null);
    setPhase('scanning');
    try {
      const result = await window.api.vault.scan({
        vaultPath: scanResult.vaultPath,
        dailyNotesFolder: newDailyFolder,
      });
      setScanResult(result);
      setPhase('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('preview');
    }
  }, [scanResult]);

  const handleImport = useCallback(async () => {
    if (!scanResult) return;

    setPhase('importing');
    setNoteProgress({ current: 0, total: scanResult.notes.length });
    setDailyProgress({ current: 0, total: scanResult.dailyNotes.length });

    // Subscribe to progress events.
    progressUnsubRef.current = window.api.vault.onProgress(
      (progress: VaultProgress) => {
        if (progress.phase === 'notes') {
          setNoteProgress({ current: progress.current, total: progress.total });
        } else if (progress.phase === 'daily-notes') {
          setDailyProgress({ current: progress.current, total: progress.total });
        }
      },
    );

    try {
      const result = await window.api.vault.import({
        vaultPath: scanResult.vaultPath,
        noteRelativePaths: scanResult.notes.map((n) => n.relativePath),
        dailyNoteRelativePaths: scanResult.dailyNotes.map((n) => n.relativePath),
        options,
      });
      setImportResult(result);
      setPhase('done');

      // Invalidate note caches so the sidebar refreshes.
      void qc.invalidateQueries({ queryKey: queryKeys.notes.all });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('preview');
    } finally {
      progressUnsubRef.current?.();
      progressUnsubRef.current = null;
    }
  }, [scanResult, options, qc]);

  const handleClose = useCallback(() => {
    progressUnsubRef.current?.();
    progressUnsubRef.current = null;
    close();
  }, [close]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/[0.65]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && phase !== 'importing') handleClose();
      }}
    >
      <div className="flex w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-gray-300 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-950"
        style={{ maxHeight: '85vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Import Obsidian Vault
            </h2>
            {scanResult && phase !== 'idle' && phase !== 'scanning' && (
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-500 truncate max-w-lg">
                {scanResult.vaultPath}
              </p>
            )}
          </div>
          <button
            onClick={handleClose}
            disabled={phase === 'importing'}
            aria-label="Close"
            className="rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-40 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-auto">
          {phase === 'idle' && (
            <IdlePhase onPick={pickAndScan} error={error} />
          )}
          {phase === 'scanning' && <ScanningPhase />}
          {(phase === 'preview') && scanResult && (
            <PreviewPhase
              scanResult={scanResult}
              options={options}
              onOptionsChange={(patch) => {
                const next = { ...options, ...patch };
                setOptions(next);
                if (patch.dailyNotesFolder !== undefined &&
                    patch.dailyNotesFolder !== options.dailyNotesFolder) {
                  void rescan(patch.dailyNotesFolder);
                }
              }}
              onChangePath={pickAndScan}
            />
          )}
          {phase === 'importing' && (
            <ImportingPhase
              noteProgress={noteProgress}
              dailyProgress={dailyProgress}
            />
          )}
          {phase === 'done' && importResult && (
            <DonePhase result={importResult} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <button
            onClick={handleClose}
            disabled={phase === 'importing'}
            className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-200"
          >
            {phase === 'done' ? 'Close' : 'Cancel'}
          </button>

          {phase === 'preview' && scanResult && (
            <button
              onClick={() => void handleImport()}
              disabled={scanResult.notes.length === 0 && scanResult.dailyNotes.length === 0}
              className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            >
              Import {scanResult.notes.length + scanResult.dailyNotes.length} items →
            </button>
          )}

          {phase === 'idle' && (
            <button
              onClick={() => void pickAndScan()}
              className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              Choose Vault…
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Phase components ──────────────────────────────────────────────────────────

function IdlePhase({
  onPick,
  error,
}: {
  onPick: () => void;
  error: string | null;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-8 py-16 text-center">
      <span className="text-5xl">🗂️</span>
      <div>
        <p className="text-base font-semibold text-gray-800 dark:text-gray-200">
          Import your Obsidian vault into Cinder
        </p>
        <p className="mt-1 text-sm text-gray-500">
          Notes, daily notes, and folder structure will be imported.
          You&apos;ll see a full preview before anything is written.
        </p>
      </div>
      {error && (
        <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </p>
      )}
      <button
        onClick={onPick}
        className="rounded-md bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        Choose Vault Folder…
      </button>
    </div>
  );
}

function ScanningPhase(): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-8 py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-emerald-500" />
      <p className="text-sm text-gray-500">Scanning vault…</p>
    </div>
  );
}

function PreviewPhase({
  scanResult,
  options,
  onOptionsChange,
  onChangePath,
}: {
  scanResult: VaultScanResult;
  options: VaultImportOptions;
  onOptionsChange: (patch: Partial<VaultImportOptions>) => void;
  onChangePath: () => void;
}): JSX.Element {
  const totalWikiLinks = [...scanResult.notes, ...scanResult.dailyNotes].reduce(
    (sum, n) => sum + n.wikiLinkCount,
    0,
  );

  const dateRange =
    scanResult.dailyNotes.length > 0
      ? `${scanResult.dailyNotes[0]?.date ?? ''} → ${scanResult.dailyNotes[scanResult.dailyNotes.length - 1]?.date ?? ''}`
      : null;

  return (
    <div className="flex min-h-0 h-full" style={{ minHeight: '400px' }}>
      {/* Left: options */}
      <div className="w-64 shrink-0 overflow-y-auto border-r border-gray-200 p-5 dark:border-gray-800">
        <Section title="Vault">
          <button
            onClick={onChangePath}
            className="w-full rounded border border-gray-300 px-3 py-1.5 text-left text-xs text-gray-600 hover:border-gray-400 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600"
          >
            Change vault…
          </button>
        </Section>

        <Section title="Daily notes folder">
          <input
            type="text"
            value={options.dailyNotesFolder}
            onChange={(e) => onOptionsChange({ dailyNotesFolder: e.target.value })}
            onBlur={(e) => {
              if (e.target.value !== options.dailyNotesFolder) {
                onOptionsChange({ dailyNotesFolder: e.target.value });
              }
            }}
            placeholder="Daily Notes"
            className="w-full rounded border border-gray-300 bg-transparent px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:text-gray-300"
          />
          <p className="mt-1 text-[10px] text-gray-400">
            Folder name relative to vault root
          </p>
        </Section>

        <Section title="Wiki links [[…]]">
          <RadioGroup
            value={options.wikiLinks}
            onChange={(v) => onOptionsChange({ wikiLinks: v as VaultImportOptions['wikiLinks'] })}
            options={[
              { value: 'plain-text', label: 'Convert to plain text' },
              { value: 'leave-as-is', label: 'Leave as [[…]]' },
            ]}
          />
        </Section>

        <Section title="Folder prefix">
          <RadioGroup
            value={options.folderPrefix}
            onChange={(v) => onOptionsChange({ folderPrefix: v as VaultImportOptions['folderPrefix'] })}
            options={[
              { value: 'top-level', label: 'Top-level only', hint: 'Projects / Note' },
              { value: 'full-path', label: 'Full path', hint: 'Projects/Work / Note' },
              { value: 'none', label: 'None', hint: 'Note' },
            ]}
          />
        </Section>
      </div>

      {/* Right: preview tree */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* Summary chips */}
        <div className="mb-5 flex flex-wrap gap-3">
          <StatChip icon="📝" label="Notes" value={scanResult.notes.length} color="blue" />
          <StatChip icon="📅" label="Daily notes" value={scanResult.dailyNotes.length} color="emerald" />
          <StatChip icon="📎" label="Attachments" value={scanResult.attachments.length} color="gray" />
          <StatChip icon="⏭" label="Skipped" value={scanResult.skipped.length} color="gray" />
        </div>

        {/* Notes tree */}
        {scanResult.notes.length > 0 && (
          <div className="mb-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500">
              Notes ({scanResult.notes.length})
            </h3>
            <NoteTree notes={scanResult.notes} options={options} />
          </div>
        )}

        {/* Daily notes */}
        {scanResult.dailyNotes.length > 0 && (
          <div className="mb-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500">
              Daily Notes ({scanResult.dailyNotes.length})
            </h3>
            {dateRange && (
              <p className="mb-2 text-xs text-gray-500">
                Date range: {dateRange}
              </p>
            )}
            <div className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
              {scanResult.dailyNotes.slice(0, 5).map((n) => (
                <div key={n.relativePath} className="flex items-center gap-2 py-0.5 text-xs text-gray-600 dark:text-gray-400">
                  <span className="text-gray-400">📅</span>
                  <span className="font-mono">{n.date}</span>
                  <span className="text-gray-400">·</span>
                  <span className="truncate">{n.title}</span>
                </div>
              ))}
              {scanResult.dailyNotes.length > 5 && (
                <p className="pt-1 text-[11px] text-gray-400">
                  … and {scanResult.dailyNotes.length - 5} more
                </p>
              )}
            </div>
          </div>
        )}

        {/* Warnings */}
        {(totalWikiLinks > 0 || scanResult.skipped.length > 0) && (
          <div className="mb-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500">
              Warnings
            </h3>
            <div className="space-y-1.5">
              {totalWikiLinks > 0 && (
                <Warning>
                  {totalWikiLinks} wiki link{totalWikiLinks !== 1 ? 's' : ''} found
                  {options.wikiLinks === 'plain-text'
                    ? ' — will be converted to plain text'
                    : ' — will be left as [[…]]'}
                </Warning>
              )}
              {scanResult.skipped.map((s) => (
                <Warning key={s.relativePath}>
                  Skipped: <span className="font-mono">{s.relativePath}</span> — {s.reason}
                </Warning>
              ))}
            </div>
          </div>
        )}

        {scanResult.notes.length === 0 && scanResult.dailyNotes.length === 0 && (
          <p className="text-sm text-gray-500">
            No importable notes found. Check that the vault path is correct and
            the daily notes folder name matches your Obsidian setting.
          </p>
        )}
      </div>
    </div>
  );
}

function ImportingPhase({
  noteProgress,
  dailyProgress,
}: {
  noteProgress: { current: number; total: number };
  dailyProgress: { current: number; total: number };
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-6 px-8 py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-emerald-500" />
      <div className="w-full max-w-md space-y-4">
        <ProgressRow
          label="Notes"
          current={noteProgress.current}
          total={noteProgress.total}
        />
        <ProgressRow
          label="Daily notes"
          current={dailyProgress.current}
          total={dailyProgress.total}
        />
      </div>
      <p className="text-xs text-gray-500">Please wait — do not close the app.</p>
    </div>
  );
}

function DonePhase({ result }: { result: VaultImportResult }): JSX.Element {
  const total = result.notesCreated + result.dailyNotesCreated;
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-8 py-16 text-center">
      <span className="text-5xl">✅</span>
      <div>
        <p className="text-base font-semibold text-gray-800 dark:text-gray-200">
          Import complete
        </p>
        <p className="mt-1 text-sm text-gray-500">
          {result.notesCreated} note{result.notesCreated !== 1 ? 's' : ''} and{' '}
          {result.dailyNotesCreated} daily note{result.dailyNotesCreated !== 1 ? 's' : ''} imported
          ({total} total).
        </p>
      </div>
      {result.errors.length > 0 && (
        <div className="w-full max-w-md rounded-md bg-red-50 p-3 text-left dark:bg-red-950/30">
          <p className="mb-1 text-xs font-semibold text-red-600 dark:text-red-400">
            {result.errors.length} error{result.errors.length !== 1 ? 's' : ''}
          </p>
          <ul className="space-y-0.5 text-xs text-red-500 dark:text-red-400">
            {result.errors.slice(0, 10).map((e, i) => (
              <li key={i} className="truncate">· {e}</li>
            ))}
            {result.errors.length > 10 && (
              <li>· … and {result.errors.length - 10} more</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="mb-5">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500">
        {title}
      </p>
      {children}
    </div>
  );
}

function RadioGroup({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; hint?: string }[];
}): JSX.Element {
  return (
    <div className="space-y-1.5">
      {options.map((opt) => (
        <label key={opt.value} className="flex cursor-pointer items-start gap-2">
          <input
            type="radio"
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="mt-0.5 accent-emerald-500"
          />
          <span>
            <span className="text-xs text-gray-700 dark:text-gray-300">{opt.label}</span>
            {opt.hint && (
              <span className="ml-1 text-[10px] text-gray-400 dark:text-gray-600">
                ({opt.hint})
              </span>
            )}
          </span>
        </label>
      ))}
    </div>
  );
}

function StatChip({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: number;
  color: 'blue' | 'emerald' | 'gray';
}): JSX.Element {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    gray: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };
  return (
    <div className={clsx('flex items-center gap-2 rounded-lg px-3 py-2', colors[color])}>
      <span>{icon}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
      <span className="text-xs">{label}</span>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
      <span className="shrink-0">⚠</span>
      <span>{children}</span>
    </p>
  );
}

function ProgressRow({
  label,
  current,
  total,
}: {
  label: string;
  current: number;
  total: number;
}): JSX.Element {
  const pct = total === 0 ? 0 : Math.round((current / total) * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
        <span>{label}</span>
        <span className="tabular-nums">{current} / {total}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Note tree (collapsible folder structure) ──────────────────────────────────

interface FolderNode {
  name: string;
  notes: Array<{ title: string; wikiLinkCount: number; folderPath: string }>;
  children: Map<string, FolderNode>;
}

function buildFolderTree(
  notes: VaultScanResult['notes'],
  folderPrefix: VaultImportOptions['folderPrefix'],
): FolderNode {
  const root: FolderNode = { name: '', notes: [], children: new Map() };

  for (const note of notes) {
    const parts = note.relativePath.replace(/\\/g, '/').split('/');
    const folderParts = parts.slice(0, -1); // everything except filename
    const rawTitle = note.title;

    // Build the display title according to the prefix strategy.
    const dir = folderParts.join('/');
    let displayTitle = rawTitle;
    if (dir) {
      if (folderPrefix === 'top-level') {
        displayTitle = `${folderParts[0]} / ${rawTitle}`;
      } else if (folderPrefix === 'full-path') {
        displayTitle = `${dir} / ${rawTitle}`;
      }
    }

    // Insert into tree.
    let node = root;
    for (const part of folderParts) {
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, notes: [], children: new Map() });
      }
      node = node.children.get(part)!;
    }
    node.notes.push({ title: displayTitle, wikiLinkCount: note.wikiLinkCount, folderPath: dir });
  }

  return root;
}

function NoteTree({
  notes,
  options,
}: {
  notes: VaultScanResult['notes'];
  options: VaultImportOptions;
}): JSX.Element {
  const tree = buildFolderTree(notes, options.folderPrefix);
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800">
      <FolderNodeView node={tree} depth={0} isRoot />
    </div>
  );
}

function FolderNodeView({
  node,
  depth,
  isRoot = false,
}: {
  node: FolderNode;
  depth: number;
  isRoot?: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.size > 0;
  const childEntries = [...node.children.entries()];

  return (
    <div>
      {/* Folder row (not shown for root) */}
      {!isRoot && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-900"
          style={{ paddingLeft: `${12 + depth * 12}px` }}
        >
          <span className={clsx('transition-transform text-gray-400', open ? 'rotate-90' : '')} aria-hidden>▶</span>
          <span>📁</span>
          <span>{node.name}</span>
          <span className="ml-auto text-[10px] text-gray-400">
            {node.notes.length + countDescendantNotes(node)} notes
          </span>
        </button>
      )}

      {/* Contents */}
      {(isRoot || open) && (
        <>
          {node.notes.map((note, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-1 text-xs text-gray-600 dark:text-gray-400"
              style={{ paddingLeft: `${(isRoot ? 0 : 1) * 12 + 12 + (depth + (isRoot ? 0 : 1)) * 12}px` }}
            >
              <span className="text-gray-400">·</span>
              <span className="truncate">{note.title}</span>
              {note.wikiLinkCount > 0 && (
                <span className="ml-auto shrink-0 text-[10px] text-amber-500">
                  {note.wikiLinkCount} links
                </span>
              )}
            </div>
          ))}
          {hasChildren && childEntries.map(([key, child]) => (
            <FolderNodeView key={key} node={child} depth={depth + (isRoot ? 0 : 1)} />
          ))}
        </>
      )}
    </div>
  );
}

function countDescendantNotes(node: FolderNode): number {
  let count = 0;
  for (const child of node.children.values()) {
    count += child.notes.length + countDescendantNotes(child);
  }
  return count;
}

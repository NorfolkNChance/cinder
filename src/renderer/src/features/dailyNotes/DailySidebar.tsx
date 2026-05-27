import { useState, useMemo } from 'react';
import clsx from 'clsx';
import { useUI } from '../../state/ui';
import { useDailyNotesList, useGetOrCreateDaily } from '../notes/queries';
import type { Note } from '../../../../shared/schemas/notes';

/**
 * Sidebar panel for Daily Notes mode.
 *
 * Layout:
 *   ┌──────────────────────────┐
 *   │ [Today →]                │  ← always visible
 *   ├──────────────────────────┤
 *   │ ▼ 2026                   │  ← year group (collapsible)
 *   │   ▼ May                  │  ← month group (collapsible)
 *   │     ● 27 Tue  ← selected │
 *   │       26 Mon             │
 *   │   ▶ April                │
 *   │ ▶ 2025                   │
 *   └──────────────────────────┘
 *
 * Only dates with an existing note are shown. Navigating to "Today" (or any
 * date) creates the note on demand via getOrCreateDaily.
 */

interface DayEntry {
  date: string; // YYYY-MM-DD
  noteId: string;
  day: number;
  weekday: string; // "Tue"
}

interface MonthEntry {
  monthKey: string; // "YYYY-MM"
  monthLabel: string; // "May"
  days: DayEntry[];
}

interface YearEntry {
  year: string; // "2026"
  months: MonthEntry[];
}

/** Return today's date as YYYY-MM-DD using the local clock. */
function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function buildTree(notes: readonly Note[]): YearEntry[] {
  // Group notes by year → month → day (descending order throughout).
  const yearMap = new Map<string, Map<string, DayEntry[]>>();

  for (const note of notes) {
    const date = note.dailyDate;
    if (!date) continue;

    const [yearStr, monthStr, dayStr] = date.split('-');
    if (!yearStr || !monthStr || !dayStr) continue;

    const monthKey = `${yearStr}-${monthStr}`;

    if (!yearMap.has(yearStr)) yearMap.set(yearStr, new Map());
    const monthMap = yearMap.get(yearStr)!;
    if (!monthMap.has(monthKey)) monthMap.set(monthKey, []);

    // Parse noon-local to avoid timezone off-by-one.
    const d = new Date(`${date}T12:00:00`);
    monthMap.get(monthKey)!.push({
      date,
      noteId: note.id,
      day: parseInt(dayStr, 10),
      weekday: WEEKDAY_SHORT[d.getDay()] ?? '',
    });
  }

  // Sort: most-recent year first, most-recent month first, most-recent day first.
  const years: YearEntry[] = [];
  const sortedYears = [...yearMap.keys()].sort((a, b) => b.localeCompare(a));

  for (const year of sortedYears) {
    const monthMap = yearMap.get(year)!;
    const sortedMonthKeys = [...monthMap.keys()].sort((a, b) => b.localeCompare(a));
    const months: MonthEntry[] = [];

    for (const monthKey of sortedMonthKeys) {
      const days = monthMap.get(monthKey)!;
      days.sort((a, b) => b.day - a.day);

      const monthNum = parseInt(monthKey.split('-')[1] ?? '1', 10);
      months.push({
        monthKey,
        monthLabel: MONTH_NAMES[monthNum - 1] ?? monthKey,
        days,
      });
    }

    years.push({ year, months });
  }

  return years;
}

export function DailySidebar(): JSX.Element {
  const { data: dailyNotes } = useDailyNotesList();
  const getOrCreate = useGetOrCreateDaily();
  const setSelectedNoteId = useUI((s) => s.setSelectedNoteId);
  const setSelectedDailyDate = useUI((s) => s.setSelectedDailyDate);
  const selectedDailyDate = useUI((s) => s.selectedDailyDate);

  const tree = useMemo(
    () => buildTree(dailyNotes ?? []),
    [dailyNotes],
  );

  // Default: most-recent year + month open; all others collapsed.
  const defaultOpenYear = tree[0]?.year ?? null;
  const defaultOpenMonth = tree[0]?.months[0]?.monthKey ?? null;
  const [openYears, setOpenYears] = useState<Set<string>>(
    () => new Set(defaultOpenYear ? [defaultOpenYear] : []),
  );
  const [openMonths, setOpenMonths] = useState<Set<string>>(
    () => new Set(defaultOpenMonth ? [defaultOpenMonth] : []),
  );

  function toggleYear(year: string): void {
    setOpenYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }

  function toggleMonth(monthKey: string): void {
    setOpenMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) next.delete(monthKey);
      else next.add(monthKey);
      return next;
    });
  }

  function openDate(date: string): void {
    getOrCreate.mutate(date, {
      onSuccess: (note) => {
        setSelectedNoteId(note.id);
        setSelectedDailyDate(date);
      },
    });
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Today button */}
      <div className="border-b border-gray-200 p-3 dark:border-gray-800">
        <button
          onClick={() => openDate(todayLocal())}
          disabled={getOrCreate.isPending}
          className="flex w-full items-center justify-between rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
        >
          <span>Today</span>
          <span aria-hidden>→</span>
        </button>
      </div>

      {/* Year / month / day tree */}
      <nav
        aria-label="Daily notes tree"
        className="flex-1 overflow-y-auto py-2"
      >
        {tree.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-600">
            No daily notes yet.
            <br />
            Click &ldquo;Today&rdquo; to create your first one.
          </p>
        )}

        {tree.map((yearEntry) => (
          <div key={yearEntry.year}>
            {/* Year row */}
            <button
              onClick={() => toggleYear(yearEntry.year)}
              aria-expanded={openYears.has(yearEntry.year)}
              className="flex w-full items-center gap-1 px-3 py-1 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500 dark:text-gray-500 dark:hover:text-gray-300"
            >
              <span
                className={clsx(
                  'transition-transform',
                  openYears.has(yearEntry.year) ? 'rotate-90' : '',
                )}
                aria-hidden
              >
                ▶
              </span>
              {yearEntry.year}
            </button>

            {openYears.has(yearEntry.year) &&
              yearEntry.months.map((monthEntry) => (
                <div key={monthEntry.monthKey}>
                  {/* Month row */}
                  <button
                    onClick={() => toggleMonth(monthEntry.monthKey)}
                    aria-expanded={openMonths.has(monthEntry.monthKey)}
                    className="flex w-full items-center gap-1 py-1 pl-6 pr-3 text-left text-xs font-medium text-gray-600 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    <span
                      className={clsx(
                        'transition-transform',
                        openMonths.has(monthEntry.monthKey) ? 'rotate-90' : '',
                      )}
                      aria-hidden
                    >
                      ▶
                    </span>
                    {monthEntry.monthLabel}
                  </button>

                  {openMonths.has(monthEntry.monthKey) &&
                    monthEntry.days.map((dayEntry) => {
                      const isSelected = dayEntry.date === selectedDailyDate;
                      return (
                        <button
                          key={dayEntry.date}
                          onClick={() => openDate(dayEntry.date)}
                          aria-current={isSelected ? 'page' : undefined}
                          className={clsx(
                            'flex w-full items-center gap-2 py-1 pl-10 pr-3 text-left text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500',
                            isSelected
                              ? 'bg-emerald-100 font-medium text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200'
                              : 'text-gray-700 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800',
                          )}
                        >
                          <span className="w-5 text-right tabular-nums">
                            {dayEntry.day}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-500">
                            {dayEntry.weekday}
                          </span>
                        </button>
                      );
                    })}
                </div>
              ))}
          </div>
        ))}
      </nav>
    </div>
  );
}

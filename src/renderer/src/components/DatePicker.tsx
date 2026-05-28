import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { localDateString } from '../lib/dates';

/**
 * DatePicker — a custom calendar popover for selecting a due date.
 *
 * Props:
 *   value    YYYY-MM-DD string, or '' / null for "no date"
 *   onChange called with a YYYY-MM-DD string when a day is clicked,
 *            or '' when the date is cleared
 *   label    accessible label for the trigger button (default 'Due date')
 *   placeholder  text shown on the trigger when no date is set
 *   className    extra classes on the trigger button
 *
 * The calendar is rendered into document.body via a portal so it is
 * never clipped by overflow:hidden ancestors. It is positioned below
 * (or above, if near the bottom of the viewport) the trigger button.
 *
 * Keyboard:
 *   Arrow keys — move focus within the grid
 *   Enter / Space — select focused day
 *   Escape — close without changing value
 *   Page Up / Down — previous / next month
 */

// ── Calendar math ─────────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface DayCell {
  date: string;    // YYYY-MM-DD
  inMonth: boolean;
  day: number;
}

function buildGrid(year: number, month: number): DayCell[] {
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  // Start week on Monday: Mon=0 … Sun=6
  const startOffset = (firstDow + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDaysInMonth = new Date(year, month, 0).getDate();

  const cells: DayCell[] = [];

  // Prev-month fill
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = prevDaysInMonth - i;
    const pm = month === 0 ? 11 : month - 1;
    const py = month === 0 ? year - 1 : year;
    cells.push({
      date: ymd(py, pm, d),
      inMonth: false,
      day: d,
    });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: ymd(year, month, d), inMonth: true, day: d });
  }

  // Next-month fill to complete 6 rows
  const needed = 42 - cells.length;
  for (let d = 1; d <= needed; d++) {
    const nm = month === 11 ? 0 : month + 1;
    const ny = month === 11 ? year + 1 : year;
    cells.push({ date: ymd(ny, nm, d), inMonth: false, day: d });
  }

  return cells;
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseYmd(value: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})/.exec(value);
  if (!m || !m[1] || !m[2]) return null;
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) - 1 };
}

// ── DatePicker component ──────────────────────────────────────────────────────

export interface DatePickerProps {
  value: string | null;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  /** Format the selected value for display on the trigger button */
  formatValue?: (value: string) => string;
}

export function DatePicker({
  value,
  onChange,
  label = 'Due date',
  placeholder = 'No date',
  className,
  formatValue,
}: DatePickerProps): JSX.Element {
  const normalised = value?.slice(0, 10) ?? '';
  const today = localDateString();

  // View month (what the calendar is showing)
  const [isOpen, setIsOpen] = useState(false);
  const [viewYear, setViewYear] = useState<number>(() => {
    const parsed = parseYmd(normalised || today);
    return parsed?.year ?? new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState<number>(() => {
    const parsed = parseYmd(normalised || today);
    return parsed?.month ?? new Date().getMonth();
  });
  // Keyboard-focused cell index within the grid
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);

  // Popover position
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const grid = buildGrid(viewYear, viewMonth);

  // ── Open / close ────────────────────────────────────────────────────────────

  const open = useCallback(() => {
    // Snap view to current value (or today if empty)
    const target = normalised || today;
    const parsed = parseYmd(target);
    if (parsed) {
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    }

    // Find initial focused index
    const idx = grid.findIndex((c) => c.date === (normalised || today));
    setFocusedIdx(idx >= 0 ? idx : null);

    // Position the popover
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popoverHeight = 300; // approx
      const spaceBelow = window.innerHeight - rect.bottom;
      const above = spaceBelow < popoverHeight;

      setPopoverStyle({
        position: 'fixed',
        left: Math.min(rect.left, window.innerWidth - 230),
        top: above ? rect.top - popoverHeight - 4 : rect.bottom + 4,
        zIndex: 9999,
        width: 224,
      });
    }
    setIsOpen(true);
  }, [normalised, today, grid]);

  const close = useCallback(() => {
    setIsOpen(false);
    setFocusedIdx(null);
    triggerRef.current?.focus();
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleMouseDown(e: MouseEvent): void {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        close();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen, close]);

  // ── Month navigation ─────────────────────────────────────────────────────────

  const prevMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 0) { setViewYear((y) => y - 1); return 11; }
      return m - 1;
    });
    setFocusedIdx(null);
  }, []);

  const nextMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 11) { setViewYear((y) => y + 1); return 0; }
      return m + 1;
    });
    setFocusedIdx(null);
  }, []);

  // ── Day selection ────────────────────────────────────────────────────────────

  const selectDate = useCallback((date: string) => {
    onChange(date);
    close();
  }, [onChange, close]);

  const clearDate = useCallback(() => {
    onChange('');
    close();
  }, [onChange, close]);

  // ── Keyboard navigation ──────────────────────────────────────────────────────

  const handleGridKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'PageUp') { e.preventDefault(); prevMonth(); return; }
    if (e.key === 'PageDown') { e.preventDefault(); nextMonth(); return; }

    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      setFocusedIdx((prev) => {
        const current = prev ?? grid.findIndex((c) => c.date === (normalised || today));
        const base = current < 0 ? 0 : current;
        const delta =
          e.key === 'ArrowLeft' ? -1 :
          e.key === 'ArrowRight' ? 1 :
          e.key === 'ArrowUp' ? -7 :
          7;
        const next = Math.max(0, Math.min(41, base + delta));
        // If we've moved out of the current month view, advance the month
        const cell = grid[next];
        if (cell && !cell.inMonth) {
          if (delta > 0) nextMonth();
          else prevMonth();
        }
        return next;
      });
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (focusedIdx !== null) {
        const cell = grid[focusedIdx];
        if (cell) selectDate(cell.date);
      }
    }
  }, [close, prevMonth, nextMonth, grid, normalised, today, focusedIdx, selectDate]);

  // ── Trigger label ────────────────────────────────────────────────────────────

  const displayLabel =
    normalised === ''
      ? placeholder
      : formatValue
      ? formatValue(normalised)
      : normalised;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={isOpen ? close : open}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-md border text-xs transition focus:outline-none focus:ring-2 focus:ring-emerald-500',
          normalised === ''
            ? 'border-gray-300 text-gray-500 hover:border-gray-400 dark:border-gray-700 dark:text-gray-500 dark:hover:border-gray-500'
            : 'border-gray-300 text-gray-700 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300 dark:hover:border-gray-500',
          className,
        )}
      >
        <span aria-hidden className="select-none">📅</span>
        <span className="select-none">{displayLabel}</span>
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Date picker"
            aria-modal="true"
            style={popoverStyle}
            className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-950"
            onKeyDown={handleGridKeyDown}
          >
            {/* Month header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2.5 dark:border-gray-800">
              <button
                type="button"
                onClick={prevMonth}
                aria-label="Previous month"
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              >
                ‹
              </button>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                {MONTH_NAMES[viewMonth]} {viewYear}
              </span>
              <button
                type="button"
                onClick={nextMonth}
                aria-label="Next month"
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              >
                ›
              </button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-800">
              {WEEKDAY_LABELS.map((d) => (
                <div
                  key={d}
                  className="py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-600"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 p-1.5 pb-0">
              {grid.map((cell, idx) => {
                const isSelected = cell.date === normalised;
                const isToday = cell.date === today;
                const isFocused = idx === focusedIdx;

                return (
                  <button
                    key={cell.date}
                    type="button"
                    tabIndex={isFocused ? 0 : -1}
                    onClick={() => selectDate(cell.date)}
                    aria-label={cell.date}
                    aria-pressed={isSelected}
                    aria-current={isToday ? 'date' : undefined}
                    className={clsx(
                      'mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs transition focus:outline-none focus:ring-2 focus:ring-emerald-500',
                      isSelected && 'bg-emerald-600 font-semibold text-white',
                      !isSelected && isToday && 'font-semibold text-emerald-600 ring-1 ring-emerald-500 dark:text-emerald-400',
                      !isSelected && !isToday && cell.inMonth && 'text-gray-800 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800',
                      !isSelected && !isToday && !cell.inMonth && 'text-gray-400 hover:bg-gray-100 dark:text-gray-600 dark:hover:bg-gray-800',
                      isFocused && !isSelected && 'bg-gray-100 dark:bg-gray-800',
                    )}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>

            {/* Footer — Today + Clear */}
            <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2 dark:border-gray-800">
              <button
                type="button"
                onClick={() => selectDate(today)}
                className="text-xs text-emerald-600 hover:underline focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded dark:text-emerald-400"
              >
                Today
              </button>
              {normalised !== '' && (
                <button
                  type="button"
                  onClick={clearDate}
                  className="text-xs text-gray-400 hover:text-gray-600 hover:underline focus:outline-none focus:ring-2 focus:ring-gray-500 rounded dark:text-gray-600 dark:hover:text-gray-400"
                >
                  Clear
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

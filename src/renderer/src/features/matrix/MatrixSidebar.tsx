import { useUI } from '../../state/ui';
import { useProjectsList, useLabelsList } from '../tasks/queries';

/**
 * Sidebar shown when the app is in Matrix mode.
 *
 * Contains:
 *   - Urgency threshold (how many days ahead still counts as "urgent")
 *   - Importance cutoff (which priorities count as "important")
 *   - Optional project/label scope filters
 */
export function MatrixSidebar(): JSX.Element {
  const matrixPrefs = useUI((s) => s.matrixPrefs);
  const setMatrixPrefs = useUI((s) => s.setMatrixPrefs);
  const matrixProjectId = useUI((s) => s.matrixProjectId);
  const setMatrixProjectId = useUI((s) => s.setMatrixProjectId);
  const matrixLabelId = useUI((s) => s.matrixLabelId);
  const setMatrixLabelId = useUI((s) => s.setMatrixLabelId);

  const { data: projects } = useProjectsList();
  const { data: labels } = useLabelsList();

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-4 py-5">
      <div>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-500">
          Matrix
        </h2>

        {/* Urgency threshold */}
        <section className="mb-5">
          <label className="mb-1.5 block text-xs font-medium text-gray-400">
            Urgent within
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={30}
              value={matrixPrefs.urgencyDays}
              onChange={(e) =>
                setMatrixPrefs({
                  urgencyDays: Math.max(
                    0,
                    Math.min(30, parseInt(e.target.value, 10) || 0),
                  ),
                })
              }
              className="w-16 rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <span className="text-xs text-gray-500">days</span>
          </div>
          <p className="mt-1 text-[11px] text-gray-600">
            {matrixPrefs.urgencyDays === 0
              ? 'Today + overdue only'
              : `Due today or within ${matrixPrefs.urgencyDays} day${matrixPrefs.urgencyDays === 1 ? '' : 's'}`}
          </p>
        </section>

        {/* Importance cutoff */}
        <section className="mb-5">
          <label className="mb-1.5 block text-xs font-medium text-gray-400">
            Important up to
          </label>
          <select
            value={matrixPrefs.importanceCutoff}
            onChange={(e) =>
              setMatrixPrefs({
                importanceCutoff: parseInt(e.target.value, 10) as 1 | 2 | 3 | 4,
              })
            }
            className="w-full rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value={1}>P1 only</option>
            <option value={2}>P1 – P2 (default)</option>
            <option value={3}>P1 – P3</option>
            <option value={4}>All priorities</option>
          </select>
        </section>

        {/* Project filter */}
        <section className="mb-5">
          <label className="mb-1.5 block text-xs font-medium text-gray-400">
            Project
          </label>
          <select
            value={matrixProjectId ?? ''}
            onChange={(e) =>
              setMatrixProjectId(e.target.value === '' ? null : e.target.value)
            }
            className="w-full rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All projects</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </section>

        {/* Label filter */}
        <section className="mb-5">
          <label className="mb-1.5 block text-xs font-medium text-gray-400">
            Label
          </label>
          <select
            value={matrixLabelId ?? ''}
            onChange={(e) =>
              setMatrixLabelId(e.target.value === '' ? null : e.target.value)
            }
            className="w-full rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All labels</option>
            {labels?.map((l) => (
              <option key={l.id} value={l.id}>
                @{l.name}
              </option>
            ))}
          </select>
        </section>

        {/* Reset */}
        {(matrixPrefs.urgencyDays !== 0 ||
          matrixPrefs.importanceCutoff !== 2 ||
          matrixProjectId !== null ||
          matrixLabelId !== null) && (
          <button
            onClick={() => {
              setMatrixPrefs({ urgencyDays: 0, importanceCutoff: 2 });
              setMatrixProjectId(null);
              setMatrixLabelId(null);
            }}
            className="text-xs text-gray-600 underline hover:text-gray-400"
          >
            Reset to defaults
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="mt-auto border-t border-gray-800 pt-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-600">
          Quadrants
        </p>
        <div className="grid grid-cols-2 gap-1 text-[11px]">
          <QuadrantLegend color="red" label="Do" sub="urgent + important" />
          <QuadrantLegend color="blue" label="Schedule" sub="not urgent + important" />
          <QuadrantLegend color="orange" label="Delegate" sub="urgent + not important" />
          <QuadrantLegend color="gray" label="Eliminate" sub="not urgent + not important" />
        </div>
      </div>
    </div>
  );
}

function QuadrantLegend({
  color,
  label,
  sub,
}: {
  color: 'red' | 'blue' | 'orange' | 'gray';
  label: string;
  sub: string;
}): JSX.Element {
  const dot: Record<typeof color, string> = {
    red: 'bg-red-500',
    blue: 'bg-blue-500',
    orange: 'bg-orange-500',
    gray: 'bg-gray-600',
  };
  return (
    <div className="flex items-start gap-1.5">
      <span className={`mt-0.5 h-2 w-2 flex-shrink-0 rounded-full ${dot[color]}`} />
      <div>
        <div className="font-medium text-gray-400">{label}</div>
        <div className="text-gray-600">{sub}</div>
      </div>
    </div>
  );
}

# 0017. Build Summary mode as composed queries over existing list IPC

Date: 2026-08-17  
Status: Accepted

---

## Context

Cinder needed a daily summary landing page: catch up on what changed, surface
what needs attention (overdue, due today, triage), and answer "what should I do
first". The full option catalog and phasing live in
[`docs/specs/daily-summary.md`](../specs/daily-summary.md); this ADR records the
architectural decisions of the shipped MVP (Phase A + the since-last-session
part of Phase B).

Three questions had non-obvious answers:

1. **How does the dashboard fetch its data** — one aggregate `summary:get` IPC
   endpoint, or composition of the existing `tasks:list` / `notes:list` calls?
2. **How is "since you were away" anchored** — there was no record of when the
   previous session ended.
3. **Where does the feature's data layer live** — Summary needs "completed
   since X" and "edited since X" queries that no view needed before.

## Decision

**Summary is a sixth mode ('summary'), rendered full-width (no sidebar), and is
the default landing mode** (`summary.openOnLaunch`, default true; the Zustand
store boots in 'summary' and `SettingsInitializer` switches to 'notes' when the
user has opted out). Due-task notification clicks land on Summary too (falling
back to Tasks › Today when opted out).

**Data fetching composes the existing TanStack Query hooks and list IPC — there
is no `summary:*` IPC domain.** The overdue/today card literally reuses
`useTasksList({ kind: 'today' })` (sharing its cache entry with Tasks mode) and
splits overdue-vs-today in a pure renderer selector; do-first reuses
`useAllTasksList` + the shared `classifyTask`. New needs were met by extending
the existing inputs:

- `TaskListInput.completedAfter` / `.createdAfter` (gte on UTC ISO strings;
  `completedAfter` implies completed results, so the service skips the
  active-tasks default when it is set — filter-only change, no new columns, so
  the `listByFilter` raw-SQL column list is untouched).
- `NoteListInput.updatedAfter`.

All Summary query keys sit under the `tasks.all` / `notes.all` prefixes, so the
existing mutation invalidations refresh every card with zero new wiring.

**The catch-up baseline is `summary.lastSessionEndedAt`** — a system-managed
settings key stamped with `new Date().toISOString()` at the top of the
`will-quit` handler (before the auto-backup, inside its own try/catch so a
failure never blocks quitting). During a session the key always holds the
*previous* session's end, so the renderer reads it directly with no
snapshotting. First run (empty string) falls back to local start-of-today.

Pure card logic (overdue grouping by staleness, Q1 "do first" pick) lives in
`features/summary/selectors.ts` with unit tests.

## Alternatives considered

| Option | Why not chosen |
|--------|---------------|
| Single `summary:get` aggregate IPC endpoint | One round trip and one schema, but its cache entry would need invalidation from *every* task/note mutation forever — a standing drift risk for marginal gain on a local SQLite DB. Queries here are all index-backed (`due_date`, `completed_at`, `updated_at`). |
| Store last-session time in a file / dedicated table | The settings table is already a validated KV store with a no-migration path; a system-managed key costs nothing and rides the existing `settings:getAll` cache. |
| Track "last seen" per view (read receipts) | Much finer-grained catch-up, but needs an event log and per-entity state; out of scope until an activity log is wanted for its own sake (spec §4.4). |
| Sidebar for Summary (section nav) | The page is one screen of cards; density comes from the cards themselves and configuration belongs in Settings. Full-width keeps the landing page calm. |

## Consequences

**Positive**
- Zero new IPC surface and no schema migrations; the security boundary is
  unchanged (all new filters are Zod-validated fields on existing endpoints).
- Completing/snoozing a task from any card refreshes all cards and every Tasks
  view for free via the `tasks.all` prefix invalidation.
- The Today cache entry is shared between Summary and Tasks › Today — no double
  fetch, no divergence.

**Negative / watch points**
- The `completedAfter`-implies-completed rule in `tasksService.list` is subtle:
  a caller combining `completedAfter` with an expectation of active tasks gets
  completed ones. Documented on the schema field.
- `summary.lastSessionEndedAt` is only stamped on a clean `will-quit`; a crash
  or `app.exit()` path (e.g. restore-from-backup relaunch) leaves the previous
  stamp, so the catch-up window spans two sessions. Acceptable — the delta is
  a superset, never a loss.
- Bulk "Move all to today" issues one update mutation per task. Fine at
  realistic volumes; promote to a capped `tasks:bulkUpdate` IPC if it ever
  feels slow (spec Phase D).

**Neutral**
- Later cards (upcoming week, stale tasks, project stalls, on-this-day) follow
  the same composed-query pattern; a `summary:*` domain only becomes necessary
  if a card needs something inexpressible through list filters.

# Spec: Daily Summary page ("Today" mode)

**Status:** MVP shipped (Phase A + the since-last-session slice of Phase B) — see [ADR-0017](../adr/0017-summary-mode-composed-queries.md). Phases B (remainder), C, and D remain open.
**Depends on:** nothing outside the current codebase (Phase A); later phases have explicit dependencies listed per section

---

## 1. Concept

A sixth mode (alongside Notes, Tasks, Matrix, Daily, Draw): a read-mostly dashboard
that answers three questions the moment Cinder opens:

1. **What needs my attention?** — overdue, due today, unacknowledged triage.
2. **What should I do first?** — a prioritised short-list, not another long list.
3. **What happened while I was away?** — changes since the last session, including
   tasks Claude captured via the MCP connector.

It is an *aggregation* layer, not a new data domain: every card reads existing
tables through the existing service layer. That keeps the security surface flat
and the build cost low.

---

## 2. Section catalog

Sections are independent cards. Each is listed with the data it needs, whether that
data exists today, and a value/effort rating. The recommended v1 set is marked ★.

### 2.1 Attention — "what needs me now"

| Section | Data | Exists? | Value / Effort |
|---|---|---|---|
| ★ **Overdue tasks**, grouped by age (yesterday / this week / older) | `tasks.due_date < today`, `completed_at IS NULL` | ✅ `dueBefore` filter | High / Low |
| ★ **Due today** (+ collapsed "due tomorrow" preview) | `due_date` on today | ✅ | High / Low |
| ★ **Triage queue** — count + inline `TriageCard`s so items can be acknowledged without leaving the page | `triage = 1` | ✅ `triageOnly` | High / Low (reuses TriageCard) |
| **Important but unscheduled** — p1/p2 tasks with no due date (matrix Q2 "Schedule") | priority + null due date | ✅ `classifyTask` | Medium / Low |
| **Recurring tasks due** — flagged distinctly so a skipped recurrence is visible | `due_recurrence IS NOT NULL` | ✅ | Medium / Low |
| **Data-health footer** (subtle, one line) — age of last auto-backup, trash items purging within N days | backup timestamps, `deleted_at` + `trash.retentionDays` | ✅ | Medium / Low |

### 2.2 Prioritisation — "what should I do first"

| Section | Data | Exists? | Value / Effort |
|---|---|---|---|
| ★ **Do-first list** — matrix Q1 via the existing `classifyTask`, capped at ~5, priority-then-overdue ordering | tasks + matrix prefs | ✅ `src/shared/matrix/` | High / Low |
| ★ **Quick actions** — complete inline; "snooze to tomorrow" (due date +1); **bulk "reschedule all overdue → today"** | existing update mutation | ✅ (bulk = loop or new capped `tasks:bulkUpdate` IPC) | High / Low–Med |
| **Top-3 for today (MITs)** — user pins up to 3 tasks as today's plan; survives restart, resets daily | per-day selection storage | ❌ needs storage (see §4.3) | High / Medium |
| **Suggested top 3** — deterministic score (overdue-ness × priority), shown until the user pins their own | derivable | ✅ | Medium / Low |

### 2.3 Catch up — "what happened while I was away"

| Section | Data | Exists? | Value / Effort |
|---|---|---|---|
| ★ **Since last session** — tasks completed / created (incl. quick-capture + MCP-captured), notes edited, grouped by kind | `completed_at`, `created_at`, `updated_at` vs a last-session timestamp | ⚠️ timestamps exist; needs `summary.lastSessionEndedAt` written on quit (§4.1) and `completedAfter` / `createdAfter` / `updatedAfter` list filters (§4.2) | High / Medium |
| **Claude activity** — count of MCP tool calls since last session, linking to the existing audit view in Settings → Connectors | `userData/mcp-audit.log` (JSONL, already read by Settings) | ✅ | Medium / Low |
| **Yesterday's daily note** — link/preview, so the previous day's context is one click away | `daily_date` | ✅ `getOrCreateDaily` is idempotent — use a read-only lookup so we don't create empty notes for empty days | Medium / Low |
| **Checkbox carry-over** — unchecked `- [ ]` items from yesterday's daily note surfaced (and optionally copied into today's) | GFM task-list support in the editor schema | ❌ the TipTap schema has no TaskList/TaskItem extension today — this is a prerequisite feature of its own | High / High |
| **Recently edited notes** — top 5 by `updated_at` | ✅ | ✅ | Medium / Low |

### 2.4 Planning ahead

| Section | Data | Exists? | Value / Effort |
|---|---|---|---|
| **Upcoming 7 days** — mini-agenda of due tasks grouped by day | `due_date` range | ✅ (`dueOnOrAfter` + `dueBefore`) | High / Low |
| **Weekly review card** — appears only on a configurable day (e.g. Fri/Sun): prompts to sweep triage, stale tasks, project stalls; pairs with the existing MCP `weekly_review` prompt | none new | ✅ | Medium / Low |

### 2.5 Rediscovery & hygiene

| Section | Data | Exists? | Value / Effort |
|---|---|---|---|
| **Stale tasks** — active tasks untouched for N days (default 14) | `updated_at` | ✅ | Medium / Low |
| **Project stalls** — projects with zero active tasks ("no next action") or no activity in N days | join projects × tasks | ✅ | Medium / Medium |
| **Orphans** — inbox tasks with no project; notes with no folder and no project | null FKs | ✅ | Low–Med / Low |
| **On this day** — daily notes from 1 week / 1 month / 1 year ago | `daily_date` arithmetic | ✅ | Medium / Low |
| **Resurfaced note** — one older note picked deterministically per day (seeded by date, so it's stable within a day) | any | ✅ | Low / Low |

### 2.6 Motivation & stats

| Section | Data | Exists? | Value / Effort |
|---|---|---|---|
| **Completed today / this week** count | `completed_at` | ✅ | Medium / Low |
| **14-day completion sparkline** | `completed_at` bucketed by local day | ✅ | Low–Med / Low |
| **Streak** (consecutive days with ≥1 completion) | derivable | ✅ | Low / Low |

### 2.7 Considered and recommended against (for now)

- **Calendar integration** — no EventKit entitlement, new privacy surface, and Cinder
  deliberately has no external data sources. Revisit only as its own project.
- **In-app AI-generated narrative summary** — Cinder is offline/local-first; an LLM call
  from the app would break that. The right seam already exists: extend the MCP
  `summarize_today` prompt so Claude Desktop generates the narrative *from* Cinder's data.
- **"Rescheduled N times" / task history feed** — needs an event/audit table for tasks;
  only `updated_at` exists, so provenance of changes is unknowable today. Defer unless an
  activity log is wanted for its own sake (it would also unlock a richer catch-up section).
- **Habit tracking** — a different product; daily notes + recurring tasks cover 80%.

---

## 3. Architecture

### 3.1 Mode plumbing (renderer)

- Add `'summary'` to the `Mode` union in `src/renderer/src/state/ui.ts` and a
  `ModeButton` in `App.tsx` (first position — it's the landing page).
- New feature dir `src/renderer/src/features/summary/`:
  - `SummaryPane.tsx` — full-width main pane (recommend **no sidebar** for this mode;
    density comes from cards, and section config lives in Settings, not a nav tree).
  - `cards/` — one component per section behind a shared `SummaryCard` frame
    (title, count badge, collapse, empty-state). Sections render from a registry
    array filtered by settings, so adding a card later is additive.
  - `queries.ts` — thin hooks composing existing query hooks.
- Clicking any item deep-links using existing state setters (`setMode`, `setTaskScope`,
  `setSelectedNoteId`, `setSelectedDailyDate`) — same pattern global search uses.

### 3.2 Data fetching: compose existing queries (recommended) vs. one aggregate IPC

**Option A — compose existing TanStack Query hooks (recommended).**
Each card issues its own `tasks:list` / `notes:list` call with filters. All IPC is
local SQLite with the right indexes (`due_date`, `completed_at`, `updated_at` are all
indexed), so N small queries are cheap. The decisive advantage: existing mutations
already invalidate `tasks.all` / `notes.all` key prefixes, so completing a task from a
summary card refreshes every affected card with **zero new invalidation wiring**.

**Option B — single `summary:get` aggregate endpoint.**
One round trip, one Zod schema. Rejected as the default because its cache entry would
need to be invalidated by *every* task/note mutation forever — a standing drift risk
for marginal gain on a local DB.

Verdict: **A**, with a `summary:*` IPC domain added later only if a section needs
something inexpressible through existing list filters.

### 3.3 New/extended IPC surface (all Zod-validated, `assertMainFrame`, service-layer only)

| Change | Kind | Notes |
|---|---|---|
| `TaskListInput` + `completedAfter`, `createdAfter` (and allow listing completed) | extend schema + `tasksService.list` | filter-only; **no new columns**, so the `listByFilter` raw-SQL column list gotcha is not triggered |
| `NoteListInput` + `updatedAfter` | extend schema + service | same |
| `notes:getDailyByDate` (read-only lookup, no create) | new channel in existing notes domain | avoids `getOrCreateDaily` spawning empty notes when the summary peeks at yesterday |
| `tasks:bulkUpdate` (optional, Phase B) | new channel | array of `{id, patch}`, hard cap (e.g. 100); loop of existing single updates is an acceptable v1 |
| `connectors:auditSince` (optional) | extend existing audit read | count-only summary for the Claude-activity card |

### 3.4 Last-session timestamp

Write `summary.lastSessionEndedAt` (ISO-8601) in the existing `will-quit` handler,
next to the auto-backup call (fast single-row write; same `_quitting` guard path).
On launch, the summary snapshots that value into memory *before* it is overwritten,
and computes all "since you were away" deltas from the snapshot. If absent
(first run), fall back to start-of-today.

### 3.5 Settings (no migration — backfilled from `DEFAULT_SETTINGS`)

```
summary.sections          — { [sectionId]: boolean } visibility map
summary.openOnLaunch      — boolean, default true (Summary is the landing mode)
summary.upcomingDays      — int, default 7
summary.staleDays         — int, default 14
summary.reviewDay         — 0–6 | null (weekly review card)
```

Settings UI: new "Summary" section in `SettingsModal` with checkboxes per card.

### 3.6 Notifications tie-in

The due-task notification click currently navigates to Tasks › Today. When
`summary.openOnLaunch` is on, point it at the Summary mode instead — the page it
lands on now shows overdue + today + everything else.

### 3.7 Security posture

No new attack surface class: no filesystem roots from the renderer, no network, no
raw SQL outside the service layer, read-mostly endpoints. All new channels follow the
one-file-per-domain + Zod + `assertMainFrame` pattern. The MCP server gains nothing
automatically (summary is a renderer view, not a tool).

---

## 4. Data gaps / prerequisite primitives

1. **`summary.lastSessionEndedAt`** — §3.4. Small; Phase B.
2. **GFM task lists in the editor** — required for checkbox carry-over (§2.3) and
   valuable on its own (checklists in daily notes). A separate feature:
   `@tiptap/extension-task-list`/`task-item` (pinned exact, like the table extension),
   serde emit/parse of `- [ ]` / `- [x]`, round-trip tests, DOCX export mapping
   decision. Estimate ~1 session; write its own ADR.
3. **Day-plan (MIT) storage** — three options: (a) a `summary.dayPlan` settings key
   `{ date, taskIds[] }` — simplest, single-day history is all we need; (b) a new
   `day_plans` table — only if plan history matters; (c) writing into the daily note —
   couples data to prose, rejected. **Recommend (a).**
4. **Task event log** — only if "what changed" needs per-field provenance later.
   Explicitly out of scope for v1–v3.

---

## 5. Phasing & effort

Estimates are in "feature sessions" matching the existing workflow (verify → ADR →
CLAUDE.md → help → README → commit).

**Phase A — MVP (~1 session).** Mode shell + card frame/registry; Overdue, Due today,
Triage (inline TriageCards), Do-first (reuses `classifyTask`), inline complete +
snooze-to-tomorrow; link to today's daily note. No schema, no new IPC.

**Phase B — Catch-up & planning (~1 session).** `lastSessionEndedAt`; `completedAfter`/
`createdAfter`/`updatedAfter` filters; Since-last-session card; Upcoming-7-days;
bulk reschedule-overdue; `notes:getDailyByDate` + yesterday link; Claude-activity count.

**Phase C — Configuration & hygiene (~1 session).** Settings section + visibility map;
`openOnLaunch` + notification deep-link; stats (counts, sparkline); stale tasks;
orphans; project stalls; on-this-day; weekly review card; data-health footer.

**Phase D — Deeper primitives (optional, ~2 sessions).** GFM task lists (own ADR) →
checkbox carry-over; MIT picker with `summary.dayPlan`; `tasks:bulkUpdate` if the
loop-of-updates feels slow.

**ADR:** one for the feature (new mode; compose-queries-over-aggregate-endpoint
decision; lastSessionEndedAt semantics). Phase D's task-list support gets its own.

---

## 6. Decisions (resolved 2026-08-17)

1. **Landing page** — ✅ Summary is the default mode on launch
   (`summary.openOnLaunch`, default true). Due-task notification clicks also land
   on Summary; opting out restores the old behaviour (open in Notes, notifications
   → Tasks › Today).
2. **Sidebar** — ✅ full-width, no sidebar.
3. **v1 card set** — ✅ the ★ set: Do first, Overdue (grouped, with bulk
   "Move all to today"), Due today (+ tomorrow preview), inline Triage, quick
   actions (complete / snooze), Since last session, and the today's-note header
   link. Shipped.
4. **MIT storage** — ✅ settings-key approach (`summary.dayPlan`), when the MIT
   picker ships in Phase D.
5. **Stats** — ✅ keep the page purely operational; §2.6 (motivation & stats) is
   dropped from the roadmap.

# 0002. Triage queue for note-captured tasks

Date: 2026-05-27  
Status: Accepted

---

## Context

Cinder has two content domains — notes and tasks — and a common workflow pattern:
the user is writing a note and spots something that needs doing. They want to capture
it immediately without breaking their writing flow.

The question was how captured tasks enter the task system. The naive approach (place
them directly in Inbox) creates a problem: tasks created this way are intentionally
incomplete. They have a title but no priority, due date, or project. Inbox is a
first-class workspace view; filling it with half-formed drafts degrades the signal-to-noise
ratio of the primary task list.

This was discussed during a feature session: "have the notes be able to add a Todo, then
have the newly added Todo be sat in a Triage list, so that I have to acknowledge the todo
to get it setup correctly."

---

## Decision

Add a **triage queue**: a staging area that sits between capture and the normal task
workflow.

- A new `triage` column (`INTEGER NOT NULL DEFAULT 0`) on the `tasks` table.
- Tasks created via the NoteEditor "+ Todo" button or the ⌘⇧Space quick-capture popup
  are stamped `triage = 1` at creation time.
- The `tasksService.list()` default always adds `AND triage = 0`, hiding triage tasks
  from **all** normal views: Inbox, Today, Upcoming, per-project, per-label, filter DSL,
  and the Eisenhower matrix.
- A dedicated **Triage** scope in the Tasks sidebar (with an amber badge showing the
  pending count) exposes only `triage = 1` tasks.
- Each triage task is shown as a **TriageCard** with inline editing for title, description,
  priority, due date, and project. An **Acknowledge** button sets `triage = 0` in a single
  mutation — the task immediately moves to its target view.
- A **Discard** button hard-deletes the task for captures that turn out to be noise.

The `triage` flag is `0/1` integer (SQLite has no native boolean). The distinction between
the `triage` boolean in `TaskListInput` (Zod) and the `0/1` integer in the DB is resolved
at the service boundary.

---

## Alternatives considered

| Option | Why not chosen |
|--------|---------------|
| Place directly in Inbox | Half-formed tasks pollute the primary workspace. Users must manually triage Inbox constantly, which defeats the purpose of having a structured task system. |
| Separate "Capture" / "Ideas" list | Requires a new first-class list type, sidebar item, and schema entity. Functionally identical to Triage but with more surface area. Triage as a transient queue — not a permanent home — better communicates the intended workflow. |
| Draft state on existing tasks | Adds a third completion state (draft / active / done) to the task lifecycle. More complex state machine; existing views need updating to handle drafts. Triage as a flag sidesteps this: tasks are already "real" tasks, just hidden until set up. |
| Modal setup wizard on capture | Requiring the user to fill in priority/due date *at capture time* breaks the writing flow the feature was designed to protect. The whole point is frictionless capture with deferred setup. |

---

## Consequences

**Positive**
- Inbox, Today, and all normal views stay clean — only acknowledged, intentional tasks appear.
- The Triage view creates a lightweight GTD-style "process your inbox" ritual.
- The pattern is extensible: any future capture entry point (e.g. Shortcuts integration,
  email forwarding) can stamp `triage = 1` and slot into the existing flow.
- `sourceNoteId` (ADR-0004) piggybacks naturally onto triage tasks — the backlink to the
  originating note is only meaningful during triage setup.

**Negative / watch points**
- Users must remember to visit Triage. Tasks captured via the popup or note button are
  invisible until acknowledged. The amber badge count on the sidebar item is the primary
  discoverability mechanism.
- Two-step workflow for simple captures: create → acknowledge. For tasks that need no
  setup, this is friction. Mitigated by the keyboard shortcut (Enter acknowledges with
  whatever is pre-filled).
- `listByFilter` in `tasks.ts` uses raw SQL and must explicitly include `triage = 0` in
  its `baseConditions`. Unlike the Drizzle query path, this is not automatic — new raw SQL
  queries against `tasks` must add the same guard.

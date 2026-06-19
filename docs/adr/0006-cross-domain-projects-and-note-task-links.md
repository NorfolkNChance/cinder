# 0006. Make projects cross-domain and add note ↔ task links

Date: 2026-06-19  
Status: Accepted

---

## Context

Projects were a tasks-only concept: `tasks.project_id` (added in 0002) grouped
tasks, with `sections` nested underneath. Notes had no project association at
all — only `folder_id` (the notes-only folders tree, 0011).

In practice a "deep" note (a spec, a meeting record, a research dump) and the
tasks it spawns belong together, but the app gave no way to express that:

1. A note could not be filed under the same project as its tasks, so a project
   could not act as a single container for a body of work.
2. The only note↔task connection was `tasks.source_note_id` — a one-way,
   non-editable provenance stamp set when a triage todo is captured from a
   note. There was no way to navigate from a note to its tasks, nor to link a
   note and a task that did not originate from each other.

We wanted projects to span both domains, and a general bidirectional link
between notes and tasks.

## Decision

**Two independent structural changes.**

1. **Projects become cross-domain.** Add a single nullable `notes.project_id`
   (migration 0012), mirroring `tasks.project_id`. A note belongs to at most
   one project. Folders remain the notes-only organisational tree; project is
   the orthogonal cross-domain axis. As with `notes.folder_id`, SQLite cannot
   add a FK to the existing `notes` table, so referential integrity lives in
   the service layer: `projectsService.delete()` nulls out `notes.project_id`
   for the deleted project before the row is removed (tasks rely on the
   schema-level `ON DELETE SET NULL`; notes cannot, so it is explicit).

2. **A dedicated `note_task_links` join table** (migration 0013) holds a
   user-curated many-to-many association, modelled on `task_labels`: composite
   PK `(note_id, task_id)` plus a `task_id` index for the reverse scan, both
   FKs `ON DELETE CASCADE`. `tasks.source_note_id` is left untouched and
   continues to record triage provenance. Links are created/removed explicitly
   in the UI (a "Link task" picker in the NoteEditor, a "Link note" picker in
   the task detail panel) and are navigable in both directions.

`create` is idempotent (`ON CONFLICT DO NOTHING`) so re-linking a pair is a
no-op rather than a PK-violation error. List queries exclude soft-deleted
notes/tasks so a soft-deleted-but-not-yet-purged row never surfaces as a
phantom link.

## Alternatives considered

| Option | Why not chosen |
|--------|---------------|
| Multiple projects per note (a `note_projects` join) | Fuzzier mental model and more UI/query surface for a need that single-membership covers; parallelism with `tasks.project_id` keeps the two domains symmetric. |
| Reuse folders as the cross-domain grouping | Folders are notes-only and hierarchical; tasks have no folder concept. Overloading them would conflate two orthogonal axes. |
| Overload `tasks.source_note_id` for general linking | It is single-valued and one-way (a task has one source note), and conflating user links with capture provenance would lose the triage backlink semantics. |
| Encode links as `[[wiki-links]]` in note bodies | Couples links to note prose, is one-directional (note→task only), and would require parsing task references out of Markdown. A relational table is queryable from both sides. |

## Consequences

**Positive**
- A project now reads as one container for a body of work: its task list and
  its notes appear together (the project view shows a "Notes" bar above the
  tasks; the NoteEditor has a project selector).
- Notes and tasks can be linked arbitrarily and navigated both ways, satisfying
  the "deep notes link to tasks and vice versa" requirement.
- The join-table approach means **no column was added to `tasks`**, so the
  raw-SQL column list in `tasks.ts` `listByFilter` did not need changing (a
  known footgun — see CLAUDE.md gotchas).

**Negative / watch points**
- `notes.project_id` has no DB-level FK. Any future code path that hard-deletes
  a project must null out `notes.project_id` (today only `projectsService.delete`
  does). Archiving a project intentionally leaves notes assigned.
- `note_task_links` rows are only CASCADE-cleaned on **hard** delete. Both notes
  and tasks use soft delete, so the service filters soft-deleted rows out of
  link lists rather than relying on the cascade.

**Neutral**
- Note Markdown export is unchanged — it carries only title + body, so neither
  `folder_id` nor the new `project_id` appear there (consistent with the prior
  folder behaviour).

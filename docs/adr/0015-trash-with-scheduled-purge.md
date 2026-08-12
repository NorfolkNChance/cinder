# 0015. Add a Trash view with restore, hard delete, and a scheduled purge

Date: 2026-08-12  
Status: Accepted

---

## Context

Notes and tasks have soft-deleted (`deleted_at`) since Phase 0, and the code
comments promised that "hard delete runs separately on a schedule" — but
neither the schedule nor any way to see, restore, or permanently remove
deleted rows ever existed. That left two contradictions:

1. **Users could not recover from an accidental delete**, even though the
   data was still in the database. Delete looked permanent but wasn't.
2. **"Deleted" data was retained forever** inside the encrypted DB, and a
   hard-deleted note's attachment directory (`userData/attachments/<noteId>/`)
   was never cleaned up — a quiet privacy contradiction for a privacy-first
   app, and exactly the "garbage collection (future work)" called out in
   `services/attachments.ts`.

## Decision

Make soft-delete a real, user-visible Trash with a bounded lifetime:

- **Trash modal** (renderer, `features/trash/`) lists all soft-deleted notes
  (every `bodyType`, daily notes included) and tasks, with per-item
  **Restore** and **Delete forever**, plus **Empty Trash**. Destructive
  buttons use a two-step inline confirmation rather than native `confirm()`.
- **Service layer** gains `listDeleted` / `restore` / `hardDelete` on both
  domains; IPC channels (`notes:listDeleted|restore|hardDelete`,
  `tasks:...`) follow the standard Zod + `assertMainFrame` template.
- **Restore repairs referential integrity on the way out**: a dangling
  `folder_id` (folder deletion only re-files *live* notes) is nulled, and a
  restored daily note whose date has since been re-created comes back as a
  regular note instead of duplicating the date.
- **Hard delete of a note removes its attachment directory** (service-side,
  after the row delete; a cleanup failure is logged, not rolled back — the
  orphaned files are unreferenced and harmless).
- **Purge job** (`services/purge.ts`) hard-deletes rows whose `deleted_at`
  is older than `trash.retentionDays` (default 30). Runs 60 s after startup
  and every 12 h. It is **opt-out** via `trash.autoPurgeEnabled` for users
  who never want automated data destruction. Purging goes through the same
  service `hardDelete` methods as the UI so attachment cleanup and FK
  cascades cannot diverge.

## Alternatives considered

| Option | Why not chosen |
|--------|---------------|
| Per-mode Trash entries in each sidebar (like folders/scopes) | Two parallel list UIs to maintain; Trash is cross-domain by nature and rarely visited — a single modal fits better and stays out of daily navigation. |
| Purge inside the `will-quit` handler (with auto-backup) | Quit path must stay fast; purging N notes with attachment `rm -rf` is unbounded work. A startup-delayed timer keeps quits instant. |
| SQL-level bulk purge (`DELETE WHERE deleted_at < ?`) | Faster, but bypasses the service layer — attachment directories would leak, and any future service-side delete logic would silently not run. Row counts here are small; correctness wins. |
| Fixed retention with no toggle | Auto-deleting user data with no opt-out is hostile in a local-first tool; some users keep trash as an archive. |

## Consequences

**Positive**
- Accidental deletion is now recoverable — the top data-loss scenario for a
  notes app is closed.
- Deleted data actually leaves the machine (row + FTS index via the AFTER
  DELETE trigger + attachment files), honouring the privacy promise.
- The `attachments.ts` "GC on note delete" design finally has its consumer.

**Negative / watch points**
- Hard-deleting a task cascades to subtasks that were never soft-deleted
  (documented behaviour of the soft-delete design). The Trash UI shows only
  the parent; the cascade is invisible until it happens.
- `Empty Trash` issues one IPC call per item — fine at realistic trash
  sizes, revisit if someone trashes thousands of vault-imported notes.
- Any **new** hard-delete path added later must go through
  `notesService.hardDelete` (not raw SQL) or attachments will leak again.

**Neutral**
- Settings keys (`trash.autoPurgeEnabled`, `trash.retentionDays`) backfill
  from defaults — no migration.
- MCP read tools and exports already filter `deleted_at IS NULL`; trashed
  items are invisible to connectors either way.

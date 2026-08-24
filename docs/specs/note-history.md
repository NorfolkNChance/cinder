# Spec: Note revision history

**Status:** Phase A shipped (2026-08-24) — see [ADR-0018](../adr/0018-note-revision-history.md). Phase B is open.
**Depends on:** nothing outside the current codebase.

---

## 1. Concept

A way to look back at earlier states of a note and restore one, aimed squarely at
the "continual note" pattern — a note the user keeps returning to and editing over
days/weeks/months, where the current body is a moving target and an earlier state
is sometimes worth recovering.

This is **not** an audit log or a diff/blame tool. It's periodic full-body
snapshots, browsable and restorable, scoped to regular notes only (see §6).

---

## 2. The core design problem

Autosave in `NoteEditor` fires 500 ms after every pause in typing
(`AUTOSAVE_DELAY_MS`, [NoteEditor.tsx](../../src/renderer/src/features/notes/NoteEditor.tsx)),
and also flushes immediately on blur, note switch, and app close
(`useFlushBeforeUnload`). If a revision were cut on every `notes:update` call, a
single editing session would produce dozens of near-identical rows — noise, not
history.

The whole design hinges on **decoupling revision snapshots from autosave** with a
coalescing policy in the service layer, so what comes back out is meaningful
checkpoints ("this note this morning" vs. "this note last Tuesday"), not a
keystroke log.

---

## 3. Data model

New table, migration `0014_note_revisions.sql` (next sequential number after
`0013_note_task_links.sql`):

```sql
CREATE TABLE note_revisions (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX note_revisions_note_idx ON note_revisions(note_id, created_at);
```

Full snapshots, not diffs. This is a local, single-user, SQLCipher-encrypted DB and
notes are text-sized — diffing (and the reconstruction logic it implies) is
unneeded complexity. The retention policy in §4 keeps size bounded without it,
consistent with the project's simple-over-clever default (see CLAUDE.md).

`bodyType` is deliberately **not** stored per revision — see §6 for why the
feature is scoped away from types where that would matter.

---

## 4. Capture policy

In `notesService.update()`, **before** applying a patch that changes `body`,
decide whether to snapshot the *pre-edit* state first:

- Snapshot if there is no existing revision for the note yet, **or**
- the most recent revision is older than `history.minIntervalMinutes` **and**
  its `body` differs from the current (pre-patch) body.

Net effect: continuous typing produces a new checkpoint roughly every N minutes,
plus a natural checkpoint whenever the user returns to a note after a break of
that length — which is exactly the "continual note" recall case.

**Retention.** Cap at `history.retentionCount` revisions per note; when an insert
would exceed the cap, delete the oldest excess rows in the same call. This is O(1)
extra work per save and needs no separate background job (unlike Trash's
`services/purge.ts`).

**Settings** (no migration — backfilled by `DEFAULT_SETTINGS` per the existing
pattern):

```
notes.history.enabled            — boolean, default true
notes.history.retentionCount     — int, default 50 (revisions kept per note)
notes.history.minIntervalMinutes — int, default 10
```

---

## 5. IPC surface

Folded into the existing `src/main/ipc/notes.ts` file rather than a new domain —
tightly coupled to notes, same precedent as trash restore living there:

| Channel | Input | Notes |
|---|---|---|
| `notes:listRevisions` | `{ noteId }` | newest-first, capped by `retentionCount` naturally |
| `notes:restoreRevision` | `{ noteId, revisionId }` | see below |

All Zod-validated, `assertMainFrame`-guarded, service-layer only — no raw SQL,
same discipline as every other IPC handler.

**Restore is non-destructive.** `restoreRevision` snapshots the *current* state
into `note_revisions` first (subject to the same coalescing check — if the last
revision is fresh, it isn't re-snapshotted), then overwrites `title`/`body` from
the target revision and bumps `updatedAt`. Restoring is itself reversible — same
principle as ADR-0016's restore-from-backup flow (pre-restore safety snapshot
before the swap).

---

## 6. Scope: regular notes only

Revisioning is scoped to plain notes — `daily_date IS NULL` and
`body_type = 'markdown'` (i.e. the same universe `notesService.list()` returns by
default, minus HTML notes). Concretely, the pre-update snapshot check in §4 is
skipped when `note.dailyDate !== null` or `note.bodyType !== 'markdown'`.

- **Daily notes excluded (per decision below).** Simpler v1 surface; can extend
  later by dropping the `dailyDate` check — no schema change needed, since
  `note_revisions` doesn't distinguish note kind.
- **HTML and Excalidraw notes excluded.** The snapshot/restore mechanism itself
  would work identically (it's just `title`+`body` text), but the History UI's
  preview (§7) renders a revision as markdown; showing raw HTML or scene JSON
  there would need type-aware rendering for zero real demand today. Revisit if
  HTML/drawing notes turn out to want history too — the table needs no change,
  only the UI preview and the capture-policy guard.

---

## 7. UI

A "History" button in the `NoteEditor` header (alongside Export / Link panel
toggle), shown only when the open note is in scope (§6). Opens a panel listing
revisions newest-first with relative timestamps ("2 hours ago", "Tue 3:14 PM"):

- Click a revision → read-only preview of that snapshot's body, rendered the same
  way the editor renders markdown.
- "Restore this version" → confirm → `notes:restoreRevision` → editor reloads the
  now-current note.

No token-level diff view in v1 (avoids pulling in a diff dependency); full-snapshot
preview is enough to answer "is this the version I want back." A diff view is a
plausible v2 addition and doesn't change the data model.

---

## 8. Interaction with existing features

- **Trash.** Revisions survive soft-delete — a trashed note keeps its history, so
  restoring it from Trash (`notesService.restore`) comes back with history intact.
  They cascade-delete only on **hard delete**, via the FK, mirroring how
  `note_task_links` cascades today.
- **Backup/restore.** `VACUUM INTO` backups (ADR-0015/0016) pick up
  `note_revisions` automatically — no changes needed to `services/restore.ts` or
  the pragma-parity requirement, since it's an ordinary table in the same DB.
- **Export.** Not exposed — exporting a note exports its current state only, same
  as today.
- **MCP connector.** Out of scope for v1 — no new MCP tool. Revisit only if a
  concrete use case for Claude reading note history shows up.

---

## 9. Security posture

No new attack-surface class: no filesystem roots from the renderer, no network, no
raw SQL outside the service layer, and the new channels follow the existing
one-file-per-domain + Zod + `assertMainFrame` pattern. The revisions table lives in
the same encrypted SQLCipher DB as everything else — no separate key or storage
boundary to design.

---

## 10. Phasing & effort

Estimates match the existing workflow (verify → ADR → CLAUDE.md → help → README →
commit).

**Phase A — MVP (~1 session).** Migration + schema; capture policy in
`notesService.update()`; `notes:listRevisions` / `notes:restoreRevision` IPC +
preload; History panel UI (list + preview + restore) gated to in-scope notes;
settings keys with defaults; help section; ADR.

**Phase B — optional follow-ups.** Diff view instead of/alongside full-snapshot
preview; extend scope to Daily notes (drop the `dailyDate` guard); a manual
"save checkpoint now" action for explicit before-a-big-edit snapshots, independent
of the time-interval trigger.

**ADR:** one for the feature (`docs/adr/0018-note-revision-history.md`) — covers
the coalescing-snapshot-vs-diff decision and the non-destructive-restore pattern.

---

## 11. Decisions (resolved 2026-08-24)

1. **Scope** — ✅ regular notes only for v1 (§6). Daily/HTML/Excalidraw notes are
   explicitly out of scope; the data model doesn't block adding them later.
2. **Storage** — ✅ full snapshots, not diffs (§3).
3. **Capture trigger** — ✅ time-interval coalescing on the existing
   `notesService.update()` path, no new scheduler (§4).

## 12. Phase A implementation notes (2026-08-24)

Shipped as planned, plus one fix discovered during manual verification (not
anticipated in the original plan): `TipTapEditor` only reloads its document
when `noteId` changes (by design, to avoid resetting the cursor on every
autosave), so a restore — which changes the body without changing `noteId`
— left the visible editor showing stale content even though the DB and
query cache were correct. Fixed with a `restoreNonce` counter in
`NoteEditor`, bumped via a new `onRestored` callback on `NoteHistoryModal`,
used as `TipTapEditor`'s `key` to force a remount exactly on an explicit
restore. See [ADR-0018](../adr/0018-note-revision-history.md) for the full
writeup.

Verified end-to-end against the built app (Playwright `_electron`, the same
driver pattern as `e2e/smoke.spec.ts`): seed a note, edit it once (cutting
the first revision), open History, preview the earlier version, restore it,
and confirm both the DB (`notes.get`) and the visible editor show the
restored text.

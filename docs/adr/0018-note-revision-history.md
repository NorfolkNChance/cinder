# 0018. Note revision history: coalesced snapshots, not diffs, non-destructive restore

Date: 2026-08-24  
Status: Accepted

---

## Context

Users asked for a way to recover an earlier state of a "continual" note —
one they keep coming back to and editing over days or weeks. Full design
exploration is in [docs/specs/note-history.md](../specs/note-history.md);
this ADR captures the decisions worth recording for future reference.

Two things made this non-trivial:

1. **Autosave granularity.** `NoteEditor` autosaves 500 ms after every pause
   in typing, and also flushes on blur, note switch, and app close. Cutting
   a revision on every `notes:update` call would produce dozens of
   near-identical rows per editing session — noise, not history.
2. **The editor doesn't rehydrate on body changes alone.** `TipTapEditor`
   only reloads its ProseMirror document when `noteId` changes — deliberately,
   so a mid-typing autosave round-trip doesn't reset the user's cursor. A
   restore changes the note's body without changing `noteId`, so it needed
   an explicit signal to force a resync, or the editor would keep showing
   stale content after a successful restore (and a subsequent edit would
   silently re-save over the restored text).

## Decision

**Coalesced full-body snapshots, not diffs.** `note_revisions` stores
complete `title`+`body` text per row, not a diff against the prior
revision. This is a local, single-user, SQLCipher-encrypted DB with
text-sized notes — diffing (and the reconstruction logic it implies) buys
nothing here. A retention cap (`notes.history.retentionCount`, default 50
per note) keeps the table bounded instead.

**A pure, time-interval coalescing policy, not a scheduler.** A new
revision is only cut when there's no prior one yet, or the prior one is
older than `notes.history.minIntervalMinutes` (default 10) *and* the body
has actually changed. This lives entirely inside `notesService.update()` —
no background job, no timer. The decision itself is extracted as a pure
function, `shouldCaptureRevision(lastRevision, currentBody, minInterval, now)`,
specifically so the coalescing boundary conditions could be unit-tested
without a DB (see `notes.test.ts`), matching the project's existing
convention of unit-testing pure logic (`computePurgeCutoff` in
`purge.test.ts`) rather than DB-integration tests.

**Restore is non-destructive.** `restoreRevision` snapshots the note's
*current* state first — subject to the same coalescing check as a normal
edit — before overwriting with the target revision's title/body. Restoring
into a coalescing window (e.g. restoring twice within the same 10-minute
window) does not produce a duplicate snapshot; this is intentional, not a
bug — the policy is the same policy everywhere, not relaxed for restore.

**Scope: regular Markdown notes only (Phase A).** The capture check short-
circuits for daily notes (`dailyDate !== null`) and non-markdown body types
(HTML, Excalidraw). The table itself doesn't encode note kind, so widening
scope later needs no schema change — only removing the guard and deciding
how the History UI should preview non-markdown content.

**The editor forces a remount on restore, via a nonce, not via the
`markdown` prop.** `NoteHistoryModal` calls `onRestored(note)` with the
restored row right before closing. `NoteEditor` uses that to reset its local
`draft` state and bump a `restoreNonce`, which is used as `TipTapEditor`'s
React `key`. This forces a full destroy/recreate of the ProseMirror editor
exactly on an explicit restore — never on a normal autosave round-trip,
which would reintroduce the cursor-jump problem the `noteId`-only rehydrate
check exists to avoid.

## Alternatives considered

| Option | Why not chosen |
|--------|---------------|
| Revision per `notes:update` call | Floods the table — every debounced autosave (as often as every 500 ms during active typing) would cut a row. |
| Diff-based storage (e.g. line diffs against the previous revision) | Reconstruction complexity with no real payoff for text-sized, single-user, already-encrypted data. Full snapshots are simpler and the retention cap already bounds growth. |
| A background snapshot scheduler (cron-style, independent of edits) | Would snapshot notes that aren't being edited and needs its own lifecycle wiring; piggybacking on the existing `update()` write path is simpler and only does work when there's something to capture. |
| Re-fetch/rehydrate the editor via the `markdown` prop on every change | Already rejected once for the note-switch case (see `TipTapEditor`'s existing `noteId`-comparison effect) — doing it unconditionally would reset the cursor on every autosave, a worse regression than the one being fixed. |
| Apply the coalescing policy everywhere except restore (always snapshot before a restore) | Inconsistent: two different revision-capture rules to reason about. A restore inside a busy 10-minute editing window is rare, and losing that one specific pre-restore instant is an acceptable trade for one simple rule everywhere. |

## Consequences

**Positive**
- Revision history is a handful of meaningful checkpoints per note, not a
  keystroke log — matches the "continual note" use case directly.
- No new attack surface: same encrypted DB, same one-file-per-domain + Zod +
  `assertMainFrame` IPC discipline, no filesystem or network involvement.
- The coalescing policy is independently unit-tested and has no DB
  dependency, so its boundary conditions (exactly-at-interval, unchanged
  body, first revision) are cheap to verify and easy to reason about.

**Negative / watch points**
- Restoring twice in quick succession does not checkpoint the intermediate
  state — by design, but worth remembering if it's ever reported as
  surprising.
- `TipTapEditor`'s `key={restoreNonce}` remount pattern is a narrow, single-
  purpose escape hatch. Any future feature that needs to force a body
  resync outside of a note switch should extend `restoreNonce`'s pattern
  rather than inventing a second one.
- History is Markdown-notes-only for now; Daily/HTML/Excalidraw notes show
  no History button and are silently excluded from capture. This is
  intentional Phase A scope (see the spec), not an oversight, but is worth
  flagging in review of any future note-editor refactor that removes the
  `note.dailyDate === null && note.bodyType === 'markdown'` gate.

**Neutral**
- `note_revisions` cascades on hard delete and survives Trash — a trashed
  note keeps its history and gets it back on restore-from-Trash, mirroring
  how the rest of the notes domain treats soft vs. hard delete.

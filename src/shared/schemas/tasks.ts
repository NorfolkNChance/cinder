import { z } from 'zod';
import { Label } from './labels';

/**
 * Zod schemas for the tasks domain. Tasks are the central entity in the
 * todo system — see §6.2 for the feature surface and §7 for the storage
 * conventions used here.
 *
 * Field semantics:
 *   - priority: 1 (highest) – 4 (lowest), Todoist convention
 *   - due_date: ISO-8601 string. Either date-only ('2026-05-20') or
 *     datetime with offset ('2026-05-20T15:00:00Z'). Both forms are
 *     accepted; the renderer formats according to which form was set.
 *   - due_recurrence: RRULE string per RFC 5545. Phase 2 stores the
 *     column but defers the recurrence engine to Phase 3.
 *   - completed_at: setting it to a timestamp marks the task done;
 *     clearing it reopens.
 */

const ISO_8601 = z.string().datetime({ offset: false });
const Uuid = z.string().uuid();

// Either a date-only string or a full ISO-8601 timestamp.
// Anchored — must match the full string, not just a prefix.
const DateOrDateTime = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/,
    { message: 'must be ISO-8601 date or datetime' },
  );

const Priority = z.number().int().min(1).max(4);

export const Task = z.object({
  id: Uuid,
  projectId: Uuid.nullable(),
  sectionId: Uuid.nullable(),
  parentTaskId: Uuid.nullable(),
  title: z.string(),
  description: z.string(),
  dueDate: z.string().nullable(),
  dueRecurrence: z.string().nullable(),
  priority: Priority,
  order: z.number().int(),
  completedAt: ISO_8601.nullable(),
  createdAt: ISO_8601,
  updatedAt: ISO_8601,
  deletedAt: ISO_8601.nullable(),
  /**
   * 1 = in triage (awaiting acknowledgement); 0 = normal task.
   * Stored as INTEGER in SQLite because SQLite has no native boolean.
   */
  triage: z.number().int().min(0).max(1),
  /**
   * The note this task was created from, or null.
   * Set at creation time by the NoteEditor "+ Todo" button.
   * Remains set after acknowledgement so the link persists in TaskItem.
   */
  sourceNoteId: Uuid.nullable(),
});
export type Task = z.infer<typeof Task>;

/**
 * Task plus the labels currently attached to it. Returned by list and
 * detail fetches so the renderer doesn't need a separate round-trip
 * per row to render label chips.
 */
export const TaskWithLabels = Task.extend({
  labels: z.array(Label),
});
export type TaskWithLabels = z.infer<typeof TaskWithLabels>;

export const TaskCreateInput = z.object({
  // Title is required. Empty string is allowed but very-long titles are
  // not — same lower-bound philosophy as notes (empty title = draft state).
  title: z.string().max(500),
  description: z.string().max(10_000).optional(),
  projectId: Uuid.nullable().optional(),
  sectionId: Uuid.nullable().optional(),
  parentTaskId: Uuid.nullable().optional(),
  dueDate: DateOrDateTime.nullable().optional(),
  dueRecurrence: z.string().max(500).nullable().optional(),
  priority: Priority.optional(),
  /**
   * Labels to attach at creation time. The service applies them
   * atomically with the task insert — caller doesn't need a follow-up
   * `labels:setForTask` round-trip for the common quick-add flow.
   */
  labelIds: z.array(Uuid).max(50).optional(),
  /**
   * Set to 1 to place this task in the Triage queue (e.g. created from a
   * note). Omit (or pass 0) for a normal task that goes straight to Inbox.
   */
  triage: z.union([z.literal(0), z.literal(1)]).optional(),
  /**
   * ID of the note this task was created from, if any. Set by the
   * NoteEditor "+ Todo" button. Null for tasks created elsewhere.
   */
  sourceNoteId: Uuid.nullable().optional(),
});
export type TaskCreateInput = z.infer<typeof TaskCreateInput>;

export const TaskGetInput = z.object({ id: Uuid });
export type TaskGetInput = z.infer<typeof TaskGetInput>;

export const TaskListInput = z.object({
  // Filter by scope. Mutually exclusive in spirit but checked at the
  // service layer rather than via discriminated union — keeps the
  // schema flat and the renderer composable.
  projectId: Uuid.nullable().optional(),
  sectionId: Uuid.optional(),
  parentTaskId: Uuid.nullable().optional(),
  /** Per-label view filter — matches tasks with this label attached. */
  labelId: Uuid.optional(),
  /**
   * When true, return ONLY triage tasks (triage = 1).
   * When unset (default), triage tasks are hidden from all results.
   */
  triageOnly: z.boolean().optional(),
  /**
   * Filter DSL expression — compiled to a SQL fragment at the service
   * layer. See src/shared/filter/. When set, this REPLACES the simple
   * scope filters above (projectId/labelId/etc.) — the renderer should
   * use one or the other, not mix. Length-capped so a pathological
   * input can't blow up the lexer.
   */
  filter: z.string().max(500).optional(),
  // Date predicates for the Today / Upcoming views. Inclusive bounds.
  dueBefore: DateOrDateTime.optional(),
  dueOnOrAfter: DateOrDateTime.optional(),
  // By default we hide completed and soft-deleted; flip these to include them.
  includeCompleted: z.boolean().optional(),
  includeDeleted: z.boolean().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
});
export type TaskListInput = z.infer<typeof TaskListInput>;

// ── Trash ───────────────────────────────────────────────────────────────────

/** List soft-deleted tasks for the Trash view, newest deletion first. */
export const TaskListDeletedInput = z.object({
  limit: z.number().int().min(1).max(1000).optional(),
});
export type TaskListDeletedInput = z.infer<typeof TaskListDeletedInput>;

/** Clear `deleted_at` — the task reappears in its original scope. */
export const TaskRestoreInput = z.object({ id: Uuid });
export type TaskRestoreInput = z.infer<typeof TaskRestoreInput>;

/**
 * Permanently delete a task row. FK cascades remove its subtasks, label
 * links, and note links. Irreversible — only reachable from the Trash
 * view and the purge job.
 */
export const TaskHardDeleteInput = z.object({ id: Uuid });
export type TaskHardDeleteInput = z.infer<typeof TaskHardDeleteInput>;

export const TaskUpdateInput = z.object({
  id: Uuid,
  patch: z
    .object({
      title: z.string().max(500).optional(),
      description: z.string().max(10_000).optional(),
      projectId: Uuid.nullable().optional(),
      sectionId: Uuid.nullable().optional(),
      parentTaskId: Uuid.nullable().optional(),
      dueDate: DateOrDateTime.nullable().optional(),
      dueRecurrence: z.string().max(500).nullable().optional(),
      priority: Priority.optional(),
      order: z.number().int().optional(),
      /** Set to 0 to acknowledge a triage task and move it to normal flow. */
      triage: z.union([z.literal(0), z.literal(1)]).optional(),
    })
    .strict(),
});
export type TaskUpdateInput = z.infer<typeof TaskUpdateInput>;

export const TaskCompleteInput = z.object({
  id: Uuid,
  // True = mark complete (stamps completed_at = now); false = reopen
  // (clears completed_at).
  completed: z.boolean(),
});
export type TaskCompleteInput = z.infer<typeof TaskCompleteInput>;

export const TaskDeleteInput = z.object({ id: Uuid });
export type TaskDeleteInput = z.infer<typeof TaskDeleteInput>;

export const TaskSearchInput = z.object({
  // Free-text query. The service matches it case-insensitively as a
  // substring against the task title and description. Unlike the notes
  // FTS index, tasks are short and few, so a LIKE scan is more than fast
  // enough and avoids a second virtual table.
  query: z.string().max(500),
  limit: z.number().int().min(1).max(200).optional(),
});
export type TaskSearchInput = z.infer<typeof TaskSearchInput>;

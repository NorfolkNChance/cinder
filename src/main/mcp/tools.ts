import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { notesService } from '../services/notes';
import { tasksService } from '../services/tasks';
import { projectsService } from '../services/projects';
import { foldersService } from '../services/folders';
import { labelsService } from '../services/labels';
import { record } from './audit';
import { registerResources } from './resources';
import { registerPrompts } from './prompts';

/**
 * Registers Cinder's MCP tools on an McpServer.
 *
 * Security model (mirrors the IPC boundary — see CLAUDE.md "MCP Connector"):
 *   - Every tool goes through the existing service layer. No raw SQL here.
 *   - Read tools are always registered; WRITE tools are registered ONLY when
 *     `allowWrites` is true, so a connected client cannot create/modify/delete
 *     data unless the user has explicitly opted in (Settings → Connectors).
 *   - Every call is recorded to the append-only audit log (no secrets).
 *
 * The MCP `inputSchema` is a Zod raw shape; the SDK validates args against it
 * before the handler runs and synthesises the JSON schema clients see.
 */

const MCP_INFO = { name: 'cinder', version: '1.0.0' } as const;

/** Wrap a value as a single MCP text content block (pretty-printed JSON). */
function json(data: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/** Today's date as a local YYYY-MM-DD string (matches the daily-notes scheme). */
function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Tomorrow (local) as YYYY-MM-DD — the exclusive upper bound for "today". */
function tomorrowLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Build a fresh McpServer with Cinder's tools registered. A new instance is
 * created per request (stateless transport), so `allowWrites` always reflects
 * the current setting.
 */
export function buildMcpServer(opts: { allowWrites: boolean }): McpServer {
  const server = new McpServer(MCP_INFO, {
    instructions:
      'Cinder is a local notes-and-todos app. Use these tools to search and ' +
      'read the user\'s notes, daily notes, and tasks' +
      (opts.allowWrites
        ? ', and to capture new notes/tasks. New tasks land in the Triage queue for the user to review.'
        : '. Writing is currently disabled by the user.') +
      ' Titles and bodies are Markdown.',
  });

  // ── Read tools (always available) ──────────────────────────────────────────

  server.registerTool(
    'search_notes',
    {
      title: 'Search notes',
      description:
        'Full-text search across the user\'s notes. Returns matching notes ' +
        '(title, body, ids). Use this to find notes by keyword or phrase.',
      inputSchema: {
        query: z.string().max(500).describe('Search text (keywords or a phrase)'),
        limit: z.number().int().min(1).max(50).optional().describe('Max results (default 20)'),
      },
    },
    async ({ query, limit }) => {
      const rows = await notesService.search({ query, limit: limit ?? 20 });
      record('search_notes', true, `query="${query}" → ${rows.length}`);
      return json(rows);
    },
  );

  server.registerTool(
    'list_notes',
    {
      title: 'List notes',
      description:
        'List the user\'s regular notes (most recently updated first). ' +
        'Optionally filter by project. Does not include daily notes.',
      inputSchema: {
        projectId: z.string().uuid().optional().describe('Only notes in this project'),
        limit: z.number().int().min(1).max(100).optional().describe('Max results (default 30)'),
      },
    },
    async ({ projectId, limit }) => {
      const rows = await notesService.list({
        limit: limit ?? 30,
        ...(projectId !== undefined ? { projectId } : {}),
      });
      record('list_notes', true, `→ ${rows.length}`);
      return json(rows);
    },
  );

  server.registerTool(
    'get_note',
    {
      title: 'Get note',
      description: 'Fetch a single note by id, including its full Markdown body.',
      inputSchema: { id: z.string().uuid().describe('The note id') },
    },
    async ({ id }) => {
      const note = await notesService.get(id);
      record('get_note', note !== null, `id=${id}`);
      return json(note);
    },
  );

  server.registerTool(
    'get_daily_note',
    {
      title: 'Get daily note',
      description:
        'Read the daily note for a date (defaults to today). Returns the note ' +
        'if it exists, or a not-found marker. Does not create a note.',
      inputSchema: {
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('Calendar date YYYY-MM-DD (default today)'),
      },
    },
    async ({ date }) => {
      const target = date ?? todayLocal();
      // Read-only: scan daily notes via the service rather than creating one.
      const dailies = await notesService.list({ dailyOnly: true, limit: 1000 });
      const note = dailies.find((n) => n.dailyDate === target) ?? null;
      record('get_daily_note', true, `date=${target} ${note ? 'found' : 'none'}`);
      return json(note ?? { date: target, exists: false });
    },
  );

  server.registerTool(
    'list_tasks',
    {
      title: 'List tasks',
      description:
        'List active tasks. scope "inbox" = tasks with no project, "today" = ' +
        'due today or overdue, "upcoming" = due from today onward, "all" = ' +
        'everything. Triage tasks are excluded (use list_triage).',
      inputSchema: {
        scope: z.enum(['inbox', 'today', 'upcoming', 'all']).optional().describe('Default "all"'),
        projectId: z.string().uuid().optional().describe('Restrict to this project'),
        includeCompleted: z.boolean().optional().describe('Include completed tasks (default false)'),
        limit: z.number().int().min(1).max(200).optional().describe('Max results (default 100)'),
      },
    },
    async ({ scope, projectId, includeCompleted, limit }) => {
      const input: Parameters<typeof tasksService.list>[0] = {
        limit: limit ?? 100,
        ...(includeCompleted !== undefined ? { includeCompleted } : {}),
        ...(projectId !== undefined ? { projectId } : {}),
      };
      if (scope === 'inbox' && projectId === undefined) input.projectId = null;
      if (scope === 'today') input.dueBefore = tomorrowLocal();
      if (scope === 'upcoming') input.dueOnOrAfter = todayLocal();
      const rows = await tasksService.list(input);
      record('list_tasks', true, `scope=${scope ?? 'all'} → ${rows.length}`);
      return json(rows);
    },
  );

  server.registerTool(
    'list_triage',
    {
      title: 'List triage tasks',
      description:
        'List tasks waiting in the Triage queue — captured but not yet reviewed ' +
        'by the user. Useful for "help me triage my inbox".',
      inputSchema: {},
    },
    async () => {
      const rows = await tasksService.list({ triageOnly: true });
      record('list_triage', true, `→ ${rows.length}`);
      return json(rows);
    },
  );

  server.registerTool(
    'list_projects',
    {
      title: 'List projects',
      description: 'List the user\'s active projects (cross-domain: notes and tasks).',
      inputSchema: {},
    },
    async () => {
      const rows = await projectsService.list({});
      record('list_projects', true, `→ ${rows.length}`);
      return json(rows);
    },
  );

  server.registerTool(
    'list_folders',
    {
      title: 'List folders',
      description: 'List the note folders (the Notes sidebar tree).',
      inputSchema: {},
    },
    async () => {
      const rows = await foldersService.list({});
      record('list_folders', true, `→ ${rows.length}`);
      return json(rows);
    },
  );

  server.registerTool(
    'list_labels',
    {
      title: 'List labels',
      description: 'List the task labels.',
      inputSchema: {},
    },
    async () => {
      const rows = await labelsService.list();
      record('list_labels', true, `→ ${rows.length}`);
      return json(rows);
    },
  );

  // ── Resources & prompts (read-only, always available) ───────────────────────

  registerResources(server);
  registerPrompts(server);

  // ── Write tools (only when the user has enabled writes) ─────────────────────

  if (opts.allowWrites) registerWriteTools(server);

  return server;
}

/**
 * Write tools. Registered only when `connectors.mcp.allowWrites` is on, so the
 * tool simply does not exist for connected clients when writes are disabled —
 * the strongest form of the opt-in gate.
 */
function registerWriteTools(server: McpServer): void {
  server.registerTool(
    'create_note',
    {
      title: 'Create note',
      description: 'Create a new note. Body is Markdown. Returns the created note.',
      inputSchema: {
        title: z.string().max(500).describe('Note title'),
        body: z.string().max(1_000_000).optional().describe('Markdown body'),
        projectId: z.string().uuid().optional().describe('Assign to this project'),
        folderId: z.string().uuid().optional().describe('Place in this folder'),
      },
    },
    async ({ title, body, projectId, folderId }) => {
      const note = await notesService.create({
        title,
        ...(body !== undefined ? { body } : {}),
        ...(projectId !== undefined ? { projectId } : {}),
        ...(folderId !== undefined ? { folderId } : {}),
      });
      record('create_note', true, `title="${title}"`);
      return json(note);
    },
  );

  server.registerTool(
    'update_note',
    {
      title: 'Update note',
      description: 'Update a note\'s title and/or Markdown body. Returns the updated note.',
      inputSchema: {
        id: z.string().uuid().describe('The note id'),
        title: z.string().max(500).optional().describe('New title'),
        body: z.string().max(1_000_000).optional().describe('New Markdown body (replaces existing)'),
      },
    },
    async ({ id, title, body }) => {
      const note = await notesService.update({
        id,
        patch: {
          ...(title !== undefined ? { title } : {}),
          ...(body !== undefined ? { body } : {}),
        },
      });
      record('update_note', note !== null, `id=${id}`);
      return json(note);
    },
  );

  server.registerTool(
    'append_to_daily',
    {
      title: 'Append to daily note',
      description:
        'Append a Markdown snippet to the daily note for a date (default today), ' +
        'creating the daily note if needed. Returns the updated note.',
      inputSchema: {
        text: z.string().max(100_000).describe('Markdown to append'),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('Calendar date YYYY-MM-DD (default today)'),
      },
    },
    async ({ text, date }) => {
      const target = date ?? todayLocal();
      const daily = await notesService.getOrCreateDaily({ date: target });
      const newBody = daily.body ? `${daily.body}\n\n${text}` : text;
      const note = await notesService.update({ id: daily.id, patch: { body: newBody } });
      record('append_to_daily', note !== null, `date=${target}`);
      return json(note);
    },
  );

  server.registerTool(
    'create_task',
    {
      title: 'Create task',
      description:
        'Create a task. By default it lands in the Triage queue for the user to ' +
        'review (priority/project/due) before it enters normal flow — mirroring ' +
        'Cinder\'s quick-capture. Set triage=false to put it straight in Inbox.',
      inputSchema: {
        title: z.string().max(500).describe('Task title (quick-add NLP is NOT applied)'),
        due: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?)?$/)
          .optional()
          .describe('Due date YYYY-MM-DD or ISO datetime'),
        priority: z.number().int().min(1).max(4).optional().describe('1 (highest) – 4 (lowest)'),
        projectId: z.string().uuid().optional().describe('Assign to this project'),
        triage: z.boolean().optional().describe('Place in Triage queue (default true)'),
      },
    },
    async ({ title, due, priority, projectId, triage }) => {
      const task = await tasksService.create({
        title,
        triage: triage === false ? 0 : 1,
        ...(due !== undefined ? { dueDate: due } : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(projectId !== undefined ? { projectId } : {}),
      });
      record('create_task', true, `title="${title}" triage=${triage === false ? 0 : 1}`);
      return json(task);
    },
  );

  server.registerTool(
    'complete_task',
    {
      title: 'Complete task',
      description: 'Mark a task complete (or reopen it). Returns the updated task.',
      inputSchema: {
        id: z.string().uuid().describe('The task id'),
        completed: z.boolean().optional().describe('true to complete (default), false to reopen'),
      },
    },
    async ({ id, completed }) => {
      const task = await tasksService.complete({ id, completed: completed !== false });
      record('complete_task', task !== null, `id=${id} completed=${completed !== false}`);
      return json(task);
    },
  );

  server.registerTool(
    'update_task',
    {
      title: 'Update task',
      description: 'Update a task\'s title, due date, priority, or project. Returns the updated task.',
      inputSchema: {
        id: z.string().uuid().describe('The task id'),
        title: z.string().max(500).optional(),
        due: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?)?$/)
          .optional()
          .describe('Due date YYYY-MM-DD or ISO datetime'),
        priority: z.number().int().min(1).max(4).optional(),
        projectId: z.string().uuid().nullable().optional().describe('null to remove from project'),
      },
    },
    async ({ id, title, due, priority, projectId }) => {
      const task = await tasksService.update({
        id,
        patch: {
          ...(title !== undefined ? { title } : {}),
          ...(due !== undefined ? { dueDate: due } : {}),
          ...(priority !== undefined ? { priority } : {}),
          ...(projectId !== undefined ? { projectId } : {}),
        },
      });
      record('update_task', task !== null, `id=${id}`);
      return json(task);
    },
  );
}

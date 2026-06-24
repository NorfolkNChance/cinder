import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * MCP prompt templates — one-click workflows the user can invoke in Claude.
 *
 * Each prompt seeds a user turn that drives Cinder's tools. Prompts are
 * read-only; the tools they reference enforce the read/write gate themselves.
 */

function userText(text: string): {
  messages: [{ role: 'user'; content: { type: 'text'; text: string } }];
} {
  return { messages: [{ role: 'user', content: { type: 'text', text } }] };
}

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'triage_inbox',
    {
      title: 'Triage my inbox',
      description: 'Review the Cinder triage queue and suggest priority, project, and due date.',
    },
    () =>
      userText(
        'Use the list_triage tool to fetch my Cinder triage queue. For each task, ' +
          'suggest a priority (P1–P4), a project (use list_projects), and a due date if ' +
          'one is implied. Present a concise table; do not change anything unless I ask.',
      ),
  );

  server.registerPrompt(
    'summarize_today',
    {
      title: 'Summarize today',
      description: "Summarize today's daily note and extract action items.",
    },
    () =>
      userText(
        "Use the get_daily_note tool (default date = today) to read today's daily note, " +
          'then give me a short summary and a bulleted list of any action items or ' +
          'follow-ups you find in it.',
      ),
  );

  server.registerPrompt(
    'weekly_review',
    {
      title: 'Weekly review',
      description: 'Pull open tasks and recent notes for a weekly review.',
    },
    () =>
      userText(
        'Help me run a weekly review. Use list_tasks (scope "all") to see open tasks and ' +
          'list_notes to see recent notes. Group what is overdue, due soon, and stale, and ' +
          'suggest what to focus on this week.',
      ),
  );
}

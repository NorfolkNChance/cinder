import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { notesService } from '../services/notes';
import { record } from './audit';

/**
 * MCP resources — make the user's notes @-mentionable in Claude.
 *
 * Resources are read-only and always available (independent of the write
 * toggle). Each template exposes a `list` callback so clients can enumerate
 * concrete notes for mention/attachment, plus a read callback that returns the
 * Markdown body. All access goes through notesService (no raw SQL).
 */

/** Pick the first value of a URI-template variable (may be string or array). */
function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] ?? '' : v ?? '';
}

export function registerResources(server: McpServer): void {
  // Regular notes: cinder://note/{id}
  server.registerResource(
    'note',
    new ResourceTemplate('cinder://note/{id}', {
      list: async () => {
        const notes = await notesService.list({ limit: 100 });
        return {
          resources: notes.map((n) => ({
            uri: `cinder://note/${n.id}`,
            name: n.title || 'Untitled',
            mimeType: 'text/markdown',
          })),
        };
      },
    }),
    {
      title: 'Cinder notes',
      description: 'The user\'s notes, addressable by id and listable for @-mentions.',
    },
    async (uri, variables) => {
      const id = first(variables['id']);
      const note = await notesService.get(id);
      record('resource:note', note !== null, `id=${id}`);
      return {
        contents: [
          { uri: uri.href, mimeType: 'text/markdown', text: note ? note.body : '' },
        ],
      };
    },
  );

  // Daily notes: cinder://daily/{date}
  server.registerResource(
    'daily',
    new ResourceTemplate('cinder://daily/{date}', {
      list: async () => {
        const dailies = await notesService.list({ dailyOnly: true, limit: 60 });
        return {
          resources: dailies.map((n) => ({
            uri: `cinder://daily/${n.dailyDate}`,
            name: n.title || n.dailyDate || 'Daily note',
            mimeType: 'text/markdown',
          })),
        };
      },
    }),
    { title: 'Cinder daily notes', description: 'Daily notes addressable by date (YYYY-MM-DD).' },
    async (uri, variables) => {
      const date = first(variables['date']);
      const dailies = await notesService.list({ dailyOnly: true, limit: 1000 });
      const note = dailies.find((n) => n.dailyDate === date) ?? null;
      record('resource:daily', true, `date=${date}`);
      return {
        contents: [
          { uri: uri.href, mimeType: 'text/markdown', text: note ? note.body : '' },
        ],
      };
    },
  );
}

import { ipcMain } from 'electron';
import {
  CONNECTORS_GET_STATUS,
  CONNECTORS_SET_ENABLED,
  CONNECTORS_SET_ALLOW_WRITES,
  CONNECTORS_ROTATE_TOKEN,
  CONNECTORS_GET_AUDIT_LOG,
  CONNECTORS_GET_CLAUDE_CONFIG,
} from '../../shared/ipc/channels';
import {
  McpSetEnabledInput,
  McpSetAllowWritesInput,
  McpGetAuditLogInput,
  type McpServerStatus,
  type McpAuditEntry,
  type McpClaudeConfig,
} from '../../shared/schemas/connectors';
import { assertMainFrame } from '../security/ipc-guard';
import { settingsService } from '../services/settings';
import { getStatus, syncServerToSetting } from '../mcp/server';
import { rotateToken } from '../mcp/auth';
import { getRecent } from '../mcp/audit';
import { resolveNpx, buildClaudeDesktopConfig } from '../mcp/bridge-config';

/**
 * IPC for the `connectors` domain — the renderer's control surface for the
 * local MCP server. Follows the standard pattern: one file per domain,
 * assertMainFrame on every handler, Zod-validated payloads. The server itself
 * runs in the main process; the renderer only toggles and inspects it.
 */
export function registerConnectorsHandlers(): void {
  ipcMain.handle(CONNECTORS_GET_STATUS, async (event): Promise<McpServerStatus> => {
    assertMainFrame(event);
    return getStatus();
  });

  ipcMain.handle(CONNECTORS_SET_ENABLED, async (event, raw): Promise<McpServerStatus> => {
    assertMainFrame(event);
    const { enabled } = McpSetEnabledInput.parse(raw);
    await settingsService.set('connectors.mcp.enabled', enabled);
    await syncServerToSetting();
    return getStatus();
  });

  ipcMain.handle(CONNECTORS_SET_ALLOW_WRITES, async (event, raw): Promise<McpServerStatus> => {
    assertMainFrame(event);
    const { allowWrites } = McpSetAllowWritesInput.parse(raw);
    // No restart needed — each request rebuilds the tool set from this setting.
    await settingsService.set('connectors.mcp.allowWrites', allowWrites);
    return getStatus();
  });

  ipcMain.handle(CONNECTORS_ROTATE_TOKEN, async (event): Promise<McpServerStatus> => {
    assertMainFrame(event);
    rotateToken();
    return getStatus();
  });

  ipcMain.handle(CONNECTORS_GET_AUDIT_LOG, async (event, raw): Promise<McpAuditEntry[]> => {
    assertMainFrame(event);
    const { limit } = McpGetAuditLogInput.parse(raw);
    return getRecent(limit ?? 100);
  });

  ipcMain.handle(CONNECTORS_GET_CLAUDE_CONFIG, async (event): Promise<McpClaudeConfig> => {
    assertMainFrame(event);
    const status = await getStatus();
    // Resolve an absolute npx (nvm/Homebrew/system) so the snippet works even
    // though Claude Desktop launches without the user's shell PATH.
    const { command, binDir, found } = resolveNpx();
    const config = buildClaudeDesktopConfig({
      url: status.url,
      token: status.token,
      command,
      binDir,
    });
    return { config, npxFound: found, command };
  });
}

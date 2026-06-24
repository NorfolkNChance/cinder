import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-client';
import type { McpServerStatus, McpAuditEntry } from '../../../../shared/schemas/connectors';

/**
 * Settings → Connectors. Controls the local MCP server that lets Claude
 * connect to Cinder as a custom connector.
 *
 * Unlike the other settings sections, this one is self-contained: it reads
 * connector status and the audit log directly via `window.api.connectors.*`
 * (which also start/stop the loopback server) rather than going through the
 * generic settings object. See ADR-0011 and CLAUDE.md "MCP Connector".
 */
export function ConnectorsSection(): JSX.Element {
  const qc = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);

  const { data: status, isLoading } = useQuery<McpServerStatus>({
    queryKey: queryKeys.connectors.status(),
    queryFn: () => window.api.connectors.getStatus(),
    staleTime: Infinity,
  });

  const setStatus = (s: McpServerStatus): void => {
    qc.setQueryData(queryKeys.connectors.status(), s);
  };

  const enableMut = useMutation<McpServerStatus, Error, boolean>({
    mutationFn: (enabled) => window.api.connectors.setEnabled({ enabled }),
    onSuccess: setStatus,
  });
  const writesMut = useMutation<McpServerStatus, Error, boolean>({
    mutationFn: (allowWrites) => window.api.connectors.setAllowWrites({ allowWrites }),
    onSuccess: setStatus,
  });
  const rotateMut = useMutation<McpServerStatus, Error, void>({
    mutationFn: () => window.api.connectors.rotateToken(),
    onSuccess: (s) => {
      setStatus(s);
      void qc.invalidateQueries({ queryKey: queryKeys.connectors.auditLog() });
    },
  });

  const copy = (label: string, text: string): void => {
    void navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  if (isLoading || !status) {
    return (
      <section>
        <SectionHeading icon="🔌" title="Connectors" />
        <p className="text-sm text-gray-500">Loading…</p>
      </section>
    );
  }

  // Paste-ready Claude Desktop config. Claude Desktop can't reach a local HTTP
  // server through its "Add custom connector" box (that requires a public https
  // URL); it bridges to local servers over stdio via `mcp-remote`. We keep the
  // real token in the env block (referenced by the header) rather than the args.
  const claudeConfig = JSON.stringify(
    {
      mcpServers: {
        cinder: {
          command: 'npx',
          args: [
            '-y',
            'mcp-remote',
            status.url,
            '--transport',
            'http-only',
            '--header',
            'Authorization: Bearer ${CINDER_TOKEN}',
          ],
          env: { CINDER_TOKEN: status.token },
        },
      },
    },
    null,
    2,
  );

  return (
    <section>
      <SectionHeading icon="🔌" title="Connectors (Claude)" />
      <p className="mb-4 text-[12px] text-gray-500 dark:text-gray-500">
        Run a local server so Claude (Desktop) can connect to Cinder as a custom connector
        and search your notes and tasks. It binds to{' '}
        <span className="font-mono text-[11px]">127.0.0.1</span> only, requires the secret
        token below, and runs only while Cinder is open.
      </p>

      <Field
        label="Enable connector"
        description="Starts a loopback MCP server. Off by default — nothing listens until you turn this on."
      >
        <Toggle
          checked={status.enabled}
          onChange={(v) => enableMut.mutate(v)}
          label="Enable connector"
        />
      </Field>

      {status.enabled && (
        <>
          <div className="mb-4 flex items-center gap-2 text-[12px]">
            <StatusPill running={status.running} />
            {status.running && (
              <span className="text-gray-500 dark:text-gray-500">
                listening on port{' '}
                <span className="font-mono">{status.boundPort ?? status.port}</span>
              </span>
            )}
          </div>

          {/* Connection details */}
          <CopyRow
            label="Connector URL"
            value={status.url}
            copied={copied === 'url'}
            onCopy={() => copy('url', status.url)}
          />
          <CopyRow
            label="Token"
            value={status.token}
            mono
            copied={copied === 'token'}
            onCopy={() => copy('token', status.token)}
          />

          {/* Claude Desktop setup — the loopback server is reached over a
              stdio bridge (mcp-remote), NOT the "Add custom connector" URL box
              (which only accepts public https URLs). */}
          <div className="mb-5 mt-3 rounded border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[12px] font-medium text-gray-700 dark:text-gray-300">
                Connect Claude Desktop
              </p>
              <button
                onClick={() => copy('config', claudeConfig)}
                className="flex-shrink-0 rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200"
              >
                {copied === 'config' ? 'Copied!' : 'Copy config'}
              </button>
            </div>
            <p className="mb-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-500">
              Claude Desktop reaches local servers through its config file — its
              &ldquo;Add custom connector&rdquo; box only accepts public{' '}
              <span className="font-mono">https</span> URLs. Paste the config below into{' '}
              <span className="font-mono">
                ~/Library/Application Support/Claude/claude_desktop_config.json
              </span>{' '}
              (create it if it doesn&apos;t exist), then fully quit and reopen Claude Desktop.
            </p>
            <pre className="max-h-44 overflow-auto rounded bg-gray-100 p-2 font-mono text-[10px] leading-relaxed text-gray-700 dark:bg-gray-900 dark:text-gray-300">
              {claudeConfig}
            </pre>
            <p className="mt-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-600">
              Requires Node.js (<span className="font-mono">npx</span>) on your PATH. The bridge
              (<span className="font-mono">mcp-remote</span>) relays Claude to this server using
              the token above. The raw URL and token are also shown for other MCP clients.
            </p>
          </div>

          <Field
            label="Allow writes"
            description="Let Claude create and update notes/tasks (captured tasks land in Triage). Off by default — Claude can only read until you enable this."
          >
            <Toggle
              checked={status.allowWrites}
              onChange={(v) => writesMut.mutate(v)}
              label="Allow writes"
            />
          </Field>

          <div className="mb-5 flex items-center gap-3">
            <button
              onClick={() => rotateMut.mutate()}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200"
            >
              Rotate token…
            </button>
            <span className="text-[11px] text-gray-500 dark:text-gray-600">
              Rotating invalidates the current URL — you'll need to re-paste it into Claude.
            </span>
          </div>

          <AuditLog enabled={status.enabled} />
        </>
      )}
    </section>
  );
}

// ── Audit log ─────────────────────────────────────────────────────────────────

function AuditLog({ enabled }: { enabled: boolean }): JSX.Element {
  const qc = useQueryClient();
  const { data: entries } = useQuery<readonly McpAuditEntry[]>({
    queryKey: queryKeys.connectors.auditLog(),
    queryFn: () => window.api.connectors.getAuditLog({ limit: 50 }),
    enabled,
    staleTime: Infinity,
  });

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-sm text-gray-700 dark:text-gray-300">Recent activity</p>
        <button
          onClick={() =>
            void qc.invalidateQueries({ queryKey: queryKeys.connectors.auditLog() })
          }
          className="text-[11px] text-gray-500 underline transition-colors hover:text-gray-700 dark:text-gray-600 dark:hover:text-gray-400"
        >
          Refresh
        </button>
      </div>
      <div className="max-h-40 overflow-y-auto rounded border border-gray-200 bg-white text-[11px] dark:border-gray-800 dark:bg-gray-950">
        {!entries || entries.length === 0 ? (
          <p className="px-3 py-2 text-gray-500 dark:text-gray-600">
            No connector activity yet.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {entries.map((e, i) => (
              <li key={i} className="flex items-center gap-2 px-3 py-1.5">
                <span className={e.ok ? 'text-emerald-500' : 'text-rose-500'}>
                  {e.ok ? '✓' : '✕'}
                </span>
                <span className="font-mono text-gray-700 dark:text-gray-300">{e.tool}</span>
                <span className="flex-1 truncate text-gray-500 dark:text-gray-500">
                  {e.summary}
                </span>
                <span className="flex-shrink-0 tabular-nums text-gray-400 dark:text-gray-600">
                  {new Date(e.ts).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Small building blocks ───────────────────────────────────────────────────

function StatusPill({ running }: { running: boolean }): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        running
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
          : 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${running ? 'bg-emerald-500' : 'bg-gray-400'}`} />
      {running ? 'Running' : 'Stopped'}
    </span>
  );
}

function CopyRow({
  label,
  value,
  mono,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copied: boolean;
  onCopy: () => void;
}): JSX.Element {
  return (
    <div className="mb-2">
      <label className="mb-1 block text-[11px] text-gray-500 dark:text-gray-500">{label}</label>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className={`flex-1 truncate rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800 focus:border-indigo-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 ${
            mono ? 'font-mono' : ''
          }`}
          aria-label={label}
        />
        <button
          onClick={onCopy}
          className="flex-shrink-0 rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}): JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900 ${
        checked ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function SectionHeading({ icon, title }: { icon: string; title: string }): JSX.Element {
  return (
    <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
      <span>{icon}</span>
      <span>{title}</span>
    </h3>
  );
}

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="mb-5 flex items-start justify-between gap-6">
      <div className="flex-1">
        <p className="text-sm text-gray-700 dark:text-gray-300">{label}</p>
        <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-600">{description}</p>
      </div>
      <div className="flex-shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

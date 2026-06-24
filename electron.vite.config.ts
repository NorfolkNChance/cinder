import { resolve } from 'path';
import type { Plugin } from 'vite';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

/**
 * Force-externalise specific IDs by returning `{ external: true }` from
 * resolveId. Used for the @mapbox/node-pre-gyp chain (a transitive native
 * loader pulled in by @journeyapps/sqlcipher) and its optional test-only
 * deps (mock-aws-s3, aws-sdk, nock) which node-pre-gyp lazy-requires inside
 * a `process.env.node_pre_gyp_mock_s3` guard never set in production.
 *
 * These must stay as runtime require() calls — native modules use
 * __dirname / require.resolve at load time to find their .node binaries
 * and package.json, which breaks the moment Rollup inlines them.
 */
function forceExternal(ids: readonly string[]): Plugin {
  const set = new Set(ids);
  return {
    name: 'force-external',
    enforce: 'pre',
    resolveId(id) {
      if (set.has(id)) return { id, external: true };
      for (const target of set) {
        if (id === target || id.startsWith(target + '/')) {
          return { id, external: true };
        }
      }
      return null;
    },
  };
}

export default defineConfig({
  main: {
    plugins: [
      forceExternal(['@mapbox/node-pre-gyp', 'mock-aws-s3', 'aws-sdk', 'nock']),
      // Bundle the MCP SDK (and its transitive deps) into the main output
      // rather than externalising it. The SDK is ESM-only ("type": "module"
      // with an exports map); leaving it external would emit a require() of an
      // ESM package from the CJS main bundle, which is fragile across Node/
      // Electron versions. Bundling converts it to CJS at build time. It is
      // pure JS (no native bindings), so this is safe.
      externalizeDepsPlugin({ exclude: ['@modelcontextprotocol/sdk'] }),
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared'),
        // Drop Excalidraw's heavy, advisory-carrying Mermaid import feature
        // (~5MB of mermaid/katex/cytoscape) — Cinder is a sketch tool. See
        // src/renderer/src/features/draw/mermaidStub.ts.
        '@excalidraw/mermaid-to-excalidraw': resolve(
          __dirname,
          'src/renderer/src/features/draw/mermaidStub.ts',
        ),
      },
    },
  },
});

/**
 * Minimal local declaration for Vite's `import.meta.glob` so we can use it
 * from the main-process bundle (electron-vite uses Vite under the hood).
 *
 * `vite/client` would pull in renderer-only ambient types (CSS modules,
 * asset imports, HMR, etc.) which don't belong in the Node main process.
 * Only the glob signature we actually use is declared here.
 */
interface ImportMeta {
  readonly glob: <T = unknown>(
    pattern: string | readonly string[],
    options?: {
      readonly query?: string;
      readonly import?: string;
      readonly eager?: boolean;
    },
  ) => Record<string, T>;
}

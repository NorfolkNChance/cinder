/**
 * Stub for `@excalidraw/mermaid-to-excalidraw`.
 *
 * Excalidraw lazily `import()`s that package only for its "Mermaid to
 * Excalidraw" dialog. It is heavy (~5 MB: mermaid + katex + cytoscape +
 * dozens of diagram chunks) and carries a known transitive advisory we don't
 * want in the bundle. Cinder is a sketch tool, not a Mermaid renderer, so we
 * alias the package to this stub in electron.vite.config.ts — the dialog still
 * opens but a paste/convert throws, which Excalidraw surfaces as an inline
 * error. Nothing else in the editor depends on it.
 *
 * If Mermaid import is ever wanted, remove the alias and add the dependency
 * back (and re-audit it).
 */

const DISABLED = 'Mermaid import is disabled in Cinder.';

export function parseMermaidToExcalidraw(): Promise<never> {
  return Promise.reject(new Error(DISABLED));
}

export function mermaidToExcalidraw(): Promise<never> {
  return Promise.reject(new Error(DISABLED));
}

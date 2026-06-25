import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

/**
 * In-document find — a TipTap/ProseMirror extension that highlights every
 * case-insensitive occurrence of a search term in the editor, tracks a
 * "current" match for next/previous navigation, and exposes the match
 * counts to the surrounding React find bar.
 *
 * This is purely a *decoration* layer: it never mutates the document, so it
 * has no impact on the markdown serde schema and is safe to add to the
 * editor-only extension list. Matches are computed per text node, so a term
 * split across formatting boundaries (e.g. "wor**ld**") won't match — an
 * acceptable limitation for a find-in-note box, and the same behaviour most
 * ProseMirror search implementations have.
 *
 * No new dependency is pulled in — `@tiptap/pm` already ships the
 * prosemirror primitives this needs.
 */

export interface SearchHighlightState {
  query: string;
  matches: { from: number; to: number }[];
  /** Index into `matches` of the active match, or -1 when there are none. */
  current: number;
  decorations: DecorationSet;
}

export const searchHighlightKey = new PluginKey<SearchHighlightState>(
  'searchHighlight',
);

type SearchMeta =
  | { type: 'set'; query: string }
  | { type: 'clear' }
  | { type: 'next' }
  | { type: 'prev' };

const EMPTY: SearchHighlightState = {
  query: '',
  matches: [],
  current: -1,
  decorations: DecorationSet.empty,
};

/**
 * Find every case-insensitive occurrence of `query` within the text nodes
 * of `doc`, returned as ProseMirror document positions. Exported for unit
 * testing. Matches do not span node boundaries (formatting splits text
 * nodes), which is the documented limitation of this find implementation.
 */
export function findMatches(
  doc: ProseMirrorNode,
  query: string,
): { from: number; to: number }[] {
  const matches: { from: number; to: number }[] = [];
  if (query === '') return matches;
  const needle = query.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isText || node.text === undefined || node.text === null) return;
    const haystack = node.text.toLowerCase();
    let idx = haystack.indexOf(needle);
    while (idx !== -1) {
      matches.push({ from: pos + idx, to: pos + idx + needle.length });
      idx = haystack.indexOf(needle, idx + needle.length);
    }
  });
  return matches;
}

function buildDecorations(
  doc: ProseMirrorNode,
  matches: { from: number; to: number }[],
  current: number,
): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty;
  const decos = matches.map((m, i) =>
    Decoration.inline(m.from, m.to, {
      class:
        i === current
          ? 'cinder-search-match cinder-search-match-current'
          : 'cinder-search-match',
    }),
  );
  return DecorationSet.create(doc, decos);
}

function applyMeta(
  meta: SearchMeta,
  value: SearchHighlightState,
  newState: EditorState,
): SearchHighlightState {
  switch (meta.type) {
    case 'clear':
      return EMPTY;
    case 'set': {
      const matches = findMatches(newState.doc, meta.query);
      const current = matches.length > 0 ? 0 : -1;
      return {
        query: meta.query,
        matches,
        current,
        decorations: buildDecorations(newState.doc, matches, current),
      };
    }
    case 'next':
    case 'prev': {
      if (value.matches.length === 0) return value;
      const delta = meta.type === 'next' ? 1 : -1;
      const current =
        (value.current + delta + value.matches.length) % value.matches.length;
      return {
        ...value,
        current,
        decorations: buildDecorations(newState.doc, value.matches, current),
      };
    }
  }
}

export const SearchHighlight = Extension.create({
  name: 'searchHighlight',

  addCommands() {
    return {
      setSearchTerm:
        (query: string) =>
        ({ state, dispatch }) => {
          if (dispatch) {
            dispatch(
              state.tr.setMeta(searchHighlightKey, { type: 'set', query }),
            );
          }
          return true;
        },
      nextSearchResult:
        () =>
        ({ state, dispatch }) => {
          if (dispatch) {
            dispatch(state.tr.setMeta(searchHighlightKey, { type: 'next' }));
          }
          return true;
        },
      prevSearchResult:
        () =>
        ({ state, dispatch }) => {
          if (dispatch) {
            dispatch(state.tr.setMeta(searchHighlightKey, { type: 'prev' }));
          }
          return true;
        },
      clearSearch:
        () =>
        ({ state, dispatch }) => {
          if (dispatch) {
            dispatch(state.tr.setMeta(searchHighlightKey, { type: 'clear' }));
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchHighlightState>({
        key: searchHighlightKey,
        state: {
          init: () => EMPTY,
          apply(
            tr: Transaction,
            value: SearchHighlightState,
            _oldState: EditorState,
            newState: EditorState,
          ): SearchHighlightState {
            const meta = tr.getMeta(searchHighlightKey) as
              | SearchMeta
              | undefined;
            if (meta !== undefined) return applyMeta(meta, value, newState);

            // Recompute matches when the document changes under an active
            // query (e.g. the user keeps typing in the note). Keep the
            // current match index stable where possible.
            if (tr.docChanged && value.query !== '') {
              const matches = findMatches(newState.doc, value.query);
              const current =
                matches.length > 0
                  ? Math.min(Math.max(value.current, 0), matches.length - 1)
                  : -1;
              return {
                query: value.query,
                matches,
                current,
                decorations: buildDecorations(newState.doc, matches, current),
              };
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            return searchHighlightKey.getState(state)?.decorations;
          },
        },
      }),
    ];
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchHighlight: {
      /** Set the active find term (resets the current match to the first). */
      setSearchTerm: (query: string) => ReturnType;
      /** Advance to the next match, wrapping around. */
      nextSearchResult: () => ReturnType;
      /** Go to the previous match, wrapping around. */
      prevSearchResult: () => ReturnType;
      /** Clear the find term and remove all highlights. */
      clearSearch: () => ReturnType;
    };
  }
}

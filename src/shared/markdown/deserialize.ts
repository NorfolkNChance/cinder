import MarkdownIt from 'markdown-it';
import type { Node, Schema, Mark } from '@tiptap/pm/model';
import { markdownSchema } from './schema';

/**
 * Markdown deserialiser: markdown string → ProseMirror document.
 *
 * Strategy: use markdown-it as the tokeniser (no point reimplementing
 * CommonMark) and walk its token stream, building ProseMirror node
 * JSON. The schema validates structure; we just emit valid node trees.
 *
 * markdown-it produces tokens in a flat list with `_open`/`_close` pairs
 * for block nodes and a nested `children` array for inline content.
 * We render block tokens iteratively and recurse into inline children.
 */

const md: MarkdownIt = new MarkdownIt({
  html: false, // §3.6 — raw HTML is forbidden in the markdown pipeline
  linkify: false,
  breaks: false,
  typographer: false,
});

// ── Mark helpers ────────────────────────────────────────────────────────────

interface MarkType {
  bold?: Mark;
  italic?: Mark;
  code?: Mark;
  wikiLink?: Mark;
}

function activeMarks(active: MarkType): readonly Mark[] {
  const marks: Mark[] = [];
  if (active.bold) marks.push(active.bold);
  if (active.italic) marks.push(active.italic);
  if (active.code) marks.push(active.code);
  if (active.wikiLink) marks.push(active.wikiLink);
  return marks;
}

// ── Inline rendering ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Token = any; // markdown-it's Token type — opaque for our use

interface InlineNode {
  type: string;
  text?: string;
  marks?: Array<{ type: string }>;
  attrs?: Record<string, unknown>;
}

/**
 * Convert markdown-it inline tokens to ProseMirror inline nodes.
 * Tracks active marks via a small stack and applies them to text tokens.
 */
function renderInline(tokens: readonly Token[], schema: Schema): InlineNode[] {
  const out: InlineNode[] = [];
  const active: MarkType = {};

  for (const tok of tokens) {
    switch (tok.type) {
      case 'text': {
        if (tok.content === '') break;
        const marks = activeMarks(active);
        out.push({
          type: 'text',
          text: tok.content,
          ...(marks.length > 0
            ? { marks: marks.map((m) => ({ type: m.type.name })) }
            : {}),
        });
        break;
      }

      case 'strong_open':
        active.bold = schema.marks['bold']!.create();
        break;
      case 'strong_close':
        delete active.bold;
        break;

      case 'em_open':
        active.italic = schema.marks['italic']!.create();
        break;
      case 'em_close':
        delete active.italic;
        break;

      case 'code_inline': {
        const marks = [
          ...activeMarks(active),
          schema.marks['code']!.create(),
        ];
        out.push({
          type: 'text',
          text: tok.content,
          marks: marks.map((m) => ({ type: m.type.name })),
        });
        break;
      }

      case 'softbreak':
        // CommonMark: a soft line break collapses to a space in HTML.
        // Match that semantic in ProseMirror — append a space to the
        // previous text node or emit a space text node.
        out.push({ type: 'text', text: ' ' });
        break;

      case 'hardbreak':
        out.push({ type: 'hardBreak' });
        break;

      case 'link_open': {
        const attrPairs = (tok.attrs ?? []) as Array<[string, string]>;
        const attrs: Record<string, string> = {};
        for (const [k, v] of attrPairs) attrs[k] = v;
        const href = attrs['href'] ?? '';
        if (href.startsWith('wikilink:')) {
          const title = href.slice(9);
          active.wikiLink = schema.marks['wikiLink']!.create({ title });
        }
        break;
      }

      case 'link_close': {
        delete active.wikiLink;
        break;
      }

      case 'image': {
        // markdown-it stores attrs as [[name, value], ...].
        const attrPairs = (tok.attrs ?? []) as Array<[string, string]>;
        const attrs: Record<string, string> = {};
        for (const [k, v] of attrPairs) attrs[k] = v;
        const src = attrs['src'] ?? '';
        // `tok.content` is the rendered alt text. We prefer it over the
        // raw attrs['alt'] because markdown-it normalises escape
        // sequences in the content but leaves them raw in attrs['alt'].
        const alt = tok.content ?? attrs['alt'] ?? '';
        const titleAttr = attrs['title'];
        out.push({
          type: 'image',
          attrs: { src, alt, title: titleAttr ?? null },
        });
        break;
      }

      default:
        // Unknown inline token — skip silently.
        break;
    }
  }

  return mergeAdjacentText(out);
}

/**
 * Merge adjacent text nodes that have identical marks so the resulting
 * document matches the canonical form produced by ProseMirror's own
 * normalisation (which the round-trip test compares against).
 */
function mergeAdjacentText(nodes: InlineNode[]): InlineNode[] {
  const out: InlineNode[] = [];
  for (const node of nodes) {
    const last = out[out.length - 1];
    if (
      node.type === 'text' &&
      last !== undefined &&
      last.type === 'text' &&
      marksEqual(last.marks, node.marks)
    ) {
      last.text = (last.text ?? '') + (node.text ?? '');
    } else {
      out.push(node);
    }
  }
  return out.filter((n) => !(n.type === 'text' && (n.text ?? '') === ''));
}

function marksEqual(
  a: Array<{ type: string }> | undefined,
  b: Array<{ type: string }> | undefined,
): boolean {
  const aNames = (a ?? []).map((m) => m.type).sort();
  const bNames = (b ?? []).map((m) => m.type).sort();
  if (aNames.length !== bNames.length) return false;
  return aNames.every((name, i) => name === bNames[i]);
}

// ── Block rendering ─────────────────────────────────────────────────────────

interface BlockNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Array<InlineNode | BlockNode>;
}

/**
 * Convert a flat token stream into a tree of block nodes. Operates on
 * indexed iteration so nested blocks (blockquotes, lists) can consume
 * a range of tokens recursively.
 */
function renderBlocks(
  tokens: readonly Token[],
  schema: Schema,
): BlockNode[] {
  const blocks: BlockNode[] = [];
  let i = 0;

  while (i < tokens.length) {
    const tok = tokens[i] as Token;

    switch (tok.type) {
      case 'paragraph_open': {
        // Find matching close
        const closeIdx = findClose(tokens, i, 'paragraph_close');
        const inline = tokens[i + 1] as Token | undefined;
        const content =
          inline?.type === 'inline'
            ? renderInline((inline.children ?? []) as Token[], schema)
            : [];
        blocks.push({ type: 'paragraph', ...(content.length > 0 ? { content } : {}) });
        i = closeIdx + 1;
        break;
      }

      case 'heading_open': {
        const level = parseInt(tok.tag.replace('h', ''), 10);
        const closeIdx = findClose(tokens, i, 'heading_close');
        const inline = tokens[i + 1] as Token | undefined;
        const content =
          inline?.type === 'inline'
            ? renderInline((inline.children ?? []) as Token[], schema)
            : [];
        blocks.push({
          type: 'heading',
          attrs: { level },
          ...(content.length > 0 ? { content } : {}),
        });
        i = closeIdx + 1;
        break;
      }

      case 'fence':
      case 'code_block': {
        const lang = tok.info?.trim() || null;
        const text = tok.content.replace(/\n$/, ''); // trim trailing newline added by md-it
        blocks.push({
          type: 'codeBlock',
          attrs: { language: lang },
          ...(text.length > 0
            ? { content: [{ type: 'text', text }] }
            : {}),
        });
        i += 1;
        break;
      }

      case 'blockquote_open': {
        const closeIdx = findClose(tokens, i, 'blockquote_close');
        const inner = renderBlocks(tokens.slice(i + 1, closeIdx), schema);
        blocks.push({
          type: 'blockquote',
          ...(inner.length > 0 ? { content: inner } : {}),
        });
        i = closeIdx + 1;
        break;
      }

      case 'bullet_list_open':
      case 'ordered_list_open': {
        const closing =
          tok.type === 'bullet_list_open'
            ? 'bullet_list_close'
            : 'ordered_list_close';
        const closeIdx = findClose(tokens, i, closing);
        const items = renderListItems(tokens.slice(i + 1, closeIdx), schema);
        blocks.push({
          type: tok.type === 'bullet_list_open' ? 'bulletList' : 'orderedList',
          ...(items.length > 0 ? { content: items } : {}),
        });
        i = closeIdx + 1;
        break;
      }

      case 'hr':
        blocks.push({ type: 'horizontalRule' });
        i += 1;
        break;

      default:
        // Unknown block — skip token.
        i += 1;
        break;
    }
  }

  return blocks;
}

/** Find the index of a matching close token, accounting for nested same-type pairs. */
function findClose(
  tokens: readonly Token[],
  openIdx: number,
  closeType: string,
): number {
  const openType = closeType.replace('_close', '_open');
  let depth = 0;
  for (let j = openIdx; j < tokens.length; j += 1) {
    const t = tokens[j] as Token;
    if (t.type === openType) depth += 1;
    else if (t.type === closeType) {
      depth -= 1;
      if (depth === 0) return j;
    }
  }
  // Should never happen for well-formed markdown-it output.
  return tokens.length - 1;
}

function renderListItems(
  tokens: readonly Token[],
  schema: Schema,
): BlockNode[] {
  const items: BlockNode[] = [];
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i] as Token;
    if (tok.type === 'list_item_open') {
      const closeIdx = findClose(tokens, i, 'list_item_close');
      const inner = renderBlocks(tokens.slice(i + 1, closeIdx), schema);
      items.push({
        type: 'listItem',
        ...(inner.length > 0 ? { content: inner } : {}),
      });
      i = closeIdx + 1;
    } else {
      i += 1;
    }
  }
  return items;
}

/**
 * Pre-process markdown to convert Obsidian-style wiki links `[[Title]]`
 * to standard markdown link syntax `[Title](wikilink:Title)` so
 * markdown-it can tokenise them for the wikiLink mark handler.
 */
function preprocessWikiLinks(text: string): string {
  return text.replace(
    /\[\[([^\[\]]+?)(?:\|([^\[\]]+?))?\]\]/g,
    (_match, title: string, display?: string) => {
      const label = display?.trim() ?? title.trim();
      return `[${label}](wikilink:${title.trim()})`;
    },
  );
}

/**
 * Parse a markdown string into a ProseMirror Node.
 *
 * Returns a `doc` node validated against the markdownSchema. Throws if
 * the parsed structure doesn't conform — this should only happen if the
 * markdown contains unsupported constructs that produce invalid trees.
 */
export function deserialize(markdown: string, schema: Schema = markdownSchema): Node {
  const preprocessed = preprocessWikiLinks(markdown);
  const tokens = md.parse(preprocessed, {});
  const blocks = renderBlocks(tokens, schema);
  // An empty document needs at least one block per ProseMirror's doc content
  // expression (`block+` in StarterKit). Default to an empty paragraph.
  const content =
    blocks.length > 0 ? blocks : [{ type: 'paragraph' }];
  return schema.nodeFromJSON({ type: 'doc', content });
}

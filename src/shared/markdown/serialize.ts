import type { Node, Mark } from '@tiptap/pm/model';

/**
 * Custom markdown serialiser for the StarterKit baseline.
 *
 * Walks a ProseMirror document and emits CommonMark-compatible markdown
 * for the nodes/marks listed in schema.ts. Design choices:
 *   - Bold uses ** (CommonMark standard); italic uses _ to disambiguate
 *     from bold during deserialisation (the parser handles both forms).
 *   - Code marks use single backticks; inline code text containing
 *     backticks is wrapped in additional backticks per CommonMark §6.1.
 *   - Code blocks use fenced syntax with the language attribute (TipTap
 *     stores it on the codeBlock node as `language`).
 *   - Lists emit one item per line; nested lists are indented by 2 spaces
 *     per nesting level (CommonMark §5.2 sublists).
 *   - Block-level nodes are separated by a single blank line.
 *
 * Round-trip correctness is enforced by property tests in
 * round-trip.test.ts.
 *
 * Known limitations:
 *   - Two adjacent same-type lists (e.g. `bulletList` followed by
 *     `bulletList`) cannot be distinguished in CommonMark — both render
 *     to the same `-` markers and are re-parsed as one list. The
 *     editor's normalisation merges adjacent same-type lists in the UI
 *     so this rarely matters in practice; documents constructed
 *     programmatically should avoid the pattern.
 */

interface SerializeState {
  out: string;
  /** Stack of block-level prefixes (e.g., "> " for blockquote indent). */
  blockPrefix: string;
}

function newState(): SerializeState {
  return { out: '', blockPrefix: '' };
}

/** Escape markdown special characters in inline text. */
function escapeText(text: string): string {
  // CommonMark §2.4: backslash escapes work for all ASCII punctuation.
  // We escape characters that would otherwise start markdown syntax at
  // potentially-significant positions. We intentionally do NOT escape
  // every punctuation character — only those that would change parsing.
  return text.replace(/([\\`*_{}[\]()#+\-.!>])/g, '\\$1');
}

/** Apply a single mark's wrapping syntax around `text`. */
function applyMark(text: string, mark: Mark): string {
  switch (mark.type.name) {
    case 'bold':
      return `**${text}**`;
    case 'italic':
      return `_${text}_`;
    case 'wikiLink':
      // Emit [[Title]] syntax. The text at this point is already
      // escaped, but inside [[...]] only `]` and `\` are meaningful.
      return `[[${text}]]`;
    case 'code': {
      // Choose a backtick run not present in the text (CommonMark §6.1).
      const runs = text.match(/`+/g) ?? [];
      const longest = runs.reduce((max, r) => Math.max(max, r.length), 0);
      const fence = '`'.repeat(longest + 1);
      // Pad with a space if text starts/ends with a backtick or only
      // contains backticks, per CommonMark.
      const needsPad =
        text.startsWith('`') ||
        text.endsWith('`') ||
        /^`+$/.test(text);
      const padded = needsPad ? ` ${text} ` : text;
      return `${fence}${padded}${fence}`;
    }
    default:
      // Unknown mark — emit text verbatim. The deserialiser will not
      // recreate it, so the round-trip test will flag a mismatch.
      return text;
  }
}

/**
 * Apply all marks to a text fragment in a deterministic order so the same
 * marks always produce the same output. Code is innermost (per CommonMark
 * parsing rules — code spans don't contain other inline formatting).
 * WikiLink is also innermost — its [[...]] wrapping must use unescaped text.
 */
function applyMarks(text: string, marks: readonly Mark[], rawText?: string): string {
  // Order: code (innermost) → wikiLink → italic → bold (outermost).
  const priority = (m: Mark): number => {
    switch (m.type.name) {
      case 'code':
        return 0;
      case 'wikiLink':
        return 1;
      case 'italic':
        return 2;
      case 'bold':
        return 3;
      default:
        return 99;
    }
  };
  const sorted = [...marks].sort((a, b) => priority(a) - priority(b));

  let result = text;
  for (const mark of sorted) {
    // Code and wikiLink use raw (unescaped) text internally; other marks
    // wrap the already-escaped result.
    if (mark.type.name === 'code' || mark.type.name === 'wikiLink') {
      result = applyMark(rawText ?? text, mark);
      const remaining = sorted.filter(
        (m) => m.type.name !== 'code' && m.type.name !== 'wikiLink',
      );
      for (const outer of remaining) result = applyMark(result, outer);
      return result;
    }
    result = applyMark(result, mark);
  }
  return result;
}

/**
 * Escape the contents of an image alt-text per CommonMark §6.4. Inside
 * `[...]` only `]` and `\` need escaping; other markdown delimiters are
 * already deactivated by the bracket context.
 */
function escapeImageAlt(text: string): string {
  return text.replace(/([\\\]])/g, '\\$1');
}

/**
 * Render inline content (text + hardBreak + image with marks).
 *
 * Image is an inline node per the schema configuration; emit it using
 * CommonMark's `![alt](src "title")` syntax. The URL is wrapped in
 * angle brackets so any URL — including those with parentheses or
 * spaces — is safe without per-character escaping.
 */
function renderInline(node: Node): string {
  let out = '';
  node.forEach((child) => {
    if (child.isText) {
      const raw = child.text ?? '';
      const escaped = escapeText(raw);
      out += applyMarks(escaped, child.marks, raw);
    } else if (child.type.name === 'hardBreak') {
      // CommonMark: two trailing spaces before a newline is a hard break.
      out += '  \n';
    } else if (child.type.name === 'image') {
      const src = (child.attrs['src'] as string | undefined) ?? '';
      const alt = (child.attrs['alt'] as string | null | undefined) ?? '';
      const title = child.attrs['title'] as string | null | undefined;
      const altPart = escapeImageAlt(alt);
      const titlePart =
        title !== null && title !== undefined && title.length > 0
          ? ` "${title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
          : '';
      out += `![${altPart}](<${src}>${titlePart})`;
    }
  });
  return out;
}

/** Prefix every line of `s` with `prefix`. Used by blockquote nesting. */
function prefixLines(s: string, prefix: string): string {
  return s
    .split('\n')
    .map((line) => prefix + line)
    .join('\n');
}

function renderList(
  node: Node,
  ordered: boolean,
  state: SerializeState,
): string {
  let out = '';
  let i = 1;
  node.forEach((item) => {
    const marker = ordered ? `${i}. ` : '- ';
    const indent = ' '.repeat(marker.length);

    // listItem children are block nodes (typically paragraphs).
    // Render them, then indent continuation lines.
    let itemOut = '';
    item.forEach((child, _offset, idx) => {
      if (idx > 0) itemOut += '\n\n';
      itemOut += renderBlock(child, state);
    });

    const lines = itemOut.split('\n');
    const indented = lines
      .map((line, idx) => (idx === 0 ? marker + line : indent + line))
      .join('\n');

    out += indented + '\n';
    i += 1;
  });
  return out.replace(/\n$/, '');
}

/**
 * Render a table cell's content to a single line of inline markdown.
 *
 * GFM pipe-table cells are single-line and pipe-delimited, so:
 *   - `|` is escaped as `\|` (GFM strips the escape at row-split time,
 *     before inline parsing — this works even around code spans);
 *   - any newline the content produces (hard breaks, multiple paragraphs)
 *     is collapsed to a space. Multi-block cells are therefore lossy;
 *     the editor UI keeps cells to a single paragraph.
 */
function renderTableCell(cell: Node): string {
  let out = '';
  cell.forEach((child, _offset, idx) => {
    if (idx > 0) out += ' ';
    out += renderInline(child);
  });
  return out.replace(/\n/g, ' ').replace(/\|/g, '\\|').trim();
}

/**
 * Emit a GFM pipe table. The first row is rendered as the header row
 * (GFM requires one); remaining rows are the body. Merged cells have no
 * pipe-table representation — a cell spanning N columns is emitted once
 * followed by N−1 empty cells so column counts stay consistent.
 */
function renderTable(node: Node): string {
  const rows: string[][] = [];
  node.forEach((row) => {
    const cells: string[] = [];
    row.forEach((cell) => {
      cells.push(renderTableCell(cell));
      const colspan = (cell.attrs['colspan'] as number | undefined) ?? 1;
      for (let k = 1; k < colspan; k += 1) cells.push('');
    });
    rows.push(cells);
  });
  if (rows.length === 0) return '';

  const columns = rows.reduce((max, r) => Math.max(max, r.length), 1);
  const line = (cells: string[]): string => {
    const padded = [...cells];
    while (padded.length < columns) padded.push('');
    return `| ${padded.join(' | ')} |`;
  };

  const header = rows[0] ?? [];
  const out = [line(header), `|${' --- |'.repeat(columns)}`];
  for (const row of rows.slice(1)) out.push(line(row));
  return out.join('\n');
}

function renderBlock(node: Node, state: SerializeState): string {
  switch (node.type.name) {
    case 'paragraph':
      return renderInline(node);

    case 'heading': {
      const level = (node.attrs['level'] as number) ?? 1;
      const hashes = '#'.repeat(Math.min(Math.max(level, 1), 6));
      return `${hashes} ${renderInline(node)}`;
    }

    case 'blockquote': {
      let inner = '';
      node.forEach((child, _offset, idx) => {
        if (idx > 0) inner += '\n\n';
        inner += renderBlock(child, state);
      });
      return prefixLines(inner, '> ');
    }

    case 'codeBlock': {
      const lang = (node.attrs['language'] as string | null) ?? '';
      // codeBlock content is a single text child; emit verbatim, no escaping.
      let body = '';
      node.forEach((child) => {
        if (child.isText) body += child.text ?? '';
      });
      // Choose a fence length longer than any backtick run in the body.
      const runs = body.match(/`{3,}/g) ?? [];
      const longest = runs.reduce((max, r) => Math.max(max, r.length), 2);
      const fence = '`'.repeat(longest + 1);
      return `${fence}${lang}\n${body}\n${fence}`;
    }

    case 'bulletList':
      return renderList(node, false, state);

    case 'orderedList':
      return renderList(node, true, state);

    case 'horizontalRule':
      return '---';

    case 'table':
      return renderTable(node);

    default:
      // Unknown block — emit nothing. Round-trip tests will catch this
      // if an enabled extension is missing serialiser support.
      return '';
  }
}

/**
 * Serialise a ProseMirror document to a markdown string.
 *
 * The doc's top-level children are block nodes; they are separated by a
 * single blank line. The output has no trailing newline so the inverse
 * pairing (deserialise) sees consistent input.
 */
export function serialize(doc: Node): string {
  const state = newState();
  const blocks: string[] = [];
  doc.forEach((child) => {
    blocks.push(renderBlock(child, state));
  });
  return blocks.join('\n\n');
}

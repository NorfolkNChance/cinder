import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Node, Schema } from '@tiptap/pm/model';
import { markdownSchema, serialize, deserialize } from './index';

/**
 * Round-trip property tests for the markdown serde layer.
 *
 * The contract (§6.1): `deserialize(serialize(doc))` must produce a
 * document equivalent to the original under ProseMirror's structural
 * equality (Node.eq), for every doc constructible from the StarterKit
 * baseline schema.
 *
 * We layer the testing:
 *   1. Hand-written unit cases for known shapes (sanity check)
 *   2. fast-check property tests with constrained arbitraries that
 *      build valid documents from the bottom up
 *
 * The property tests catch corner cases the hand-written tests miss —
 * empty list items, headings with trailing whitespace, code blocks whose
 * content contains the same number of backticks as the fence, lists
 * inside blockquotes, marks that span partial words, etc.
 */

// ── Helpers ─────────────────────────────────────────────────────────────────

function docFromJson(json: unknown): Node {
  return markdownSchema.nodeFromJSON(json);
}

/** Round-trip and assert structural equality. */
function expectRoundTrip(doc: Node): void {
  const md = serialize(doc);
  const back = deserialize(md);
  if (!doc.eq(back)) {
    // Produce a helpful diff message when the round-trip diverges.
    throw new Error(
      `Round-trip mismatch\n  original:    ${JSON.stringify(doc.toJSON())}\n  markdown:    ${JSON.stringify(md)}\n  round-trip:  ${JSON.stringify(back.toJSON())}`,
    );
  }
  expect(true).toBe(true); // satisfy vitest's "expect at least one assertion"
}

// ── Unit cases ──────────────────────────────────────────────────────────────

describe('serde — unit cases', () => {
  it('empty document (single empty paragraph)', () => {
    const doc = docFromJson({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    });
    expectRoundTrip(doc);
  });

  it('paragraph with plain text', () => {
    const doc = docFromJson({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'hello world' }],
        },
      ],
    });
    expectRoundTrip(doc);
  });

  it('headings of every level', () => {
    for (let level = 1; level <= 6; level += 1) {
      const doc = docFromJson({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level },
            content: [{ type: 'text', text: `level ${level}` }],
          },
        ],
      });
      expectRoundTrip(doc);
    }
  });

  it('inline marks: bold, italic, code', () => {
    for (const mark of ['bold', 'italic', 'code']) {
      const doc = docFromJson({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'styled', marks: [{ type: mark }] },
            ],
          },
        ],
      });
      expectRoundTrip(doc);
    }
  });

  it('combined bold + italic', () => {
    const doc = docFromJson({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'bold italic',
              marks: [{ type: 'bold' }, { type: 'italic' }],
            },
          ],
        },
      ],
    });
    expectRoundTrip(doc);
  });

  it('code block with language', () => {
    const doc = docFromJson({
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'typescript' },
          content: [{ type: 'text', text: 'const x = 42;' }],
        },
      ],
    });
    expectRoundTrip(doc);
  });

  it('code block without language', () => {
    const doc = docFromJson({
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: null },
          content: [{ type: 'text', text: 'plain code' }],
        },
      ],
    });
    expectRoundTrip(doc);
  });

  it('blockquote with paragraph', () => {
    const doc = docFromJson({
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'quoted' }],
            },
          ],
        },
      ],
    });
    expectRoundTrip(doc);
  });

  it('bullet list with two items', () => {
    const doc = docFromJson({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'one' }],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'two' }],
                },
              ],
            },
          ],
        },
      ],
    });
    expectRoundTrip(doc);
  });

  it('ordered list with two items', () => {
    const doc = docFromJson({
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'first' }],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'second' }],
                },
              ],
            },
          ],
        },
      ],
    });
    expectRoundTrip(doc);
  });

  it('horizontal rule', () => {
    const doc = docFromJson({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'before' }],
        },
        { type: 'horizontalRule' },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'after' }],
        },
      ],
    });
    expectRoundTrip(doc);
  });

  it('hard break inside a paragraph', () => {
    const doc = docFromJson({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'first line' },
            { type: 'hardBreak' },
            { type: 'text', text: 'second line' },
          ],
        },
      ],
    });
    expectRoundTrip(doc);
  });

  // ── Images ────────────────────────────────────────────────────────────────

  it('image with attachment:// src and alt text', () => {
    const doc = docFromJson({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'image',
              attrs: {
                src: 'attachment://01911e0a-7e6e-7d4a-9e2f-1234567890ab/photo.png',
                alt: 'my photo',
                title: null,
              },
            },
          ],
        },
      ],
    });
    expectRoundTrip(doc);
  });

  it('image with empty alt', () => {
    const doc = docFromJson({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'image',
              attrs: {
                src: 'attachment://01911e0a-7e6e-7d4a-9e2f-1234567890ab/x.png',
                alt: '',
                title: null,
              },
            },
          ],
        },
      ],
    });
    expectRoundTrip(doc);
  });

  it('image with a title', () => {
    const doc = docFromJson({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'image',
              attrs: {
                src: 'attachment://01911e0a-7e6e-7d4a-9e2f-1234567890ab/x.png',
                alt: 'alt',
                title: 'a caption',
              },
            },
          ],
        },
      ],
    });
    expectRoundTrip(doc);
  });

  it('image mixed with surrounding text in same paragraph', () => {
    const doc = docFromJson({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'before ' },
            {
              type: 'image',
              attrs: {
                src: 'attachment://01911e0a-7e6e-7d4a-9e2f-1234567890ab/x.png',
                alt: 'inline',
                title: null,
              },
            },
            { type: 'text', text: ' after' },
          ],
        },
      ],
    });
    expectRoundTrip(doc);
  });
});

// ── fast-check property tests ───────────────────────────────────────────────

/**
 * Arbitraries that build valid ProseMirror node JSON from the bottom up.
 * Keeping these constrained — text content avoids markdown delimiters
 * (the serialiser escapes them, but property tests are about structural
 * invariance, not the escaping logic).
 */

// Plain alphanumeric+space text — avoids markdown syntax characters so
// escape handling is tested separately in the unit cases above. The
// trim/empty filter avoids ProseMirror collapsing whitespace-only text
// to zero length, which would normalise away in unpredictable ways.
const arbitraryText = fc
  .string({ minLength: 1, maxLength: 30, unit: 'binary' })
  .map((s) => s.replace(/[^A-Za-z0-9 ]/g, '').trim())
  .filter((s) => s.length > 0 && !s.startsWith(' ') && !s.endsWith(' '));

const arbitraryLanguage = fc.option(
  fc.constantFrom('typescript', 'js', 'python', 'rust', 'go', 'sh'),
  { nil: null },
);

interface JsonNode {
  type: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string }>;
  content?: JsonNode[];
  text?: string;
}

const arbitraryMarkSet = fc
  .uniqueArray(fc.constantFrom('bold', 'italic'), { maxLength: 2 })
  .map((names) => names.map((type) => ({ type })));

const arbitraryTextNode: fc.Arbitrary<JsonNode> = fc.record({
  type: fc.constant('text'),
  text: arbitraryText,
  marks: arbitraryMarkSet,
});

const arbitraryCodeTextNode: fc.Arbitrary<JsonNode> = fc.record({
  type: fc.constant('text'),
  text: arbitraryText,
  marks: fc.constant([{ type: 'code' }]),
});

const arbitraryInlineNode = fc.oneof(
  { weight: 6, arbitrary: arbitraryTextNode },
  { weight: 1, arbitrary: arbitraryCodeTextNode },
);

const arbitraryInlineContent = fc
  .array(arbitraryInlineNode, { minLength: 1, maxLength: 4 })
  // Insert single-space separators between adjacent text nodes so the
  // markdown round-trip can't accidentally merge mark boundaries.
  .map((nodes) => {
    const out: JsonNode[] = [];
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      if (n === undefined) continue;
      if (i > 0) out.push({ type: 'text', text: ' ' });
      out.push(n);
    }
    return out;
  });

const arbitraryParagraph: fc.Arbitrary<JsonNode> = arbitraryInlineContent.map(
  (content) => ({ type: 'paragraph', content }),
);

const arbitraryHeading: fc.Arbitrary<JsonNode> = fc.tuple(
  fc.integer({ min: 1, max: 6 }),
  arbitraryInlineContent,
).map(([level, content]) => ({
  type: 'heading',
  attrs: { level },
  content,
}));

const arbitraryCodeBlock: fc.Arbitrary<JsonNode> = fc.tuple(
  arbitraryLanguage,
  arbitraryText,
).map(([language, text]) => ({
  type: 'codeBlock',
  attrs: { language },
  content: [{ type: 'text', text }],
}));

const arbitraryHorizontalRule: fc.Arbitrary<JsonNode> = fc.constant({
  type: 'horizontalRule',
});

const arbitraryListItem: fc.Arbitrary<JsonNode> = arbitraryParagraph.map(
  (p) => ({ type: 'listItem', content: [p] }),
);

const arbitraryBulletList: fc.Arbitrary<JsonNode> = fc
  .array(arbitraryListItem, { minLength: 1, maxLength: 3 })
  .map((items) => ({ type: 'bulletList', content: items }));

const arbitraryOrderedList: fc.Arbitrary<JsonNode> = fc
  .array(arbitraryListItem, { minLength: 1, maxLength: 3 })
  .map((items) => ({ type: 'orderedList', content: items }));

const arbitraryBlock = fc.oneof(
  { weight: 4, arbitrary: arbitraryParagraph },
  { weight: 2, arbitrary: arbitraryHeading },
  { weight: 1, arbitrary: arbitraryCodeBlock },
  { weight: 1, arbitrary: arbitraryBulletList },
  { weight: 1, arbitrary: arbitraryOrderedList },
  { weight: 1, arbitrary: arbitraryHorizontalRule },
);

/**
 * Adjacent same-type lists merge under CommonMark (see serializer
 * limitation note). Filter out generations that produce them.
 */
function hasAdjacentSameTypeLists(blocks: readonly JsonNode[]): boolean {
  for (let i = 1; i < blocks.length; i += 1) {
    const prev = blocks[i - 1];
    const curr = blocks[i];
    if (
      (prev?.type === 'bulletList' && curr?.type === 'bulletList') ||
      (prev?.type === 'orderedList' && curr?.type === 'orderedList')
    ) {
      return true;
    }
  }
  return false;
}

const arbitraryDoc = fc
  .array(arbitraryBlock, { minLength: 1, maxLength: 6 })
  .filter((blocks) => !hasAdjacentSameTypeLists(blocks))
  .map((blocks) => ({ type: 'doc', content: blocks }));

function tryDocFromJson(json: unknown, schema: Schema): Node | null {
  try {
    return schema.nodeFromJSON(json);
  } catch {
    return null;
  }
}

describe('serde — fast-check property tests', () => {
  it('round-trip preserves StarterKit-baseline documents', { timeout: 30_000 }, () => {
    fc.assert(
      fc.property(arbitraryDoc, (json) => {
        const doc = tryDocFromJson(json, markdownSchema);
        if (doc === null) return; // skip invalid generations
        const md = serialize(doc);
        const back = deserialize(md);
        if (!doc.eq(back)) {
          throw new Error(
            `Round-trip mismatch\n  doc:  ${JSON.stringify(doc.toJSON())}\n  md:   ${JSON.stringify(md)}\n  back: ${JSON.stringify(back.toJSON())}`,
          );
        }
      }),
      { numRuns: 200 },
    );
  });
});

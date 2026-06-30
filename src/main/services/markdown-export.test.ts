import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { markdownToDocx } from './markdown-export';

/**
 * Read the main document body XML out of a generated .docx (a zip archive).
 * Concatenated `<w:t>` text content is returned for plain-text assertions.
 */
async function docxText(buf: Buffer): Promise<{ xml: string; text: string }> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml')!.async('string');
  const text = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
    .map((m) => m[1])
    .join('');
  return { xml, text };
}

// 1×1 transparent PNG (real header so the dimension reader has something to parse).
const PNG_1x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('markdownToDocx', () => {
  it('produces a valid docx zip (PK signature)', async () => {
    const buf = await markdownToDocx('# Hello\n\nWorld.');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
  });

  it('renders headings, inline marks, lists, code, and quotes', async () => {
    const md = [
      '# Title',
      '',
      'A paragraph with **bold**, *italic*, and `code`.',
      '',
      '- first',
      '- second',
      '',
      '1. one',
      '2. two',
      '',
      '> a quote',
      '',
      '```',
      'const x = 1;',
      '```',
      '',
      '[link](https://example.com)',
    ].join('\n');

    const { xml, text } = await docxText(await markdownToDocx(md));

    expect(text).toContain('Title');
    expect(text).toContain('bold');
    expect(text).toContain('italic');
    expect(text).toContain('code');
    expect(text).toContain('first');
    expect(text).toContain('one');
    expect(text).toContain('a quote');
    expect(text).toContain('const x = 1;');
    expect(text).toContain('link');
    // Heading 1 style applied.
    expect(xml).toContain('Heading1');
    // Bold + italic runs present.
    expect(xml).toContain('<w:b');
    expect(xml).toContain('<w:i');
    // External hyperlink relationship present.
    expect(xml).toContain('w:hyperlink');
  });

  it('embeds an inlined data: image', async () => {
    const buf = await markdownToDocx(`![alt](${PNG_1x1})`);
    const zip = await JSZip.loadAsync(buf);
    const media = Object.values(zip.files).filter(
      (f) => f.name.startsWith('word/media/') && !f.dir,
    );
    expect(media.length).toBe(1);
  });

  it('keeps alt text for an unsupported image format', async () => {
    const { text } = await docxText(
      await markdownToDocx('![diagram](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)'),
    );
    expect(text).toContain('[image: diagram]');
  });

  it('restarts numbering for separate ordered lists', async () => {
    const md = ['1. a', '2. b', '', 'gap', '', '1. c', '2. d'].join('\n');
    const buf = await markdownToDocx(md);
    const zip = await JSZip.loadAsync(buf);
    const numbering = await zip.file('word/numbering.xml')?.async('string');
    expect(numbering).toBeDefined();
    // Two distinct abstract numbering definitions → two independent lists.
    const abstractDefs = [...(numbering ?? '').matchAll(/<w:abstractNum\b/g)];
    expect(abstractDefs.length).toBeGreaterThanOrEqual(2);
  });
});

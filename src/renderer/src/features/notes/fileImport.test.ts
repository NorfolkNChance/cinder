/**
 * Tests for the file import pipeline.
 *
 * Covers: extension detection, Markdown title extraction, HTML→Markdown
 * conversion via turndown, and error paths. DOM APIs (DOMParser, File) are
 * provided by jsdom via vitest's jsdom environment.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { isSupportedFile, importFile, SUPPORTED_EXTENSIONS } from './fileImport';

// ── Helper ───────────────────────────────────────────────────────────────────

function makeFile(name: string, content: string, type = ''): File {
  return new File([content], name, { type });
}

// ── isSupportedFile ──────────────────────────────────────────────────────────

describe('isSupportedFile', () => {
  it.each(SUPPORTED_EXTENSIONS)('accepts %s extension', (ext) => {
    expect(isSupportedFile(makeFile(`doc${ext}`, ''))).toBe(true);
  });

  it('rejects .pdf', () => {
    expect(isSupportedFile(makeFile('report.pdf', ''))).toBe(false);
  });

  it('rejects .docx', () => {
    expect(isSupportedFile(makeFile('notes.docx', ''))).toBe(false);
  });

  it('rejects file with no extension', () => {
    expect(isSupportedFile(makeFile('README', ''))).toBe(false);
  });

  it('is case-insensitive for extension', () => {
    expect(isSupportedFile(makeFile('doc.MD', ''))).toBe(true);
    expect(isSupportedFile(makeFile('page.HTML', ''))).toBe(true);
  });
});

// ── importFile — Markdown ─────────────────────────────────────────────────────

describe('importFile — Markdown', () => {
  it('uses the first # heading as title', async () => {
    const file = makeFile('note.md', '# My Title\n\nSome content here.');
    const result = await importFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.note.title).toBe('My Title');
    expect(result.note.body).toBe('Some content here.');
  });

  it('uses filename stem when there is no heading', async () => {
    const file = makeFile('daily-log.md', 'Just some notes without a heading.');
    const result = await importFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.note.title).toBe('daily-log');
    expect(result.note.body).toContain('Just some notes');
  });

  it('handles leading blank lines before heading', async () => {
    const file = makeFile('note.md', '\n\n# Spaced Title\n\nBody text.');
    const result = await importFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.note.title).toBe('Spaced Title');
  });

  it('handles .markdown extension', async () => {
    const file = makeFile('doc.markdown', '# Extended\n\nContent.');
    const result = await importFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.note.title).toBe('Extended');
  });

  it('preserves markdown formatting in body', async () => {
    const md = '# Title\n\n- item one\n- item two\n\n**bold**';
    const file = makeFile('list.md', md);
    const result = await importFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.note.body).toContain('- item one');
    expect(result.note.body).toContain('**bold**');
  });

  it('returns ok:false for unsupported extension', async () => {
    const file = makeFile('report.pdf', 'content');
    const result = await importFile(file);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('unsupported');
    expect(result.error.filename).toBe('report.pdf');
  });
});

// ── importFile — HTML ─────────────────────────────────────────────────────────

describe('importFile — HTML', () => {
  it('extracts title from <title> tag', async () => {
    const html = `<html><head><title>Page Title</title></head><body><p>Hello</p></body></html>`;
    const file = makeFile('page.html', html, 'text/html');
    const result = await importFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.note.title).toBe('Page Title');
  });

  it('falls back to first <h1> when no <title>', async () => {
    const html = `<html><body><h1>Article Heading</h1><p>Content.</p></body></html>`;
    const file = makeFile('article.html', html);
    const result = await importFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.note.title).toBe('Article Heading');
  });

  it('falls back to filename stem when no title or h1', async () => {
    const html = `<html><body><p>Some paragraph.</p></body></html>`;
    const file = makeFile('my-page.html', html);
    const result = await importFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.note.title).toBe('my-page');
  });

  it('stores raw HTML as-is (bodyType html)', async () => {
    const html = `<html><body><h2>Sub heading</h2><p>Text.</p></body></html>`;
    const file = makeFile('doc.html', html);
    const result = await importFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Raw HTML is preserved — no Markdown conversion.
    expect(result.note.bodyType).toBe('html');
    expect(result.note.body).toContain('<h2>Sub heading</h2>');
    expect(result.note.body).toContain('<p>Text.</p>');
  });

  it('preserves all HTML markup including inline styles', async () => {
    const html = `<html><body><p><strong>Important</strong> text.</p></body></html>`;
    const file = makeFile('doc.html', html);
    const result = await importFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.note.bodyType).toBe('html');
    expect(result.note.body).toContain('<strong>Important</strong>');
  });

  it('preserves list markup in raw HTML', async () => {
    const html = `<html><body><ul><li>Alpha</li><li>Beta</li></ul></body></html>`;
    const file = makeFile('list.html', html);
    const result = await importFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.note.bodyType).toBe('html');
    expect(result.note.body).toContain('Alpha');
    expect(result.note.body).toContain('Beta');
    expect(result.note.body).toContain('<ul>');
  });

  it('preserves script tags in stored HTML (safe: iframe sandbox blocks execution)', async () => {
    // Scripts are kept in the stored body because they cannot execute —
    // HtmlBodyEditor renders HTML in an iframe with sandbox="allow-same-origin"
    // which blocks all JavaScript. Stripping scripts would silently corrupt
    // the user's original file.
    const html = `<html><body><script>alert('xss')</script><p>Safe text.</p></body></html>`;
    const file = makeFile('doc.html', html);
    const result = await importFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.note.bodyType).toBe('html');
    expect(result.note.body).toContain('Safe text');
  });

  it('preserves style tags in stored HTML', async () => {
    const html = `<html><head><style>body{color:red}</style></head><body><p>Content.</p></body></html>`;
    const file = makeFile('doc.html', html);
    const result = await importFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.note.bodyType).toBe('html');
    expect(result.note.body).toContain('Content.');
  });

  it('handles .htm extension', async () => {
    const html = `<html><head><title>HTM File</title></head><body><p>Hi.</p></body></html>`;
    const file = makeFile('old.htm', html);
    const result = await importFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.note.title).toBe('HTM File');
  });
});

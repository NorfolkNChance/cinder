/**
 * Markdown → DOCX / PDF rendering for note export.
 *
 * Both renderers consume a Markdown string in which every image is already a
 * self-contained `data:` URI (the export service inlines `attachment://`, and
 * the renderer pre-inlines live `drawing://` embeds) — so the output is fully
 * portable with no external references.
 *
 * Tokenisation reuses markdown-it (already a project dependency, used by the
 * renderer's deserialiser). We do NOT import the `src/shared/markdown` barrel
 * here — it pulls in schema.ts (TipTap/getSchema), which needs the DOM and must
 * never load in the main process. markdown-it itself is pure and DOM-free.
 *
 * Security notes:
 *   - PDF is produced by an OFFSCREEN BrowserWindow with the same hardened
 *     webPreferences as the main window plus `javascript: false`. The note HTML
 *     is static (no scripts); only data:/attachment: images and inline styles
 *     are needed, which the app CSP already permits.
 *   - The note body is the user's own local content (trusted), so the markdown-it
 *     instance allows all link/image schemes for faithful rendering; the offscreen
 *     window's CSP is still the backstop against anything executable.
 */

import { BrowserWindow, app } from 'electron';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import MarkdownIt from 'markdown-it';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ExternalHyperlink,
  ImageRun,
  HeadingLevel,
  LevelFormat,
  AlignmentType,
  BorderStyle,
  type IParagraphOptions,
  type ILevelsOptions,
} from 'docx';

// markdown-it Tokens are loosely typed; treat as opaque.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Token = any;

/** Shared markdown-it instance. `html:false` keeps raw HTML out of the pipeline. */
function makeMd(): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: false,
    typographer: false,
  });
  // Note bodies are the user's own trusted local content; allow every scheme
  // (notably data: images) so nothing is silently dropped from the export.
  md.validateLink = () => true;
  return md;
}

// ── PDF ────────────────────────────────────────────────────────────────────

const HEADING_SIZES = ['1.6em', '1.4em', '1.2em', '1.05em', '1em', '0.9em'];

/** Wrap rendered markdown HTML in a self-contained, print-styled document. */
function htmlDocument(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin: 2cm; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 12pt;
    line-height: 1.5;
    color: #1a1a1a;
    margin: 0;
  }
  h1 { font-size: ${HEADING_SIZES[0]}; }
  h2 { font-size: ${HEADING_SIZES[1]}; }
  h3 { font-size: ${HEADING_SIZES[2]}; }
  h4 { font-size: ${HEADING_SIZES[3]}; }
  h5 { font-size: ${HEADING_SIZES[4]}; }
  h6 { font-size: ${HEADING_SIZES[5]}; color: #555; }
  h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1em 0 0.5em; }
  p { margin: 0.6em 0; }
  a { color: #0a58ca; }
  img { max-width: 100%; height: auto; }
  code {
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 0.9em;
    background: #f3f3f3;
    padding: 0.1em 0.3em;
    border-radius: 3px;
  }
  pre {
    background: #f6f8fa;
    padding: 0.8em 1em;
    border-radius: 6px;
    overflow-x: auto;
  }
  pre code { background: none; padding: 0; }
  blockquote {
    margin: 0.8em 0;
    padding: 0.2em 1em;
    border-left: 3px solid #d0d0d0;
    color: #555;
  }
  ul, ol { padding-left: 1.6em; }
  li { margin: 0.2em 0; }
  hr { border: none; border-top: 1px solid #d0d0d0; margin: 1.5em 0; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #d0d0d0; padding: 0.3em 0.6em; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

/** Render Markdown to a PDF buffer via an offscreen, script-free BrowserWindow. */
export async function markdownToPdf(markdown: string): Promise<Buffer> {
  const html = htmlDocument(makeMd().render(markdown));

  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 1000,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      // No scripting needed to render static note HTML — keep it off.
      javascript: false,
    },
  });

  // Load from a temp file rather than a data: URL — inlined images can push a
  // data: URL past platform length limits.
  const tmpPath = join(
    app.getPath('temp'),
    `cinder-export-${Date.now()}-${Math.random().toString(36).slice(2)}.html`,
  );

  try {
    writeFileSync(tmpPath, html, 'utf-8');
    await win.loadFile(tmpPath);
    const data = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
    });
    return data;
  } finally {
    win.destroy();
    try {
      unlinkSync(tmpPath);
    } catch {
      // Best-effort temp cleanup; ignore failures.
    }
  }
}

// ── DOCX ─────────────────────────────────────────────────────────────────────

const DOCX_HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

/** Max on-page image width, in pixels (~ usable width of an A4 page body). */
const MAX_IMAGE_WIDTH = 600;

type DocxImageType = 'png' | 'jpg' | 'gif' | 'bmp';

/** Decode a `data:` image URI into a buffer + docx image type + pixel size. */
function decodeDataImage(
  src: string,
): { data: Buffer; type: DocxImageType; width: number; height: number } | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s.exec(src);
  if (!match) return null;
  const mime = match[1]!;
  const data = Buffer.from(match[2]!, 'base64');

  let type: DocxImageType;
  if (mime === 'image/png') type = 'png';
  else if (mime === 'image/jpeg' || mime === 'image/jpg') type = 'jpg';
  else if (mime === 'image/gif') type = 'gif';
  else if (mime === 'image/bmp') type = 'bmp';
  else return null; // svg/webp etc. — docx has no native run for these

  const size = readImageSize(data, type) ?? { width: MAX_IMAGE_WIDTH, height: 400 };
  // Cap width while preserving aspect ratio.
  let { width, height } = size;
  if (width > MAX_IMAGE_WIDTH) {
    height = Math.round((height * MAX_IMAGE_WIDTH) / width);
    width = MAX_IMAGE_WIDTH;
  }
  return { data, type, width, height };
}

/** Read intrinsic pixel dimensions from common raster image headers. */
function readImageSize(
  buf: Buffer,
  type: DocxImageType,
): { width: number; height: number } | null {
  try {
    if (type === 'png' && buf.length >= 24) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (type === 'gif' && buf.length >= 10) {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
    if (type === 'bmp' && buf.length >= 26) {
      return { width: buf.readInt32LE(18), height: Math.abs(buf.readInt32LE(22)) };
    }
    if (type === 'jpg') {
      let offset = 2; // skip SOI (0xFFD8)
      while (offset + 9 < buf.length) {
        if (buf[offset] !== 0xff) {
          offset++;
          continue;
        }
        const marker = buf[offset + 1]!;
        // SOF0..SOF15 carry the frame dimensions (excluding DHT/JPG/DAC markers).
        if (
          marker >= 0xc0 &&
          marker <= 0xcf &&
          marker !== 0xc4 &&
          marker !== 0xc8 &&
          marker !== 0xcc
        ) {
          return {
            height: buf.readUInt16BE(offset + 5),
            width: buf.readUInt16BE(offset + 7),
          };
        }
        offset += 2 + buf.readUInt16BE(offset + 2); // jump past this segment
      }
    }
  } catch {
    // Malformed header — fall back to default sizing.
  }
  return null;
}

/** Inline-run accumulator: the children of a single docx paragraph. */
type Run = TextRun | ExternalHyperlink | ImageRun;

interface InlineStyle {
  bold: boolean;
  italics: boolean;
  code: boolean;
  link?: string;
}

/** Convert one markdown-it inline token's children into docx runs. */
function inlineRuns(children: Token[]): Run[] {
  const runs: Run[] = [];
  const style: InlineStyle = { bold: false, italics: false, code: false };

  const pushText = (text: string): void => {
    if (text === '') return;
    const run = new TextRun({
      text,
      bold: style.bold,
      italics: style.italics,
      ...(style.code ? { font: 'Courier New' } : {}),
    });
    if (style.link !== undefined) {
      runs.push(new ExternalHyperlink({ children: [run], link: style.link }));
    } else {
      runs.push(run);
    }
  };

  for (const child of children) {
    switch (child.type) {
      case 'text':
        pushText(child.content);
        break;
      case 'strong_open':
        style.bold = true;
        break;
      case 'strong_close':
        style.bold = false;
        break;
      case 'em_open':
        style.italics = true;
        break;
      case 'em_close':
        style.italics = false;
        break;
      case 'code_inline': {
        const run = new TextRun({ text: child.content, font: 'Courier New' });
        if (style.link !== undefined) {
          runs.push(new ExternalHyperlink({ children: [run], link: style.link }));
        } else {
          runs.push(run);
        }
        break;
      }
      case 'link_open': {
        const href = (child.attrs as [string, string][] | null)?.find(
          ([k]) => k === 'href',
        )?.[1];
        style.link = href ?? '';
        break;
      }
      case 'link_close':
        delete style.link;
        break;
      case 'softbreak':
        pushText(' ');
        break;
      case 'hardbreak':
        runs.push(new TextRun({ break: 1 }));
        break;
      case 'image': {
        const src = (child.attrs as [string, string][] | null)?.find(
          ([k]) => k === 'src',
        )?.[1];
        const img = src ? decodeDataImage(src) : null;
        if (img) {
          runs.push(
            new ImageRun({
              type: img.type,
              data: img.data,
              transformation: { width: img.width, height: img.height },
            }),
          );
        } else {
          // Unsupported image (e.g. svg/webp, or an unresolved ref) — keep the
          // alt text so nothing silently vanishes.
          const alt = typeof child.content === 'string' ? child.content : '';
          if (alt) pushText(`[image: ${alt}]`);
        }
        break;
      }
      default:
        // Unhandled inline token — ignore.
        break;
    }
  }

  return runs;
}

interface ListFrame {
  ordered: boolean;
  /** Numbering reference for an ordered list (undefined for bullets). */
  reference?: string;
}

/** Build a fresh ordered-list numbering config (so each list restarts at 1). */
function numberingLevels(): ILevelsOptions[] {
  const formats = [
    LevelFormat.DECIMAL,
    LevelFormat.LOWER_LETTER,
    LevelFormat.LOWER_ROMAN,
  ];
  return [0, 1, 2, 3, 4].map((level) => ({
    level,
    format: formats[level % formats.length]!,
    text: `%${level + 1}.`,
    alignment: AlignmentType.START,
    style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
  }));
}

/** Convert Markdown into a DOCX buffer. */
export async function markdownToDocx(markdown: string): Promise<Buffer> {
  const tokens: Token[] = makeMd().parse(markdown, {});
  const paragraphs: Paragraph[] = [];
  const numbering: { reference: string; levels: ILevelsOptions[] }[] = [];

  const listStack: ListFrame[] = [];
  let orderedSeq = 0;
  let quoteDepth = 0;

  /** Common paragraph options derived from current list/quote context. */
  const contextOptions = (): IParagraphOptions => {
    const top = listStack[listStack.length - 1];
    const level = Math.max(0, listStack.length - 1);
    if (top) {
      return top.ordered && top.reference
        ? { numbering: { reference: top.reference, level } }
        : { bullet: { level } };
    }
    if (quoteDepth > 0) {
      return {
        indent: { left: 480 * quoteDepth },
        border: {
          left: { style: BorderStyle.SINGLE, size: 12, space: 12, color: 'CCCCCC' },
        },
      };
    }
    return {};
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t.type) {
      case 'heading_open': {
        const level = Number(t.tag.slice(1)) - 1; // h1 -> 0
        const inline = tokens[i + 1];
        paragraphs.push(
          new Paragraph({
            heading: DOCX_HEADINGS[Math.min(level, 5)]!,
            children: inline?.children ? inlineRuns(inline.children) : [],
          }),
        );
        i += 2; // skip inline + heading_close
        break;
      }
      case 'paragraph_open': {
        const inline = tokens[i + 1];
        paragraphs.push(
          new Paragraph({
            ...contextOptions(),
            children: inline?.children ? inlineRuns(inline.children) : [],
          }),
        );
        i += 2; // skip inline + paragraph_close
        break;
      }
      case 'bullet_list_open':
        listStack.push({ ordered: false });
        break;
      case 'ordered_list_open': {
        orderedSeq += 1;
        const reference = `cinder-ol-${orderedSeq}`;
        numbering.push({ reference, levels: numberingLevels() });
        listStack.push({ ordered: true, reference });
        break;
      }
      case 'bullet_list_close':
      case 'ordered_list_close':
        listStack.pop();
        break;
      case 'blockquote_open':
        quoteDepth += 1;
        break;
      case 'blockquote_close':
        quoteDepth = Math.max(0, quoteDepth - 1);
        break;
      case 'fence':
      case 'code_block': {
        const lines = String(t.content).replace(/\n$/, '').split('\n');
        for (const line of lines) {
          paragraphs.push(
            new Paragraph({
              shading: { type: 'clear', fill: 'F6F8FA' },
              children: [new TextRun({ text: line, font: 'Courier New', size: 20 })],
            }),
          );
        }
        break;
      }
      case 'hr':
        paragraphs.push(
          new Paragraph({
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, space: 1, color: 'CCCCCC' },
            },
            children: [],
          }),
        );
        break;
      default:
        // list_item_open/close and other structural tokens need no direct
        // output — their content arrives as nested paragraph tokens.
        break;
    }
  }

  if (paragraphs.length === 0) {
    paragraphs.push(new Paragraph({ children: [] }));
  }

  const doc = new Document({
    ...(numbering.length > 0 ? { numbering: { config: numbering } } : {}),
    sections: [{ children: paragraphs }],
  });

  return Packer.toBuffer(doc);
}

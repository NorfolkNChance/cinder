import { describe, it, expect } from 'vitest';
import { mapImageSrcs } from './imageSrcs';

const upper = (s: string): Promise<string | null> => Promise.resolve(s.toUpperCase());

describe('mapImageSrcs', () => {
  it('rewrites an angle-bracketed image src (the serializer format)', async () => {
    const out = await mapImageSrcs('![alt](<drawing://abc>)', upper);
    expect(out).toBe('![alt](DRAWING://ABC)');
  });

  it('rewrites a bare image src', async () => {
    const out = await mapImageSrcs('![a](attachment://n/f.png)', upper);
    expect(out).toBe('![a](ATTACHMENT://N/F.PNG)');
  });

  it('preserves alt text and a title', async () => {
    const out = await mapImageSrcs('![my alt](<drawing://x> "the title")', upper);
    expect(out).toBe('![my alt](DRAWING://X "the title")');
  });

  it('leaves images the replacer declines (returns null) untouched', async () => {
    const md = '![a](attachment://keep.png) and ![b](<drawing://x>)';
    const out = await mapImageSrcs(md, (src) =>
      Promise.resolve(src.startsWith('drawing://') ? 'DATA' : null),
    );
    expect(out).toBe('![a](attachment://keep.png) and ![b](DATA)');
  });

  it('handles multiple images and preserves surrounding text', async () => {
    const md = 'before ![one](<a://1>) middle ![two](<b://2>) after';
    const out = await mapImageSrcs(md, upper);
    expect(out).toBe('before ![one](A://1) middle ![two](B://2) after');
  });

  it('does not touch ordinary links or parenthesised prose', async () => {
    const md = 'a [link](http://x) and (parenthetical) text';
    const out = await mapImageSrcs(md, () => Promise.resolve('NOPE'));
    expect(out).toBe(md);
  });

  it('handles a long data: URI replacement without corrupting later matches', async () => {
    const data = `data:image/png;base64,${'A'.repeat(200)}`;
    const md = '![x](<drawing://1>) ![y](<drawing://2>)';
    const out = await mapImageSrcs(md, () => Promise.resolve(data));
    expect(out).toBe(`![x](${data}) ![y](${data})`);
  });
});

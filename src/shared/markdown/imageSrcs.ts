/**
 * Rewrite the destination (src) of every markdown image in a string.
 *
 * Used by the export pipeline to inline non-portable image references
 * (`attachment://`, `drawing://`) as self-contained `data:` URIs so an exported
 * `.md` renders anywhere. Pure string work — no DOM — so it is safe in both the
 * main and renderer processes (shared code is compiled under both tsconfigs).
 *
 * Matches CommonMark image syntax `![alt](dest …)` where `dest` is either an
 * angle-bracketed `<…>` URL (what the serializer emits) or a bare token. Only
 * the destination is rewritten; the alt text, optional title, and surrounding
 * punctuation are left exactly as-is.
 *
 * The replacer receives the unwrapped src and returns its replacement, or `null`
 * to leave that image untouched.
 */
export async function mapImageSrcs(
  markdown: string,
  replace: (src: string) => Promise<string | null>,
): Promise<string> {
  // g1: "![alt](" + leading whitespace; g2: the destination (<…> or bare).
  const re = /(!\[[^\]]*\]\(\s*)(<[^>]*>|[^()\s]+)/g;
  const matches = [...markdown.matchAll(re)];

  const replacements = await Promise.all(
    matches.map((m) => {
      const raw = m[2]!;
      const src = raw.startsWith('<') ? raw.slice(1, -1) : raw;
      return replace(src);
    }),
  );

  // Rewrite back-to-front so earlier edits don't shift later match indices.
  let out = markdown;
  for (let i = matches.length - 1; i >= 0; i--) {
    const next = replacements[i];
    if (next == null) continue;
    const m = matches[i]!;
    const start = m.index! + m[1]!.length;
    const end = start + m[2]!.length;
    out = out.slice(0, start) + next + out.slice(end);
  }
  return out;
}

import { describe, expect, it } from 'vitest';
import { deserialize } from '../../../../shared/markdown';
import { findMatches } from './searchHighlight';

/**
 * Unit tests for the in-document find matcher.
 *
 * findMatches walks the text nodes of a ProseMirror document and returns
 * the positions of every case-insensitive occurrence of the query. We build
 * documents through the shared markdown deserializer so the test exercises
 * the same node structure the live editor produces.
 */

describe('findMatches', () => {
  it('returns no matches for an empty query', () => {
    const doc = deserialize('hello world');
    expect(findMatches(doc, '')).toEqual([]);
  });

  it('finds a single occurrence', () => {
    const doc = deserialize('hello world');
    const matches = findMatches(doc, 'world');
    expect(matches).toHaveLength(1);
    // The match width equals the query length.
    expect(matches[0]!.to - matches[0]!.from).toBe('world'.length);
  });

  it('is case-insensitive', () => {
    const doc = deserialize('Hello HELLO hello');
    expect(findMatches(doc, 'hello')).toHaveLength(3);
  });

  it('finds multiple non-overlapping occurrences in one text node', () => {
    const doc = deserialize('aaa');
    // 'aa' should match once at position 0 (next search starts after the
    // match, so it does not double-count the overlapping window).
    expect(findMatches(doc, 'aa')).toHaveLength(1);
  });

  it('matches across separate paragraphs (separate text nodes)', () => {
    const doc = deserialize('find me\n\nfind me too');
    expect(findMatches(doc, 'find')).toHaveLength(2);
  });

  it('does not match a term split across formatting boundaries', () => {
    // "wor**ld**" splits into two text nodes ("wor" + "ld"), so "world"
    // cannot match — the documented limitation.
    const doc = deserialize('wor**ld**');
    expect(findMatches(doc, 'world')).toHaveLength(0);
    // Each fragment is independently findable.
    expect(findMatches(doc, 'wor')).toHaveLength(1);
    expect(findMatches(doc, 'ld')).toHaveLength(1);
  });
});

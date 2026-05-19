import { describe, expect, it } from 'vitest';
import { buildFtsQuery } from './notes';

/**
 * Unit tests for the FTS5 query sanitiser.
 *
 * The function takes free-text user input and produces an FTS5 MATCH
 * expression. The contract:
 *   1. Plain letter/digit tokens get prefix-matched (`token*`)
 *   2. Tokens with any non-alphanumeric character get phrase-quoted
 *   3. Internal double quotes inside a token are escaped per FTS5 syntax
 *      (doubled, not backslashed)
 *   4. Multiple tokens are AND'd together
 *   5. Empty input returns null (caller short-circuits to empty results)
 *
 * Locking these down at unit-test level: user input is the primary
 * attack surface for FTS5 parse errors. A malformed MATCH would
 * surface as an error at runtime — these tests catch any regression
 * that would let bad input through.
 */

describe('buildFtsQuery', () => {
  // ── Empty / whitespace ──────────────────────────────────────────────────

  it('returns null for empty input', () => {
    expect(buildFtsQuery('')).toBeNull();
  });

  it('returns null for whitespace-only input', () => {
    expect(buildFtsQuery('   \t \n')).toBeNull();
  });

  // ── Single clean tokens ─────────────────────────────────────────────────

  it('prefix-matches a single alphanumeric token', () => {
    expect(buildFtsQuery('hello')).toBe('hello*');
  });

  it('prefix-matches a token containing digits', () => {
    expect(buildFtsQuery('cinder42')).toBe('cinder42*');
  });

  it('prefix-matches a non-ASCII token (unicode letters)', () => {
    // The validator uses \p{L} so accented characters and other scripts
    // get the prefix treatment rather than being forced to phrase-match.
    expect(buildFtsQuery('café')).toBe('café*');
  });

  // ── Tokens with punctuation get phrase-quoted ───────────────────────────

  it("phrase-quotes a token containing an apostrophe", () => {
    expect(buildFtsQuery("don't")).toBe('"don\'t"');
  });

  it('phrase-quotes a token containing a hyphen', () => {
    expect(buildFtsQuery('check-in')).toBe('"check-in"');
  });

  it('phrase-quotes a token containing a period', () => {
    expect(buildFtsQuery('e.g')).toBe('"e.g"');
  });

  it('phrase-quotes a token containing internal double quotes (escaped)', () => {
    // FTS5 escapes internal double quotes by doubling them, not backslashing.
    expect(buildFtsQuery('say"hi')).toBe('"say""hi"');
  });

  // ── Multi-token queries ─────────────────────────────────────────────────

  it('ANDs multiple clean tokens', () => {
    expect(buildFtsQuery('hello world')).toBe('hello* AND world*');
  });

  it('ANDs a mix of clean and phrase-quoted tokens', () => {
    expect(buildFtsQuery("hello don't world")).toBe(
      "hello* AND \"don't\" AND world*",
    );
  });

  it('collapses any whitespace run into a single AND separator', () => {
    expect(buildFtsQuery('hello\t\n   world')).toBe('hello* AND world*');
  });

  it('trims leading/trailing whitespace', () => {
    expect(buildFtsQuery('  hello  ')).toBe('hello*');
  });

  // ── Adversarial inputs ──────────────────────────────────────────────────

  it('does not let a token starting with NOT slip into the operator slot', () => {
    // FTS5 has unary NOT but only as an operator between expressions.
    // A bare 'NOT' token must be treated as a phrase, not as the
    // unary-NOT keyword, otherwise a search for 'NOT cat' would
    // negate all matches.
    //
    // Our sanitiser handles this implicitly because 'NOT' is all
    // letters → gets prefix-matched as 'NOT*'. FTS5 then treats 'NOT*'
    // as a search term, not as the NOT operator.
    expect(buildFtsQuery('NOT cat')).toBe('NOT* AND cat*');
  });

  it('does not allow OR keyword to combine clauses', () => {
    // Same reasoning as NOT — user input never composes FTS5 operators.
    expect(buildFtsQuery('cat OR dog')).toBe('cat* AND OR* AND dog*');
  });

  it('phrase-quotes a token containing an asterisk', () => {
    // The user typing "*" should not get free wildcard injection.
    expect(buildFtsQuery('foo*bar')).toBe('"foo*bar"');
  });

  it('phrase-quotes a token containing parens', () => {
    // FTS5 uses parens for grouping; raw parens would cause a parse error.
    expect(buildFtsQuery('foo)bar')).toBe('"foo)bar"');
  });
});

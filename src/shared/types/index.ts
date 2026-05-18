// Shared type definitions between main and renderer processes

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

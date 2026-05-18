import type { Config } from 'drizzle-kit';

/**
 * Drizzle Kit configuration.
 *
 * Used by the `drizzle-kit` CLI to generate migration SQL from the schema
 * definition. It does not need a live database connection at codegen time —
 * `dbCredentials` is only consulted by `drizzle-kit studio`.
 *
 * Runtime migration application is handled by src/main/db/migrate.ts which
 * inlines the generated .sql files into the bundle via `import.meta.glob`
 * (no filesystem reads at runtime, no extraResources gymnastics).
 *
 * Per ADR-0001, Drizzle is wired to @journeyapps/sqlcipher via
 * `drizzle-orm/sqlite-proxy` because @journeyapps/sqlcipher does not have a
 * first-class Drizzle driver.
 */
export default {
  schema: './src/main/db/schema.ts',
  out: './src/main/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './dev.db',
  },
} satisfies Config;
